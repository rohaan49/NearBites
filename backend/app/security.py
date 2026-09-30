import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .database import get_db
from .models import RefreshSession, User


SECRET = os.getenv("JWT_SECRET")
if not SECRET or len(SECRET) < 32:
    raise RuntimeError("Set JWT_SECRET to a random value of at least 32 characters")

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def issue_token(user_id: str, kind: str, minutes: int, session_id: str | None = None) -> str:
    payload = {
        "sub": user_id,
        "typ": kind,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
    }
    if session_id:
        payload["jti"] = session_id
    return jwt.encode(payload, SECRET, algorithm="HS256")


def decode_token(token: str, kind: str) -> dict:
    try:
        claims = jwt.decode(token, SECRET, algorithms=["HS256"])
        if claims.get("typ") != kind or not claims.get("sub"):
            raise InvalidTokenError()
        return claims
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc


def tokens_for(db: Session, user: User) -> dict:
    session = RefreshSession(
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(session)
    db.commit()
    return {
        "access_token": issue_token(user.id, "access", 30),
        "refresh_token": issue_token(user.id, "refresh", 30 * 24 * 60, session.id),
        "token_type": "bearer",
    }


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    claims = decode_token(credentials.credentials, "access")
    user = db.get(User, claims["sub"])
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account unavailable")
    return user


def require_admin(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
