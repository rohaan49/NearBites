"""One operational queue for pending marketplace reviews."""

from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Dish, HygieneReport, Kitchen, ModerationEvent, ProofSubmission, ReviewAssignment, User
from .operations import setting
from .security import require_admin
from .trust import seller_track_record
from .application_review import application_readiness


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(require_admin)]
ReviewKind = Literal["kitchen", "listing", "proof", "hygiene"]


class AssignmentIn(BaseModel):
    reviewer_id: str | None = None


def pending_target(db: Session, kind: ReviewKind, target_id: str):
    model, expected = {
        "kitchen": (Kitchen, "pending"),
        "listing": (Dish, "pending_review"),
        "proof": (ProofSubmission, "pending"),
        "hygiene": (HygieneReport, "open"),
    }[kind]
    target = db.get(model, target_id)
    if target is None or target.status != expected:
        raise HTTPException(404, "Open review item not found")
    return target


@router.get("/admin/review-queue")
def review_queue(admin: Admin, db: Db, demo: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    sla_hours = int(setting(db, "review_sla_hours", "24"))
    reviewers = {row.id: row.name for row in db.scalars(select(User).where(User.role == "admin")).all()}
    listings = db.scalars(select(Dish).where(Dish.status == "pending_review")).all()
    proofs = db.scalars(select(ProofSubmission).where(ProofSubmission.status == "pending", ProofSubmission.module_id != "allergens")).all()
    reports = db.scalars(select(HygieneReport).where(HygieneReport.status == "open")).all()
    kitchen_ids = {row.kitchen_id for row in listings} | {row.kitchen_id for row in reports}
    owner_ids = {row.user_id for row in proofs}
    kitchens = db.scalars(select(Kitchen).where(or_(Kitchen.status == "pending", Kitchen.id.in_(kitchen_ids), Kitchen.owner_id.in_(owner_ids)))).all()
    scoped = {
        row.id: row for row in kitchens
        if bool(row.owner.email.endswith("@demo.nearbites.invalid")) == demo
    }
    tiers = {row.id: seller_track_record(db, row)["tier"] for row in scoped.values()}
    open_flags: dict[str, int] = {}
    target_ids = {row.id for row in kitchens if row.status == "pending"} | {row.id for row in listings} | {row.id for row in proofs} | {row.id for row in reports}
    assignments = {(row.target_type, row.target_id): row for row in db.scalars(select(ReviewAssignment).where(ReviewAssignment.target_id.in_(target_ids))).all()} if target_ids else {}
    for report in reports:
        open_flags[report.kitchen_id] = open_flags.get(report.kitchen_id, 0) + 1

    items: list[dict] = []

    def add(kind: ReviewKind, target_id: str, kitchen: Kitchen, title: str, created_at: datetime, application: dict | None = None) -> None:
        hours = max(0, (now - created_at.replace(tzinfo=timezone.utc)).total_seconds() / 3600)
        flags = open_flags.get(kitchen.id, 0)
        reasons: list[str] = []
        priority = {"hygiene": 100, "proof": 45, "kitchen": 35, "listing": 25}[kind]
        if kind == "listing" and tiers[kitchen.id] == "established":
            priority -= 5
            reasons.append("Established seller record; routine listing review")
        if kind == "hygiene":
            reasons.append("Buyer hygiene report needs a safety review")
        if flags >= 2:
            priority += 20
            reasons.append(f"Kitchen has {flags} open hygiene reports")
        elif flags and kind != "hygiene":
            priority += 10
            reasons.append("Kitchen has an open hygiene report")
        overdue = hours >= sla_hours
        if overdue:
            priority += 15
            reasons.append(f"Waiting beyond the {sla_hours}-hour review target")
        if not reasons:
            reasons.append("Routine review")
        assignment = assignments.get((kind, target_id))
        items.append({
            "type": kind,
            "id": target_id,
            "title": title,
            "kitchen_id": kitchen.id,
            "kitchen_name": kitchen.name,
            "seller_tier": tiers[kitchen.id],
            "created_at": created_at,
            "waiting_hours": round(hours, 1),
            "overdue": overdue,
            "priority": "urgent" if priority >= 100 else "high" if priority >= 55 else "routine",
            "priority_score": priority,
            "reasons": reasons,
            "reviewer_id": assignment.reviewer_id if assignment else None,
            "reviewer_name": reviewers.get(assignment.reviewer_id) if assignment else None,
            "application": application,
        })

    for kitchen in scoped.values():
        if kitchen.status == "pending":
            add("kitchen", kitchen.id, kitchen, kitchen.name, kitchen.created_at, application_readiness(db, kitchen))
    for listing in listings:
        if listing.kitchen_id in scoped:
            add("listing", listing.id, scoped[listing.kitchen_id], listing.name, listing.review_requested_at or listing.created_at)
    kitchen_by_owner = {row.owner_id: row for row in scoped.values()}
    for proof in proofs:
        kitchen = kitchen_by_owner.get(proof.user_id)
        if kitchen and kitchen.status != "pending" and proof.module_id != "allergens":
            add("proof", proof.id, kitchen, proof.module_id.replace("-", " ").title(), proof.submitted_at)
    for report in reports:
        kitchen = scoped.get(report.kitchen_id)
        if kitchen:
            add("hygiene", report.id, kitchen, report.description[:100], report.created_at)
    items.sort(key=lambda item: (-item["priority_score"], item["created_at"]))
    return {
        "items": items,
        "summary": {
            "open": len(items),
            "overdue": sum(item["overdue"] for item in items),
            "unassigned": sum(item["reviewer_id"] is None for item in items),
            "urgent": sum(item["priority"] == "urgent" for item in items),
        },
    }


@router.patch("/admin/review-queue/{kind}/{target_id}/assignment")
def assign_review(kind: ReviewKind, target_id: str, payload: AssignmentIn, admin: Admin, db: Db) -> dict:
    pending_target(db, kind, target_id)
    reviewer = db.get(User, payload.reviewer_id) if payload.reviewer_id else None
    if payload.reviewer_id and (reviewer is None or reviewer.role != "admin"):
        raise HTTPException(422, "Assign reviews to an active admin")
    assignment = db.scalar(select(ReviewAssignment).where(
        ReviewAssignment.target_type == kind, ReviewAssignment.target_id == target_id
    ))
    if assignment is None:
        assignment = ReviewAssignment(target_type=kind, target_id=target_id)
        db.add(assignment)
    assignment.reviewer_id = reviewer.id if reviewer else None
    assignment.assigned_at = datetime.now(timezone.utc) if reviewer else None
    db.add(ModerationEvent(
        actor_id=admin.id, target_type=kind, target_id=target_id,
        action="assign_review" if reviewer else "unassign_review",
        reason=f"Assigned to {reviewer.name}" if reviewer else "Returned to unassigned queue",
    ))
    db.commit()
    return {"type": kind, "id": target_id, "reviewer_id": assignment.reviewer_id}
