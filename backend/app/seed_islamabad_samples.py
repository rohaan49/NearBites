"""Add clearly labeled, non-orderable Islamabad sample profiles and menus.

Run after migrations: uv run --env-file .env python -m app.seed_islamabad_samples
This command is repeatable and never edits real accounts, orders, or reviews.
"""

import os
import secrets
import shutil
from pathlib import Path

from sqlalchemy import select

from .database import SessionLocal
from .media import UPLOAD_DIR
from .models import Address, Dish, Kitchen, StoredFile, User
from .security import password_hash


# Approximate sector centers. These are samples, not anyone's home address.
AREAS = [
    ("F-6", 33.7295, 73.0755),
    ("F-7", 33.7213, 73.0564),
    ("F-8", 33.7117, 73.0365),
    ("G-9", 33.6877, 73.0327),
    ("G-10", 33.6769, 73.0135),
    ("I-8", 33.6671, 73.0752),
    ("I-10", 33.6378, 73.0462),
    ("G-11", 33.6652, 72.9972),
    ("E-11", 33.7005, 72.9785),
    ("F-10", 33.6930, 73.0131),
]

BUYERS = [
    "Ayesha Malik", "Bilal Ahmed", "Hira Shah", "Daniyal Khan", "Maham Raza",
    "Usman Tariq", "Sana Iqbal", "Hamza Qureshi", "Zoya Abbasi", "Farhan Siddiqui",
]

# Dish descriptions and PKR prices are illustrative. No food is offered for sale.
KITCHENS = [
    ("Nusrat Baji's Dastarkhwan", "Nusrat Javed", "Slow-cooked weekday comfort food.", [
        ("Daal Chawal", "Masoor daal with steamed rice and a cumin tadka.", 320, "regular", "Comfort food", "food-daal.jpg"),
        ("Aloo Gosht", "Potato and mutton curry with ginger, tomato, and warm spices.", 690, "regular", "Sunday special", None),
    ]),
    ("Sadia's Karahi Corner", "Sadia Noreen", "Tomato-rich karahi and homestyle sides.", [
        ("Chicken Karahi", "Chicken cooked with tomato, ginger, green chilli, and coriander.", 650, "regular", "Karahi", "food-karahi.jpg"),
        ("Zeera Raita", "Yogurt with roasted cumin and fresh mint.", 140, "small", "Side", None),
    ]),
    ("Parveen's Nashta", "Parveen Akhtar", "A weekend breakfast table inspired by Islamabad mornings.", [
        ("Halwa Puri", "Semolina halwa, chickpea curry, and two puris.", 390, "regular", "Breakfast", None),
        ("Anda Paratha", "Pan-fried paratha with a spiced egg omelette.", 290, "regular", "Breakfast", "food-paratha.jpg"),
    ]),
    ("Khalida's Rice Pot", "Khalida Bibi", "Rice dishes for a relaxed family lunch.", [
        ("Chicken Pulao", "Basmati rice simmered in chicken yakhni with whole spices.", 480, "regular", "Rice", None),
        ("Chicken Biryani", "Layered basmati rice with spiced chicken and fried onions.", 520, "regular", "Rice", "hero-biryani.jpg"),
    ]),
    ("Rubina's Sunday Kitchen", "Rubina Farooq", "Slow-simmered family recipes.", [
        ("Beef Nihari", "Slow-cooked beef shank gravy with ginger and lemon.", 720, "regular", "Weekend", "food-nihari.jpg"),
        ("Shami Kebab", "Two lentil and beef patties with mint chutney.", 360, "small", "Kebab", None),
    ]),
    ("Amna's Ghar Ka Khana", "Amna Saleem", "Everyday lunches with familiar Pakistani flavors.", [
        ("Qeema Aloo", "Minced beef and potatoes in a tomato-onion masala.", 470, "regular", "Lunch", None),
        ("Kaddu Gosht", "Bottle gourd and mutton gently cooked with whole spices.", 560, "regular", "Lunch", None),
    ]),
    ("Bushra's Kebab Table", "Bushra Rafiq", "Kebabs and fresh chutneys inspired by northern Pakistan.", [
        ("Chapli Kebab", "Two flattened beef kebabs with herbs, tomato, and spice.", 560, "regular", "Kebab", None),
        ("Chicken Seekh Kebab", "Char-grilled chicken mince kebabs with green chutney.", 510, "regular", "Kebab", None),
    ]),
    ("Samina's Daal House", "Samina Mahmood", "Simple lentil and vegetable meals.", [
        ("Daal Mash", "Creamy urad lentils finished with garlic and chilli tadka.", 340, "regular", "Vegetarian", None),
        ("Aloo Palak", "Potatoes and spinach with garlic, cumin, and roti spices.", 360, "regular", "Vegetarian", None),
    ]),
    ("Saira's Evening Pot", "Saira Yousaf", "Warm bowls and savory snacks.", [
        ("Chicken Haleem", "Wheat, lentils, and shredded chicken with fried onions.", 470, "regular", "Comfort food", "food-haleem.jpg"),
        ("Pakora Chaat", "Crisp gram-flour fritters with yogurt, tamarind, and chutney.", 310, "small", "Snack", None),
    ]),
    ("Farzana's Family Table", "Farzana Latif", "Homestyle curries and traditional desserts.", [
        ("Chicken Kofta Curry", "Chicken meatballs in a spiced tomato gravy.", 540, "regular", "Curry", None),
        ("Rice Kheer", "Slow-cooked rice pudding with cardamom and nuts.", 260, "small", "Dessert", None),
    ]),
]


def sample_user(db, email: str, name: str, role: str, password_digest: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            name=name,
            email=email,
            password_hash=password_digest,
            role=role,
            view_preference="seller" if role == "seller" else "buyer",
            email_verified=False,
        )
        db.add(user)
        db.flush()
    return user


def sample_image(db, owner: User, filename: str | None) -> str | None:
    if not filename:
        return None
    key = "sample-" + filename
    row = db.scalar(select(StoredFile).where(StoredFile.storage_key == key))
    if row is None:
        source = Path(__file__).resolve().parents[2] / "src" / "assets" / filename
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, UPLOAD_DIR / key)
        row = StoredFile(
            owner_id=owner.id, storage_key=key, original_name=filename,
            content_type="image/jpeg", kind="public_image",
        )
        db.add(row)
        db.flush()
    base = os.getenv("API_PUBLIC_BASE_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")
    return f"{base}/media/{row.id}"


def main() -> None:
    # No usable password is published or retained for these fictional users.
    password_digest = password_hash.hash(secrets.token_urlsafe(48))
    with SessionLocal() as db:
        for index, name in enumerate(BUYERS):
            email = f"sample-buyer-{index + 1}@demo.nearbites.invalid"
            user = sample_user(db, email, name, "buyer", password_digest)
            area, lat, lng = AREAS[index]
            if db.scalar(select(Address.id).where(Address.user_id == user.id)) is None:
                db.add(Address(
                    user_id=user.id, label="Sample neighborhood",
                    line1=f"Sample location near {area} Markaz", area=area,
                    city="Islamabad", latitude=lat, longitude=lng, is_default=True,
                ))

        for index, (name, chef, bio, menu) in enumerate(KITCHENS):
            email = f"sample-seller-{index + 1}@demo.nearbites.invalid"
            user = sample_user(db, email, chef, "seller", password_digest)
            area, lat, lng = AREAS[index]
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
            if kitchen is None:
                kitchen = Kitchen(
                    owner_id=user.id, name=name, chef=chef, area=area,
                    latitude=lat, longitude=lng,
                    bio=f"Sample kitchen in {area}, Islamabad. {bio} Menu is for preview only.",
                    status="sample", training_verified=False,
                )
                db.add(kitchen)
                db.flush()
            for dish_name, description, price, portion_size, tag, photo in menu:
                if db.scalar(select(Dish.id).where(Dish.kitchen_id == kitchen.id, Dish.name == dish_name)):
                    continue
                db.add(Dish(
                    kitchen_id=kitchen.id, name=dish_name, description=description,
                    price_pkr=price, portion_size=portion_size,
                    image_url=sample_image(db, user, photo),
                    portions_available=0, portions_total=0, tag=tag,
                    status="sample",
                ))
        db.commit()
    print("Islamabad samples ready: 10 buyers, 10 kitchens, 20 preview dishes")


if __name__ == "__main__":
    main()
