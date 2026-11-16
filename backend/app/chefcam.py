"""Server-side ChefCam inference for a seller's Food Safety camera proof."""

import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .database import get_db
from .capture_quality import inspect_capture
from .media import save_file
from .models import ProofSubmission, TrainingModule, User
from .security import current_user, decode_token, issue_token
from .training import module_progress, seller_kitchen


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "chefcam-gloves-hairnet.pt"
CONFIDENCE = 0.4
_model = None
_model_lock = Lock()


def detect(data: bytes) -> list[dict]:
    global _model
    if not MODEL_PATH.is_file():
        raise HTTPException(503, "ChefCam model is unavailable")
    try:
        image, quality_issue = inspect_capture(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if quality_issue:
        raise HTTPException(422, quality_issue)
    try:
        with _model_lock:
            if _model is None:
                from ultralytics import YOLO

                _model = YOLO(str(MODEL_PATH))
                if set(_model.names.values()) != {"hairnet", "glove"}:
                    raise RuntimeError("ChefCam model classes do not match the expected labels")
            result = _model.predict(image, conf=CONFIDENCE, verbose=False)[0]
            return [
                {"label": _model.names[int(cls)], "confidence": round(float(conf), 3)}
                for cls, conf in zip(result.boxes.cls, result.boxes.conf)
            ]
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        logging.exception("ChefCam inference failed")
        raise HTTPException(503, "Camera analysis is unavailable") from exc


CHALLENGES = (
    "Turn slightly left and raise one gloved hand beside your head",
    "Turn slightly right and raise one gloved hand beside your head",
)


@router.post("/seller/training/food-safety/challenge")
def new_challenge(user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    module = db.get(TrainingModule, "food-safety")
    if module is None or not module.active or not module_progress(db, kitchen, module)["quiz_passed"]:
        raise HTTPException(409, "Pass the Food Safety quiz first")
    action = CHALLENGES[uuid4().int % len(CHALLENGES)]
    return {"instruction": action, "token": issue_token(user.id, "chefcam_challenge", 5, extra={"action": action})}


def paired_evidence(first: bytes, second: bytes) -> bytes:
    frames = [inspect_capture(payload)[0] for payload in (first, second)]
    sheet = Image.new("RGB", (1280, 510), "white")
    draw = ImageDraw.Draw(sheet)
    for index, frame in enumerate(frames):
        frame.thumbnail((630, 480))
        x = index * 640 + (640 - frame.width) // 2
        sheet.paste(frame, (x, 30 + (480 - frame.height) // 2))
        draw.text((index * 640 + 10, 8), "1. Initial frame" if index == 0 else "2. Challenge frame", fill="black")
    out = io.BytesIO()
    sheet.save(out, format="JPEG", quality=90)
    return out.getvalue()


@router.post("/seller/training/food-safety/camera-check")
async def camera_check(
    file: Annotated[UploadFile, File()],
    second_file: Annotated[UploadFile, File()],
    challenge_token: Annotated[str, Form()],
    user: CurrentUser,
    db: Db,
) -> dict:
    if not user.email_verified:
        raise HTTPException(403, "Verify your email first")
    kitchen = seller_kitchen(db, user)
    module = db.get(TrainingModule, "food-safety")
    if module is None or not module.active:
        raise HTTPException(404, "Food Safety module is unavailable")
    progress = module_progress(db, kitchen, module)
    if not progress["quiz_passed"]:
        raise HTTPException(409, "Pass the Food Safety quiz first")
    if progress["proof_status"] in {"pending", "approved"}:
        raise HTTPException(409, "Food Safety proof is already pending or approved")
    claims = decode_token(challenge_token, "chefcam_challenge")
    if claims["sub"] != user.id or claims.get("action") not in CHALLENGES:
        raise HTTPException(403, "Start a new camera challenge")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"} or second_file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(422, "Capture a JPEG, PNG, or WebP frame")
    data = await file.read(10_000_001)
    second_data = await second_file.read(10_000_001)
    if not data or not second_data or len(data) > 10_000_000 or len(second_data) > 10_000_000:
        raise HTTPException(422, "Camera frame must be under 10 MB")
    if data == second_data:
        raise HTTPException(422, "The two frames are identical. Perform the requested movement and retake")
    detections, second_detections = await run_in_threadpool(lambda: (detect(data), detect(second_data)))
    found = {item["label"] for item in detections}
    second_found = {item["label"] for item in second_detections}
    response = {
        "hairnet_detected": "hairnet" in found,
        "glove_detected": "glove" in found and "glove" in second_found,
        "detections": detections,
        "second_detections": second_detections,
        "confidence_threshold": CONFIDENCE,
        "proof_id": None,
        "status": "needs_new_frame",
    }
    if not {"hairnet", "glove"}.issubset(found) or "glove" not in second_found:
        return response
    stored = save_file(db, user, paired_evidence(data, second_data), "chefcam-pair.jpg", "image/jpeg", "image")
    evidence = {
        "model": "chefcam-gloves-hairnet.pt",
        "confidence_threshold": CONFIDENCE,
        "detections": detections,
        "second_detections": second_detections,
        "challenge": claims["action"],
        "capture_method": "two_browser_camera_frames_unattested",
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    proof = ProofSubmission(
        user_id=user.id,
        module_id=module.id,
        filename=stored.original_name,
        storage_key=stored.storage_key,
        content_type=stored.content_type,
        model_result_json=json.dumps(evidence),
    )
    db.add(proof)
    db.commit()
    response["proof_id"] = proof.id
    response["status"] = "pending_admin_review"
    return response
