from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .database import get_db
from .email import configured, consume_code, create_and_send_code
from .models import RefreshSession, User
from .security import current_user, password_hash


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


class CodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(ForgotIn, CodeIn):
    new_password: str = Field(min_length=10, max_length=128)


@router.post("/auth/email/verify")
def verify_email(payload: CodeIn, user: CurrentUser, db: Db) -> dict:
    consume_code(db, user, "verify", payload.code)
    user.email_verified = True
    db.commit()
    return {"email_verified": True}


@router.post("/auth/email/resend", status_code=204)
def resend_email(user: CurrentUser, db: Db) -> None:
    if user.email_verified:
        return
    create_and_send_code(db, user, "verify")
    db.commit()


@router.post("/auth/password/forgot", status_code=202)
def forgot_password(payload: ForgotIn, db: Db) -> dict:
    if not configured():
        raise HTTPException(503, "Email service is not configured")
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user:
        create_and_send_code(db, user, "reset")
        db.commit()
    return {"message": "If an account exists, a reset code has been sent."}


@router.post("/auth/password/reset")
def reset_password(payload: ResetIn, db: Db) -> dict:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if not user:
        raise HTTPException(400, "Invalid or expired code")
    consume_code(db, user, "reset", payload.code)
    user.password_hash = password_hash.hash(payload.new_password)
    db.execute(update(RefreshSession).where(RefreshSession.user_id == user.id).values(revoked=True))
    db.commit()
    return {"message": "Password changed"}
