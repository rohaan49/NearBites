import io
import os
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Kitchen, ProofSubmission, StoredFile, User
from .security import current_user


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads")).resolve()
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
Image.MAX_IMAGE_PIXELS = 20_000_000


def save_file(db: Session, user: User, data: bytes, name: str, content_type: str, kind: str, public: bool = False) -> StoredFile:
    if kind == "image":
        if content_type not in IMAGE_TYPES or len(data) > 10_000_000:
            raise HTTPException(422, "Use a JPEG, PNG, or WebP image under 10 MB")
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
            raise HTTPException(422, "Invalid image file") from exc
        suffix = IMAGE_TYPES[content_type]
    elif kind == "video":
        if content_type != "video/mp4" or len(data) > 25_000_000 or data[4:8] != b"ftyp":
            raise HTTPException(422, "Use an MP4 video under 25 MB")
        suffix = ".mp4"
    else:
        raise HTTPException(422, "Invalid file kind")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    key = f"{uuid4().hex}{suffix}"
    path = UPLOAD_DIR / key
    path.write_bytes(data)
    record = StoredFile(
        owner_id=user.id,
        storage_key=key,
        original_name=Path(name).name[:255],
        content_type=content_type,
        kind="public_image" if public else "proof",
    )
    db.add(record)
    db.flush()
    return record


@router.post("/uploads/images", status_code=201)
async def upload_image(
    request: Request,
    file: Annotated[UploadFile, File()],
    user: CurrentUser,
    db: Db,
) -> dict:
    if not user.email_verified or db.scalar(select(Kitchen.id).where(Kitchen.owner_id == user.id)) is None:
        raise HTTPException(403, "Seller account required")
    data = await file.read(10_000_001)
    record = save_file(db, user, data, file.filename or "image", file.content_type or "", "image", public=True)
    db.commit()
    return {
        "id": record.id,
        "url": str(request.url_for("public_image", file_id=record.id)),
        "content_type": record.content_type,
    }


@router.get("/media/{file_id}")
def public_image(file_id: str, db: Db) -> FileResponse:
    record = db.get(StoredFile, file_id)
    if record is None or record.kind != "public_image":
        raise HTTPException(404, "Image not found")
    path = UPLOAD_DIR / record.storage_key
    if not path.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(path, media_type=record.content_type)


@router.get("/training/proofs/{proof_id}/file")
def proof_file(proof_id: str, user: CurrentUser, db: Db) -> FileResponse:
    proof = db.get(ProofSubmission, proof_id)
    if proof is None or (proof.user_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Proof not found")
    path = UPLOAD_DIR / proof.storage_key
    if not path.is_file():
        raise HTTPException(404, "Proof file not found")
    return FileResponse(path, media_type=proof.content_type, filename=proof.filename)
