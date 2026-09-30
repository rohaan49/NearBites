"""Server-side ChefCam inference for a seller's Food Safety camera proof."""

import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from .database import get_db
from .media import save_file
from .models import ProofSubmission, TrainingModule, User
from .security import current_user
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
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 20_000_000:
                raise HTTPException(422, "Camera frame is too large")
            image = source.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise HTTPException(422, "Capture a valid camera image") from exc
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
        logging.exception("ChefCam inference failed")
        raise HTTPException(503, "Camera analysis is unavailable") from exc


@router.post("/seller/training/food-safety/camera-check")
async def camera_check(file: Annotated[UploadFile, File()], user: CurrentUser, db: Db) -> dict:
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
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(422, "Capture a JPEG, PNG, or WebP frame")
    data = await file.read(10_000_001)
    if not data or len(data) > 10_000_000:
        raise HTTPException(422, "Camera frame must be under 10 MB")
    detections = await run_in_threadpool(detect, data)
    found = {item["label"] for item in detections}
    response = {
        "hairnet_detected": "hairnet" in found,
        "glove_detected": "glove" in found,
        "detections": detections,
        "confidence_threshold": CONFIDENCE,
        "proof_id": None,
        "status": "needs_new_frame",
    }
    if not {"hairnet", "glove"}.issubset(found):
        return response
    stored = save_file(db, user, data, file.filename or "camera.jpg", file.content_type, "image")
    evidence = {
        "model": "chefcam-gloves-hairnet.pt",
        "confidence_threshold": CONFIDENCE,
        "detections": detections,
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
