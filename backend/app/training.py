import json
import os
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .media import save_file
from .models import (
    Kitchen,
    ModerationEvent,
    ProofSubmission,
    QuizAttempt,
    TrainingAcknowledgement,
    TrainingModule,
    User,
)
from .security import current_user, require_admin
from .training_data import MODULES


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]


class AnswersIn(BaseModel):
    answers: list[int] = Field(min_length=1, max_length=20)


class AcknowledgementIn(BaseModel):
    understood: Literal[True]


class ProofDecisionIn(BaseModel):
    decision: str
    reason: str | None = Field(default=None, max_length=500)


def seller_kitchen(db: Session, user: User) -> Kitchen:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        raise HTTPException(404, "Create your kitchen first")
    return kitchen


def after_retraining(date: datetime, kitchen: Kitchen) -> bool:
    return kitchen.retraining_at is None or date.replace(tzinfo=timezone.utc) > kitchen.retraining_at.replace(tzinfo=timezone.utc)


def local_order_test_kitchen(db: Session, kitchen: Kitchen) -> bool:
    origin = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8080")
    owner = db.get(User, kitchen.owner_id)
    return bool(
        origin.startswith(("http://127.0.0.1:", "http://localhost:"))
        and owner and owner.email == "order-test-seller@demo.nearbites.invalid"
    )


def module_progress(db: Session, kitchen: Kitchen, module: TrainingModule) -> dict:
    quiz = db.scalar(
        select(QuizAttempt)
        .where(QuizAttempt.user_id == kitchen.owner_id, QuizAttempt.module_id == module.id)
        .order_by(QuizAttempt.submitted_at.desc())
        .limit(1)
    )
    proof = db.scalar(
        select(ProofSubmission)
        .where(ProofSubmission.user_id == kitchen.owner_id, ProofSubmission.module_id == module.id)
        .order_by(ProofSubmission.submitted_at.desc())
        .limit(1)
    )
    quiz_passed = bool(quiz and quiz.passed and after_retraining(quiz.submitted_at, kitchen))
    valid_proof = proof if proof and after_retraining(proof.submitted_at, kitchen) else None
    acknowledgement = None
    if module.id == "allergens":
        acknowledgement = db.scalar(
            select(TrainingAcknowledgement)
            .where(TrainingAcknowledgement.user_id == kitchen.owner_id, TrainingAcknowledgement.module_id == module.id)
            .order_by(TrainingAcknowledgement.submitted_at.desc())
            .limit(1)
        )
    acknowledged = bool(acknowledgement and after_retraining(acknowledgement.submitted_at, kitchen))
    proof_status = "not_required" if module.id == "allergens" else valid_proof.status if valid_proof else "not_submitted"
    return {
        "module_id": module.id,
        "quiz_attempted": quiz is not None and after_retraining(quiz.submitted_at, kitchen),
        "quiz_passed": quiz_passed,
        "proof_id": valid_proof.id if valid_proof else None,
        "proof_status": proof_status,
        "rejection_reason": valid_proof.reason if proof_status == "rejected" else None,
        "acknowledged": acknowledged,
        "completed": quiz_passed and (
            (acknowledged or bool(valid_proof and valid_proof.status == "approved"))
            if module.id == "allergens" else proof_status == "approved"
        ),
    }


def update_eligibility(db: Session, kitchen: Kitchen) -> None:
    if local_order_test_kitchen(db, kitchen):
        kitchen.training_verified = True
        return
    modules = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
    owner = db.get(User, kitchen.owner_id)
    kitchen.training_verified = bool(
        modules and owner and owner.email_verified
        and all(module_progress(db, kitchen, module)["completed"] for module in modules)
    )


@router.get("/training/modules")
def modules(db: Db) -> dict:
    rows = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
    content = {item["id"]: item for item in MODULES}
    return {
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "description": row.description,
                "steps": content.get(row.id, {}).get("steps", []),
                "source_url": content.get(row.id, {}).get("source_url"),
                "proof_instruction": row.proof_instruction,
                "version": row.version,
                "questions": [
                    {"q": q["q"], "options": q["options"]}
                    for q in json.loads(row.questions_json)
                ],
            }
            for row in rows
        ]
    }


@router.get("/seller/training")
def training(user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    rows = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
    return {
        "training_verified": kitchen.training_verified,
        "kitchen_status": kitchen.status,
        "retraining_at": kitchen.retraining_at,
        "modules": [module_progress(db, kitchen, row) for row in rows],
    }


@router.post("/seller/training/{module_id}/quiz-attempts")
def submit_quiz(module_id: str, payload: AnswersIn, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    module = db.get(TrainingModule, module_id)
    if module is None or not module.active:
        raise HTTPException(404, "Module not found")
    questions = json.loads(module.questions_json)
    if len(payload.answers) != len(questions):
        raise HTTPException(422, "Answer every question")
    correct = sum(answer == question["correct"] for answer, question in zip(payload.answers, questions))
    passed = correct == len(questions)
    db.add(QuizAttempt(user_id=user.id, module_id=module_id, score=correct, passed=passed))
    if not passed and not local_order_test_kitchen(db, kitchen):
        kitchen.training_verified = False
    elif not kitchen.training_verified:
        db.flush()
        update_eligibility(db, kitchen)
    db.commit()
    return {"score": correct, "total": len(questions), "passed": passed}


@router.post("/seller/training/{module_id}/acknowledgements", status_code=201)
def acknowledge_training(module_id: str, payload: AcknowledgementIn, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    module = db.get(TrainingModule, module_id)
    if module is None or not module.active:
        raise HTTPException(404, "Module not found")
    if module_id != "allergens":
        raise HTTPException(409, "This lesson requires proof for admin review")
    progress = module_progress(db, kitchen, module)
    if not progress["quiz_passed"]:
        raise HTTPException(409, "Pass the quiz before confirming understanding")
    if progress["completed"]:
        raise HTTPException(409, "Lesson is already complete")
    db.add(TrainingAcknowledgement(user_id=user.id, module_id=module_id))
    db.flush()
    if not kitchen.training_verified:
        update_eligibility(db, kitchen)
    db.commit()
    return {"completed": True}


@router.post("/seller/training/{module_id}/proofs", status_code=201)
async def submit_proof(
    module_id: str,
    file: Annotated[UploadFile, File()],
    user: CurrentUser,
    db: Db,
) -> dict:
    kitchen = seller_kitchen(db, user)
    module = db.get(TrainingModule, module_id)
    if module is None or not module.active:
        raise HTTPException(404, "Module not found")
    if module_id == "allergens":
        raise HTTPException(409, "Confirm understanding after the Allergens quiz; no photo is needed")
    progress = module_progress(db, kitchen, module)
    if not progress["quiz_passed"]:
        raise HTTPException(409, "Pass the quiz before uploading proof")
    if progress["proof_status"] in {"pending", "approved"}:
        raise HTTPException(409, "Proof is already pending or approved")
    if module_id == "food-safety":
        raise HTTPException(409, "Use the camera check for Food Safety proof")
    content_type = file.content_type or ""
    kind = "image" if content_type.startswith("image/") else "video"
    data = await file.read(25_000_001)
    stored = save_file(db, user, data, file.filename or "proof", content_type, kind)
    proof = ProofSubmission(
        user_id=user.id,
        module_id=module_id,
        filename=stored.original_name,
        storage_key=stored.storage_key,
        content_type=stored.content_type,
    )
    db.add(proof)
    db.commit()
    db.refresh(proof)
    return {"id": proof.id, "status": proof.status}


@router.get("/seller/training/proofs")
def own_proofs(user: CurrentUser, db: Db) -> dict:
    rows = db.scalars(
        select(ProofSubmission)
        .where(ProofSubmission.user_id == user.id)
        .order_by(ProofSubmission.submitted_at.desc())
    ).all()
    return {"items": [proof_out(row) for row in rows]}


def proof_out(row: ProofSubmission) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "module_id": row.module_id,
        "filename": row.filename,
        "content_type": row.content_type,
        "status": row.status,
        "reason": row.reason,
        "submitted_at": row.submitted_at,
        "reviewed_at": row.reviewed_at,
        "camera_check": json.loads(row.model_result_json) if row.model_result_json else None,
    }


@router.get("/admin/training/proofs")
def pending_proofs(admin: Admin, db: Db, status: str = "pending") -> dict:
    rows = db.scalars(
        select(ProofSubmission)
        .where(ProofSubmission.status == status, ProofSubmission.module_id != "allergens")
        .order_by(ProofSubmission.submitted_at)
    ).all()
    items = []
    for row in rows:
        seller = db.get(User, row.user_id)
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == row.user_id))
        items.append(proof_out(row) | {
            "seller_name": seller.name if seller else None,
            "kitchen_name": kitchen.name if kitchen else None,
            "is_demo": seller.email.endswith("@demo.nearbites.invalid"),
        })
    return {"items": items}


@router.get("/admin/kitchens/{kitchen_id}/review")
def kitchen_review(kitchen_id: str, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, kitchen_id)
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    owner = db.get(User, kitchen.owner_id)
    modules = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
    quizzes = db.scalars(
        select(QuizAttempt).where(QuizAttempt.user_id == kitchen.owner_id)
        .order_by(QuizAttempt.submitted_at.desc())
    ).all()
    proofs = db.scalars(
        select(ProofSubmission).where(ProofSubmission.user_id == kitchen.owner_id)
        .order_by(ProofSubmission.submitted_at.desc())
    ).all()
    return {
        "kitchen": {
            "id": kitchen.id,
            "name": kitchen.name,
            "chef": kitchen.chef,
            "area": kitchen.area,
            "bio": kitchen.bio,
            "status": kitchen.status,
            "is_demo": owner.email.endswith("@demo.nearbites.invalid") if owner else False,
            "training_verified": kitchen.training_verified,
            "location_set": kitchen.latitude is not None and kitchen.longitude is not None,
            "created_at": kitchen.created_at,
            "retraining_at": kitchen.retraining_at,
        },
        "seller": {
            "name": owner.name,
            "email": owner.email,
            "email_verified": owner.email_verified,
        } if owner else None,
        "modules": [
            {
                "id": module.id,
                "title": module.title,
                "proof_instruction": module.proof_instruction,
                "question_count": len(json.loads(module.questions_json)),
                "questions": [
                    {"question": question["q"], "correct_answer": question["options"][question["correct"]]}
                    for question in json.loads(module.questions_json)
                ],
                "progress": module_progress(db, kitchen, module),
                "quiz_attempts": [
                    {"id": quiz.id, "score": quiz.score, "passed": quiz.passed, "submitted_at": quiz.submitted_at}
                    for quiz in quizzes if quiz.module_id == module.id
                ],
                "proofs": [proof_out(proof) for proof in proofs if proof.module_id == module.id],
            }
            for module in modules
        ],
    }


@router.post("/admin/training/proofs/{proof_id}/decision")
def decide_proof(proof_id: str, payload: ProofDecisionIn, admin: Admin, db: Db) -> dict:
    proof = db.get(ProofSubmission, proof_id)
    if proof is None:
        raise HTTPException(404, "Proof not found")
    if proof.status != "pending":
        raise HTTPException(409, "Proof already reviewed")
    if payload.decision not in {"approve", "reject"}:
        raise HTTPException(422, "Decision must be approve or reject")
    if payload.decision == "reject" and not payload.reason:
        raise HTTPException(422, "Rejection reason required")
    if proof.module_id == "food-safety" and payload.decision == "approve" and not proof.model_result_json:
        raise HTTPException(409, "Food Safety proof needs a camera check")
    proof.status = "approved" if payload.decision == "approve" else "rejected"
    proof.reason = payload.reason if payload.decision == "reject" else None
    proof.reviewer_id = admin.id
    proof.reviewed_at = datetime.now(timezone.utc)
    db.flush()
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == proof.user_id))
    if kitchen:
        update_eligibility(db, kitchen)
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="proof",
            target_id=proof.id,
            action=payload.decision,
            reason=payload.reason,
        )
    )
    db.commit()
    return proof_out(proof)


@router.post("/admin/vendors/{vendor_id}/retraining")
def require_retraining(vendor_id: str, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    kitchen.retraining_at = datetime.now(timezone.utc)
    kitchen.training_verified = False
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="kitchen",
            target_id=kitchen.id,
            action="retraining",
        )
    )
    db.commit()
    return {"vendor_id": kitchen.id, "training_verified": False}


@router.get("/admin/analytics/training")
def training_funnel(admin: Admin, db: Db, demo: bool = False) -> dict:
    sample_email = User.email.like("%@demo.nearbites.invalid")
    scope = sample_email if demo else ~sample_email
    return {
        "seller_count": db.scalar(select(func.count()).select_from(Kitchen).join(User, User.id == Kitchen.owner_id).where(scope)) or 0,
        "verified_count": db.scalar(
            select(func.count()).select_from(Kitchen).join(User, User.id == Kitchen.owner_id).where(Kitchen.training_verified.is_(True), scope)
        ) or 0,
        "pending_proofs": db.scalar(
            select(func.count()).select_from(ProofSubmission).join(Kitchen, Kitchen.owner_id == ProofSubmission.user_id).join(User, User.id == Kitchen.owner_id).where(ProofSubmission.status == "pending", ProofSubmission.module_id != "allergens", scope)
        ) or 0,
    }
