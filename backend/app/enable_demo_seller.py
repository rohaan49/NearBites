"""Enable local sign-in for one fictional seller without enabling sample checkout.

Set DEMO_SELLER_PASSWORD in the environment. No password is committed.
"""

import os

from sqlalchemy import select

from .database import SessionLocal
from .models import Kitchen, User
from .security import password_hash


def main() -> None:
    password = os.getenv("DEMO_SELLER_PASSWORD", "")
    if len(password) < 10:
        raise SystemExit("Set DEMO_SELLER_PASSWORD to at least 10 characters")
    email = "sample-seller-1@demo.nearbites.invalid"
    with SessionLocal() as db:
        seller = db.scalar(select(User).where(User.email == email, User.role == "seller"))
        if seller is None:
            raise SystemExit("Run python -m app.seed_islamabad_samples first")
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id))
        if kitchen is None or kitchen.status != "sample":
            raise SystemExit("The target must remain a non-orderable sample kitchen")
        seller.password_hash = password_hash.hash(password)
        seller.email_verified = True
        db.commit()
    print(f"Local demo seller ready: {email}. Sample dishes remain non-orderable.")


if __name__ == "__main__":
    main()
