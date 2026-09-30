import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .email import consume_code, create_and_send_code
from .models import Kitchen, ModerationEvent, User
from .security import password_hash, require_admin


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
Admin = Annotated[User, Depends(require_admin)]


class InviteIn(BaseModel):
    email: EmailStr


class AcceptInviteIn(InviteIn):
    code: str = Field(pattern=r"^\d{6}$")
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(min_length=2, max_length=120)


@router.get("/admin/users")
def list_admins(admin: Admin, db: Db) -> dict:
    rows = db.scalars(select(User).where(User.role == "admin")).all()
    return {"items": [{"id": row.id, "name": row.name, "email": row.email} for row in rows]}


@router.post("/admin/users/invitations", status_code=202)
def invite_admin(payload: InviteIn, admin: Admin, db: Db) -> dict:
    email = str(payload.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user and user.role == "admin":
        raise HTTPException(409, "Already an admin")
    if user and db.scalar(select(Kitchen.id).where(Kitchen.owner_id == user.id)):
        raise HTTPException(409, "Seller accounts cannot be converted to admin")
    if user is None:
        user = User(
            name="Invited admin",
            email=email,
            password_hash=password_hash.hash(secrets.token_urlsafe(32)),
            role="buyer",
        )
        db.add(user)
        db.flush()
    create_and_send_code(db, user, "admin_invite")
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="user",
            target_id=user.id,
            action="invite_admin",
        )
    )
    db.commit()
    return {"message": "Invitation sent"}


@router.post("/auth/admin-invite/accept")
def accept_invite(payload: AcceptInviteIn, db: Db) -> dict:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None:
        raise HTTPException(400, "Invalid invitation")
    consume_code(db, user, "admin_invite", payload.code)
    user.name = payload.name
    user.password_hash = password_hash.hash(payload.password)
    user.role = "admin"
    user.email_verified = True
    db.commit()
    return {"message": "Admin account activated"}


@router.delete("/admin/users/{user_id}", status_code=204)
def revoke_admin(user_id: str, admin: Admin, db: Db) -> None:
    user = db.get(User, user_id)
    if user is None or user.role != "admin":
        raise HTTPException(404, "Admin not found")
    count = db.scalar(select(func.count()).select_from(User).where(User.role == "admin")) or 0
    if count <= 1:
        raise HTTPException(409, "Cannot remove the last admin")
    user.role = "buyer"
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="user",
            target_id=user.id,
            action="revoke_admin",
        )
    )
    db.commit()
