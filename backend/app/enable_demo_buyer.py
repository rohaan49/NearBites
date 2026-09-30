"""Enable local sign-in for the first fictional buyer.

Set DEMO_BUYER_PASSWORD in the environment. The password is never committed.
"""

import os
from sqlalchemy import select
from .database import SessionLocal
from .models import User
from .security import password_hash


def main() -> None:
    password = os.getenv("DEMO_BUYER_PASSWORD", "")
    if len(password) < 10:
        raise SystemExit("Set DEMO_BUYER_PASSWORD to at least 10 characters")
    email = "sample-buyer-1@demo.nearbites.invalid"
    with SessionLocal() as db:
        buyer = db.scalar(select(User).where(User.email == email, User.role == "buyer"))
        if buyer is None:
            raise SystemExit("Run python -m app.seed_islamabad_samples first")
        buyer.password_hash = password_hash.hash(password)
        buyer.email_verified = True
        db.commit()
    print(f"Local demo buyer ready: {email}")


if __name__ == "__main__":
    main()
