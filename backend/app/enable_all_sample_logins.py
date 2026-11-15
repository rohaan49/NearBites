"""Make fictional sample profiles share the already-enabled local demo logins.

The existing sample buyer 1 password is reused for all sample buyers; the
existing sample seller 1 password is reused for all sample sellers. No password
or hash is printed or stored in source control. Localhost only.
"""

import os

from sqlalchemy import select

from .database import SessionLocal
from .models import User
from .seed_islamabad_samples import BUYERS, KITCHENS


def main() -> None:
    origin = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8080")
    if not origin.startswith(("http://127.0.0.1:", "http://localhost:")):
        raise SystemExit("Sample logins are local-only")
    with SessionLocal() as db:
        buyer_source = db.scalar(select(User).where(User.email == "sample-buyer-1@demo.nearbites.invalid"))
        seller_source = db.scalar(select(User).where(User.email == "sample-seller-1@demo.nearbites.invalid"))
        if not buyer_source or not seller_source or not buyer_source.email_verified or not seller_source.email_verified:
            raise SystemExit("Enable sample buyer 1 and sample seller 1 first; their existing passwords are reused")
        buyer_emails = [f"sample-buyer-{i + 1}@demo.nearbites.invalid" for i in range(len(BUYERS))]
        buyer_emails += [f"demo-first-buyer-{i + 1}@demo.nearbites.invalid" for i in range(6)]
        seller_emails = [f"sample-seller-{i + 1}@demo.nearbites.invalid" for i in range(len(KITCHENS))]
        count = 0
        for email in buyer_emails + seller_emails:
            account = db.scalar(select(User).where(User.email == email))
            if account is None:
                raise SystemExit("Run the demo activity seeder before enabling all sample logins")
            if account not in (buyer_source, seller_source):
                is_buyer = email in buyer_emails
                account.password_hash = buyer_source.password_hash if is_buyer else seller_source.password_hash
                account.email_verified = True
                account.role = "buyer" if is_buyer else "seller"
                account.view_preference = account.role
            count += 1
        db.commit()
    print(f"Enabled {count} fictional sample profiles using the existing local buyer and seller demo passwords.")


if __name__ == "__main__":
    main()
