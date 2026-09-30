"""Create or promote one admin from a local terminal.

Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... python -m app.bootstrap_admin
"""

import os

from sqlalchemy import select

from .database import SessionLocal
from .models import User
from .security import password_hash


def main() -> None:
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not email or len(password) < 10:
        raise SystemExit("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters)")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                name="NearBites Admin",
                password_hash=password_hash.hash(password),
                role="admin",
                email_verified=True,
            )
            db.add(user)
        else:
            user.role = "admin"
            user.password_hash = password_hash.hash(password)
            user.email_verified = True
        db.commit()
    print(f"Admin account ready: {email}")


if __name__ == "__main__":
    main()
