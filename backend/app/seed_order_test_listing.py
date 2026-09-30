"""Create orderable local test dishes without implying a real meal will be delivered.

Only runs when FRONTEND_ORIGIN points to localhost. Repeatable. Uses the normal
approved listing and COD order flow, but marks the kitchen and dishes as demo.
"""

import os
import secrets
import shutil
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .database import SessionLocal
from .media import UPLOAD_DIR
from .models import Dish, Kitchen, StoredFile, User
from .security import password_hash

EMAIL = "order-test-seller@demo.nearbites.invalid"
DISHES = [
    ("Chicken Biryani · order flow test", "hero-biryani.jpg", 520, "Basmati rice and chicken. LOCAL CHECKOUT TEST ONLY: no food is prepared or delivered."),
    ("Daal Chawal · order flow test", "food-daal.jpg", 320, "Lentils and rice. LOCAL CHECKOUT TEST ONLY: no food is prepared or delivered."),
    ("Chicken Karahi · order flow test", "food-karahi.jpg", 650, "Chicken with tomato and spices. LOCAL CHECKOUT TEST ONLY: no food is prepared or delivered."),
]


def fixed_id(kind: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"nearbites-order-test:{kind}:{key}"))


def main() -> None:
    origin = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8080")
    if not origin.startswith(("http://127.0.0.1:", "http://localhost:")):
        raise SystemExit("Order test listings are local-only; FRONTEND_ORIGIN must be localhost")
    base = os.getenv("API_PUBLIC_BASE_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")
    with SessionLocal() as db:
        seller = db.scalar(select(User).where(User.email == EMAIL))
        if seller is None:
            seller = User(id=fixed_id("user", EMAIL), name="NearBites Checkout Test", email=EMAIL,
                          password_hash=password_hash.hash(secrets.token_urlsafe(48)), role="seller",
                          view_preference="seller", email_verified=True)
            db.add(seller)
            db.flush()
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id))
        if kitchen is None:
            kitchen = Kitchen(id=fixed_id("kitchen", EMAIL), owner_id=seller.id,
                              name="Order Test Kitchen", chef="NearBites test account", area="F-6",
                              latitude=33.7295, longitude=73.0755,
                              bio="LOCAL TEST KITCHEN. Orders exercise checkout and COD status only. No meals are prepared or delivered.",
                              status="active", training_verified=True)
            db.add(kitchen)
            db.flush()
        else:
            # Keep this local checkout fixture usable after a presenter explores training.
            kitchen.status = "active"
            kitchen.training_verified = True
            if kitchen.latitude is None or kitchen.longitude is None:
                kitchen.latitude, kitchen.longitude = 33.7295, 73.0755
        for name, filename, price, description in DISHES:
            key = f"order-test-{filename}"
            file = db.scalar(select(StoredFile).where(StoredFile.storage_key == key))
            if file is None or not (UPLOAD_DIR / key).is_file():
                source = Path(__file__).resolve().parents[2] / "src" / "assets" / filename
                UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, UPLOAD_DIR / key)
            if file is None:
                file = StoredFile(id=fixed_id("file", key), owner_id=seller.id,
                                  storage_key=key, original_name=filename,
                                  content_type="image/jpeg", kind="public_image")
                db.add(file)
                db.flush()
            dish = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.name == name))
            if dish is None:
                db.add(Dish(id=fixed_id("dish", name), kitchen_id=kitchen.id, name=name,
                            description=description, price_pkr=price, portion_size="regular",
                            image_url=f"{base}/media/{file.id}", portions_available=25,
                            portions_total=25, tag="Local order test", status="approved"))
            else:
                dish.status = "approved"
                dish.portions_available = max(dish.portions_available, 5)
                dish.portions_total = max(dish.portions_total, dish.portions_available)
        db.commit()
    print("Order Test Kitchen ready: three approved, orderable local test dishes. No real food or delivery is offered.")


if __name__ == "__main__":
    main()
