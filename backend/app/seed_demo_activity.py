"""Idempotent, explicitly fictional activity for local presentations.

Run after seed_islamabad_samples and bootstrap_content. Never touches real users.
"""

import io
import json
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from .database import SessionLocal
from .media import UPLOAD_DIR
from .models import (
    Address, Dish, HygieneReport, Kitchen, Order, OrderItem, OrderStatusEvent,
    ProofSubmission, QuizAttempt, Review, StoredFile, TrainingModule, User,
)
from .seed_islamabad_samples import KITCHENS, BUYERS


def demo_id(kind: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"nearbites-demo:{kind}:{key}"))


def proof_art(module: TrainingModule, kitchen: Kitchen) -> bytes:
    image = Image.new("RGB", (1200, 800), "#f4f1e9")
    draw = ImageDraw.Draw(image)
    try:
        bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 64)
        regular = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 32)
    except OSError:
        bold = regular = ImageFont.load_default()
    draw.rounded_rectangle((42, 42, 1158, 758), radius=36, fill="#ffffff", outline="#b7c8b7", width=4)
    draw.rectangle((42, 42, 1158, 156), fill="#27563a")
    draw.text((82, 70), "DEMO EVIDENCE", font=bold, fill="white")
    draw.text((82, 225), module.title, font=bold, fill="#254d35")
    draw.text((82, 330), kitchen.name, font=regular, fill="#47594d")
    lines = {
        "food-safety": ["Hairnet + gloves", "Illustration only; no model verification"],
        "packaging": ["Sealed food container", "Leak-resistant packing example"],
        "allergens": ["Ingredient label", "Allergens: wheat, dairy, nuts"],
        "portioning": ["Portion scale", "Consistent serving measure"],
        "fulfilment": ["Dispatch checklist", "Correct dish, sealed bag, on time"],
    }[module.id]
    for index, line in enumerate(lines):
        draw.text((82, 430 + 68 * index), line, font=regular, fill="#304336")
    draw.text((82, 670), "FICTIONAL SAMPLE • NOT SELLER-SUBMITTED", font=regular, fill="#a34e43")
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=90)
    return output.getvalue()


def main() -> None:
    with SessionLocal() as db:
        modules = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
        if len(modules) < 5:
            raise SystemExit("Run python -m app.bootstrap_content first")
        buyers = [db.scalar(select(User).where(User.email == f"sample-buyer-{i + 1}@demo.nearbites.invalid")) for i in range(len(BUYERS))]
        sellers = [db.scalar(select(User).where(User.email == f"sample-seller-{i + 1}@demo.nearbites.invalid")) for i in range(len(KITCHENS))]
        if any(user is None for user in buyers + sellers):
            raise SystemExit("Run python -m app.seed_islamabad_samples first")
        now = datetime.now(timezone.utc)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        for index, seller in enumerate(sellers):
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id, Kitchen.status == "sample"))
            if kitchen is None:
                raise SystemExit(f"Missing sample kitchen for {seller.email}")
            for module in modules:
                count = len(json.loads(module.questions_json))
                quiz_id = demo_id("quiz", f"{index}:{module.id}")
                if db.get(QuizAttempt, quiz_id) is None:
                    db.add(QuizAttempt(id=quiz_id, user_id=seller.id, module_id=module.id, score=count, passed=True, submitted_at=now - timedelta(days=5, hours=index)))
                proof_id = demo_id("proof", f"{index}:{module.id}")
                if db.get(ProofSubmission, proof_id) is None:
                    key = f"demo-proof-{index}-{module.id}.jpg"
                    path = UPLOAD_DIR / key
                    if not path.exists():
                        path.write_bytes(proof_art(module, kitchen))
                    stored_id = demo_id("file", key)
                    if db.get(StoredFile, stored_id) is None:
                        db.add(StoredFile(id=stored_id, owner_id=seller.id, storage_key=key, original_name=f"DEMO-{module.id}.jpg", content_type="image/jpeg", kind="proof"))
                    status = "rejected" if module.id == "food-safety" else "pending" if index % 3 == 0 else "approved"
                    db.add(ProofSubmission(id=proof_id, user_id=seller.id, module_id=module.id, filename=f"DEMO-{module.id}.jpg", storage_key=key, content_type="image/jpeg", status=status, reason="Demo illustration; no camera model check was run" if module.id == "food-safety" else None, submitted_at=now - timedelta(days=4, hours=index)))
            if index < 5:
                dish_name, description, price, portion, tag, photo = KITCHENS[index][3][0]
                pending_name = f"{dish_name} — demo review"
                if db.scalar(select(Dish.id).where(Dish.kitchen_id == kitchen.id, Dish.name == pending_name)) is None:
                    existing = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.name == dish_name))
                    db.add(Dish(kitchen_id=kitchen.id, name=pending_name, description=f"Demo listing awaiting review. {description}", price_pkr=price, portion_size=portion, image_url=existing.image_url if existing else None, portions_available=4, portions_total=4, tag=tag, status="pending_review", created_at=now - timedelta(days=1, hours=index)))
        db.flush()
        statuses = ["delivered", "delivered", "out_for_delivery", "ready", "cooking", "accepted", "placed", "cancelled", "delivered", "delivered", "ready", "delivered", "accepted", "delivered", "out_for_delivery", "delivered", "cooking", "placed", "delivered", "delivered"]
        for index, status in enumerate(statuses):
            buyer = buyers[index % len(buyers)]
            seller = sellers[(index * 3) % len(sellers)]
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id))
            address = db.scalar(select(Address).where(Address.user_id == buyer.id))
            dish = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample"))
            order_id = demo_id("order", str(index))
            if db.get(Order, order_id) is None:
                total = dish.price_pkr + 80
                placed_at = now - timedelta(days=index % 6, hours=index % 8)
                db.add(Order(id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, address_id=address.id, idempotency_key=f"demo-{index}", status=status, payment_method="cod", payment_status="paid" if status == "delivered" and index % 4 != 0 else "unpaid", subtotal_pkr=dish.price_pkr, delivery_fee_pkr=80, total_pkr=total, placed_at=placed_at))
                db.add(OrderItem(id=demo_id("item", str(index)), order_id=order_id, dish_id=dish.id, name=dish.name, quantity=1, unit_price_pkr=dish.price_pkr))
                db.add(OrderStatusEvent(id=demo_id("event", str(index)), order_id=order_id, actor_id=seller.id, status=status, at=placed_at + timedelta(minutes=35)))
            if status == "delivered" and index % 3 != 0:
                review_id = demo_id("review", str(index))
                if db.get(Review, review_id) is None:
                    db.add(Review(id=review_id, order_id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, rating=4 + index % 2, comment=["Demo review: comforting meal and careful packing.", "Demo review: generous portion, arrived warm.", "Demo review: familiar Islamabad home cooking."][index % 3], created_at=now - timedelta(days=index % 5)))
            if status == "delivered" and index in {1, 8, 9, 15}:
                report_id = demo_id("report", str(index))
                if db.get(HygieneReport, report_id) is None:
                    db.add(HygieneReport(id=report_id, order_id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, description=["Demo report: container seal was loose at handover.", "Demo report: ingredient label was missing from the bag.", "Demo report: food packaging arrived damp.", "Demo report: requested allergen details were unclear."][index % 4], status="open", created_at=now - timedelta(days=index % 4)))
        db.commit()
    print("Demo activity ready: 50 quiz attempts, 50 labeled proof illustrations, 5 pending listings, 20 orders, reviews, and hygiene reports. No real accounts changed.")


if __name__ == "__main__":
    main()
