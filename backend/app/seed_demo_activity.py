"""Idempotent, explicitly fictional activity for local presentations.

Run after seed_islamabad_samples and bootstrap_content. Never touches real users.
"""

import io
import json
import secrets
from datetime import datetime, time, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select

from .database import SessionLocal
from .media import UPLOAD_DIR
from .models import (
    Address, Dish, HygieneReport, Kitchen, ModerationEvent, Order, OrderItem, OrderStatusEvent,
    ProofSubmission, QuizAttempt, Review, ReviewAssignment, StoredFile, TrainingAcknowledgement, TrainingModule, User,
)
from .seed_islamabad_samples import KITCHENS, BUYERS, sample_image
from .seed_order_test_listing import EMAIL as ORDER_TEST_EMAIL, main as seed_order_test_listing
from .security import password_hash

MARKET_TZ = timezone(timedelta(hours=5))


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


def enrich_demo_data(db, buyers: list[User], sellers: list[User], now: datetime) -> None:
    """Add repeatable examples for each role without changing real accounts."""
    kitchens = [db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id)) for seller in sellers]
    extra_menu = [
        ("Chicken Biryani", "Layered chicken and rice with fried onions.", 540, "hero-biryani.jpg"),
        ("Chicken Karahi", "Tomato and ginger chicken karahi.", 660, "food-karahi.jpg"),
        ("Beef Nihari", "Slow cooked beef shank with warm spices.", 730, "food-nihari.jpg"),
        ("Chicken Haleem", "Wheat and lentils with tender chicken.", 480, "food-haleem.jpg"),
        ("Anda Paratha", "Spiced omelette and pan fried paratha.", 310, "food-paratha.jpg"),
        ("Masoor Daal Bowl", "Lentils and rice with a cumin tadka.", 350, "food-daal.jpg"),
    ]
    for name, description, price, photo in extra_menu:
        if db.scalar(select(Dish.id).where(Dish.kitchen_id == kitchens[0].id, Dish.name == name)) is None:
            db.add(Dish(id=demo_id("expanded-menu", name), kitchen_id=kitchens[0].id, name=name,
                        description=f"Fictional preview dish. {description}", price_pkr=price,
                        cost_per_portion_pkr=round(price * (0.85 if name == "Beef Nihari" else 0.6)),
                        portion_size="regular", image_url=sample_image(db, sellers[0], photo),
                        portions_available=0, portions_total=0, tag="Demo menu", status="sample"))
    db.flush()
    menus = [db.scalars(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample").order_by(Dish.name)).all() for kitchen in kitchens]
    for menu in menus:
        for dish in menu:
            dish.portions_total = max(dish.portions_total, 8)
            dish.portions_available = max(dish.portions_available, 4)

    def add_order(key: str, buyer: User, kitchen: Kitchen, menu: list[Dish], placed_at: datetime, paired: bool = False) -> Order:
        order_id = demo_id("expanded-order", key)
        existing = db.get(Order, order_id)
        if existing is not None:
            return existing
        dishes = menu[:2] if paired else menu[:1]
        subtotal = sum(dish.price_pkr for dish in dishes)
        address = db.scalar(select(Address).where(Address.user_id == buyer.id))
        order = Order(id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, address_id=address.id,
                      idempotency_key=f"expanded-demo-{key}", status="delivered", payment_method="cod",
                      payment_status="paid", subtotal_pkr=subtotal, delivery_fee_pkr=80,
                      total_pkr=subtotal + 80, placed_at=placed_at)
        db.add(order)
        for position, dish in enumerate(dishes):
            db.add(OrderItem(id=demo_id("expanded-item", f"{key}:{position}"), order_id=order_id,
                             dish_id=dish.id, name=dish.name, quantity=1, unit_price_pkr=dish.price_pkr))
        db.add(OrderStatusEvent(id=demo_id("expanded-status", key), order_id=order_id,
                                actor_id=kitchen.owner_id, status="delivered", at=placed_at + timedelta(minutes=50)))
        return order

    # Multiple signup months and unequal week-by-week retention, with purchases after signup.
    for buyer_index, buyer in enumerate(buyers):
        signup = buyer.created_at.replace(tzinfo=timezone.utc)
        active_weeks = 4 - buyer_index % 3
        for week in range(active_weeks):
            placed = signup + timedelta(days=week * 7 + 2, hours=12)
            add_order(f"cohort:{buyer_index}:{week}", buyer, kitchens[buyer_index], menus[buyer_index], placed, paired=week % 2 == 0)

    # Give the ten kitchens visibly different recent trajectories and varied review wording.
    review_texts = [
        "Demo review: fresh taste and generous portion.",
        "Demo review: packaging was neat and the portion was filling.",
        "Demo review: food arrived cold; packaging needs improvement.",
        "Demo review: spicy curry with a fresh taste.",
        "Demo review: delivery was late but the taste was good.",
        "Demo review: portion seemed small for the price.",
        "Demo review: fresh, well packed, and enjoyable.",
    ]
    recent_orders: list[Order] = []
    for seller_index, kitchen in enumerate(kitchens):
        if seller_index < 3:
            earlier_count, recent_count = 2, 32
        elif seller_index < 6:
            earlier_count, recent_count = 32, 2
        else:
            earlier_count, recent_count = 13, 13
        for period, count in (("earlier", earlier_count), ("recent", recent_count)):
            for position in range(count):
                days_ago = (31 if period == "earlier" else 1) + position % 28
                buyer_index = position % 4 if seller_index == 0 and period == "recent" else (seller_index + position) % len(buyers)
                placed = now - timedelta(days=days_ago, hours=position % 9)
                key = f"trajectory:{seller_index}:{period}:{position}"
                order = add_order(key, buyers[buyer_index], kitchen, menus[seller_index], placed, paired=position % 3 == 0)
                if period == "recent":
                    recent_orders.append(order)
                if position % 4 == 0:
                    review_id = demo_id("expanded-review", key)
                    if db.get(Review, review_id) is None:
                        db.add(Review(id=review_id, order_id=order.id, buyer_id=order.buyer_id,
                                      kitchen_id=kitchen.id, rating=5 if seller_index in {1, 2} else 3 + position % 3,
                                      comment=review_texts[(seller_index + position) % len(review_texts)],
                                      created_at=placed + timedelta(hours=2)))

    # Give every sample kitchen enough dated history for forecasts, repeat buyers,
    # dish comparisons, review topics and a useful seller dashboard. All records
    # remain deterministic fictional history attached to non-orderable menus.
    roman_reviews = [
        "Demo review: biryani ka zaiqa bohat acha tha aur masala theek tha.",
        "Demo review: dabba leak ho gaya aur packing achi nahi thi.",
        "Demo review: delivery jaldi ayi, khana garam mila.",
        "Demo review: portion chota tha aur qeemat zyada lagi.",
        "Demo review: khane mein baal mila, safai ka khayal rakhein.",
        "Demo review: khana tasty tha magar rider late aya.",
        "Demo review: quantity achi thi aur box bilkul theek tha.",
        "Demo review: khana thanda tha aur packing bhi kharab thi.",
    ]
    for seller_index, kitchen in enumerate(kitchens):
        menu = menus[seller_index]
        for week in range(12):
            for weekday in range(7):
                # A regular weekly rhythm with slightly different volume for each kitchen.
                volume = 1 + int(weekday in {4, 5} and (week + seller_index) % 2 == 0)
                for slot in range(volume):
                    days_ago = 84 - week * 7 - weekday
                    placed = now - timedelta(days=days_ago, hours=2 + slot)
                    buyer = buyers[(seller_index + weekday + slot * 3) % len(buyers)]
                    rotated = menu[(week + weekday + slot) % len(menu):] + menu[:(week + weekday + slot) % len(menu)]
                    key = f"all-kitchens:{seller_index}:{week}:{weekday}:{slot}"
                    order = add_order(key, buyer, kitchen, rotated, placed, paired=(week + weekday + slot) % 3 == 0)
                    if (week + weekday + slot) % 3 == 0:
                        review_id = demo_id("all-kitchens-review", key)
                        if db.get(Review, review_id) is None:
                            db.add(Review(id=review_id, order_id=order.id, buyer_id=buyer.id,
                                          kitchen_id=kitchen.id, rating=3 + (week + weekday) % 3,
                                          comment=roman_reviews[(seller_index + week + weekday + slot) % len(roman_reviews)],
                                          created_at=placed + timedelta(hours=2)))

    # Eight distinct dishes and several dish pairs make the featured seller's insights readable.
    topic_review_texts = [
        "Demo review: the biryani tasted delicious and spicy.",
        "Demo review: the packaging was sealed and sturdy.",
        "Demo review: the rider arrived late at my address.",
        "Demo review: the serving was generous for the price.",
        "Demo review: the kitchen looked clean and hygienic.",
        "Demo review: tasty food but the container leaked.",
        "Demo review: delivery was quick and the meal tasted great.",
        "Demo review: the portion was small and the bag was torn.",
    ]
    for dish_index in range(len(menus[0])):
        for visit in range(7):
            placed = now - timedelta(days=2 + (dish_index * 7 + visit) % 27, hours=visit)
            pair = [menus[0][dish_index], menus[0][(dish_index + 1) % len(menus[0])]]
            order = add_order(f"featured-menu:{dish_index}:{visit}", buyers[visit % 4], kitchens[0], pair, placed, paired=True)
            if visit == 6:
                review_id = demo_id("review-topic-example", str(dish_index))
                if db.get(Review, review_id) is None:
                    db.add(Review(id=review_id, order_id=order.id, buyer_id=order.buyer_id,
                                  kitchen_id=kitchens[0].id, rating=4 + dish_index % 2,
                                  comment=topic_review_texts[dish_index % len(topic_review_texts)],
                                  created_at=placed + timedelta(hours=2)))

    # A clean, highly rated sample seller demonstrates the established tier.
    for index in range(10):
        placed = now - timedelta(days=2 + index * 2, hours=2)
        order = add_order(f"established:{index}", buyers[(index + 2) % len(buyers)],
                          kitchens[2], menus[2], placed)
        review_id = demo_id("established-review", str(index))
        if db.get(Review, review_id) is None:
            db.add(Review(id=review_id, order_id=order.id, buyer_id=order.buyer_id,
                          kitchen_id=kitchens[2].id, rating=5,
                          comment="Demo review: fresh meal, careful packaging, and great taste.",
                          created_at=placed + timedelta(hours=2)))

    # A mixed first-to-second-to-third purchase funnel for the featured seller.
    for index in range(6):
        email = f"demo-first-buyer-{index + 1}@demo.nearbites.invalid"
        buyer = db.scalar(select(User).where(User.email == email))
        if buyer is None:
            buyer = User(id=demo_id("user", email), name=f"Demo New Buyer {index + 1}", email=email,
                         role="buyer", view_preference="buyer", email_verified=False,
                         password_hash=password_hash.hash(secrets.token_urlsafe(48)),
                         created_at=now - timedelta(days=46 + index * 3))
            db.add(buyer)
            db.flush()
            db.add(Address(id=demo_id("address", email), user_id=buyer.id, label="Fictional home",
                           line1=f"Demo street {index + 1}", area=["F-6", "G-9", "I-8"][index % 3],
                           city="Islamabad", latitude=33.7, longitude=73.05, is_default=True))
            db.flush()
        first = buyer.created_at.replace(tzinfo=timezone.utc) + timedelta(days=3)
        purchase_count = 1 if index < 3 else 2 if index < 5 else 3
        for visit in range(purchase_count):
            add_order(f"first-buyer:{index}:{visit}", buyer, kitchens[0], [menus[0][index]],
                      first + timedelta(days=7 * visit))

    # Each seller has one formerly regular buyer who has gone quiet at that kitchen.
    quiet_buyer = db.scalar(select(User).where(User.email == "demo-first-buyer-1@demo.nearbites.invalid"))
    for seller_index, kitchen in enumerate(kitchens):
        for visit, days_ago in enumerate((58, 50, 42)):
            add_order(f"quiet-regular:{seller_index}:{visit}", quiet_buyer, kitchen, menus[seller_index],
                      now - timedelta(days=days_ago, hours=4), paired=visit % 2 == 0)

    # Additional regulars who stopped ordering from the first seller.
    for buyer_index in range(4, 10):
        for visit, days_ago in enumerate((58, 50, 42)):
            add_order(f"dormant:{buyer_index}:{visit}", buyers[buyer_index], kitchens[0], menus[0],
                      now - timedelta(days=days_ago, hours=3), paired=visit % 2 == 0)

    # Current-weekday purchases of orderable local test dishes make buyer reorder prompts visible.
    test_seller = db.scalar(select(User).where(User.email == ORDER_TEST_EMAIL))
    test_kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == test_seller.id))
    test_kitchen.verified_at = now - timedelta(days=45)
    test_dishes = db.scalars(select(Dish).where(Dish.kitchen_id == test_kitchen.id, Dish.status == "approved").order_by(Dish.name)).all()
    today_local = now.astimezone(MARKET_TZ).date()
    all_demo_buyers = buyers + [db.scalar(select(User).where(User.email == f"demo-first-buyer-{index + 1}@demo.nearbites.invalid")) for index in range(6)]
    for buyer_index, buyer in enumerate(all_demo_buyers):
        # Make every sample buyer's default delivery location usable for the local test kitchen.
        nearby_id = demo_id("nearby-address", str(buyer_index))
        nearby = db.get(Address, nearby_id)
        if nearby is None:
            nearby = Address(id=nearby_id, user_id=buyer.id, label="Demo nearby address",
                             line1="Fictional F-6 street", area="F-6", city="Islamabad",
                             latitude=33.7295, longitude=73.0755, is_default=True)
            db.add(nearby)
        for address in db.scalars(select(Address).where(Address.user_id == buyer.id)).all():
            address.is_default = address.id == nearby_id
        nearby.is_default = True
        for dish_index, dish in enumerate(test_dishes[:3]):
            for week in range(1, 5):
                local_date = today_local - timedelta(days=week * 7)
                placed = datetime.combine(local_date, time(13, dish_index * 10), MARKET_TZ).astimezone(timezone.utc)
                add_order(f"buyer-reorder-all:{buyer_index}:{dish_index}:{week}", buyer, test_kitchen, [dish], placed)

    # Ten varied hygiene cases, including an open watchlist and completed decisions.
    first_kitchen_orders = [row for row in recent_orders if row.kitchen_id == kitchens[0].id]
    report_texts = [
        "Demo report: food container seal was loose.", "Demo report: serving area appeared unclean.",
        "Demo report: allergen information was unclear.", "Demo report: package arrived damp.",
        "Demo report: hair covering was missing in the handover photo.",
    ]
    reports: list[HygieneReport] = []
    for index, order in enumerate(first_kitchen_orders[:10]):
        report_id = demo_id("expanded-report", str(index))
        report = db.get(HygieneReport, report_id)
        if report is None:
            report = HygieneReport(id=report_id, order_id=order.id, buyer_id=order.buyer_id,
                                   kitchen_id=order.kitchen_id, description=report_texts[index % len(report_texts)],
                                   status="open" if index < 5 else "resolved" if index < 8 else "dismissed",
                                   created_at=order.placed_at + timedelta(hours=4))
            db.add(report)
        reports.append(report)

    # Five pending applications and five completed decisions populate the kitchen review story.
    demo_reviewer = db.scalar(select(User).where(User.email == "demo-reviewer@demo.nearbites.invalid"))
    if demo_reviewer is None:
        demo_reviewer = User(id=demo_id("user", "demo-reviewer"), name="Demo Reviewer (fictional)",
                             email="demo-reviewer@demo.nearbites.invalid", role="admin", view_preference="admin",
                             password_hash=password_hash.hash(secrets.token_urlsafe(48)), email_verified=True)
        db.add(demo_reviewer)
    applications: list[Kitchen] = []
    for index in range(10):
        email = f"demo-applicant-{index + 1}@demo.nearbites.invalid"
        applicant = db.scalar(select(User).where(User.email == email))
        if applicant is None:
            applicant = User(id=demo_id("user", email), name=f"Demo Applicant {index + 1}", email=email,
                             role="seller", view_preference="seller", email_verified=True,
                             password_hash=password_hash.hash(secrets.token_urlsafe(48)),
                             created_at=now - timedelta(days=index + 1))
            db.add(applicant)
        kitchen_id = demo_id("applicant-kitchen", str(index))
        application = db.get(Kitchen, kitchen_id)
        if application is None:
            application = Kitchen(id=kitchen_id, owner_id=applicant.id,
                                  name=f"Demo Applicant Kitchen {index + 1}", chef=applicant.name,
                                  area=["F-6", "F-7", "G-9", "I-8", "G-11"][index % 5],
                                  bio="Fictional kitchen application for moderation demonstration.",
                                  status="pending" if index < 5 else "rejected", training_verified=False,
                                  created_at=now - timedelta(hours=2 + index * 5))
            db.add(application)
        applications.append(application)

    db.flush()
    for index, application in enumerate(applications[5:]):
        event_id = demo_id("moderation", f"kitchen:{index}")
        if db.get(ModerationEvent, event_id) is None:
            db.add(ModerationEvent(id=event_id, actor_id=demo_reviewer.id, target_type="kitchen",
                                   target_id=application.id, action="reject", reason="Fictional application needs more information",
                                   created_at=application.created_at + timedelta(hours=7)))
    for seller_index, seller in enumerate(sellers):
        proof = db.get(ProofSubmission, demo_id("proof", f"{seller_index}:food-safety"))
        if proof.status != "pending":
            event_id = demo_id("moderation", f"proof:{seller_index}")
            if db.get(ModerationEvent, event_id) is None:
                db.add(ModerationEvent(id=event_id, actor_id=demo_reviewer.id, target_type="proof",
                                       target_id=proof.id, action="approve" if proof.status == "approved" else "reject",
                                       reason="Fictional reviewer decision", created_at=proof.reviewed_at))
    for index, report in enumerate(reports[5:]):
        event_id = demo_id("moderation", f"report:{index}")
        if db.get(ModerationEvent, event_id) is None:
            db.add(ModerationEvent(id=event_id, actor_id=demo_reviewer.id, target_type="hygiene_report",
                                   target_id=report.id, action=report.status,
                                   reason="Fictional report decision", created_at=report.created_at + timedelta(hours=5)))
    for index in range(5):
        kitchen = kitchens[index]
        menu = menus[index]
        listing_id = demo_id("reviewed-listing", str(index))
        listing = db.get(Dish, listing_id)
        if listing is None:
            listing = Dish(id=listing_id, kitchen_id=kitchen.id, name=f"Demo rejected listing {index + 1}",
                           description="Fictional submission with missing preparation details.",
                           price_pkr=menu[0].price_pkr, portion_size="regular", image_url=menu[0].image_url,
                           portions_available=0, portions_total=0, status="rejected",
                           created_at=now - timedelta(days=4, hours=index),
                           review_requested_at=now - timedelta(days=4, hours=index))
            db.add(listing)
        event_id = demo_id("moderation", f"listing:{index}")
        if db.get(ModerationEvent, event_id) is None:
            db.add(ModerationEvent(id=event_id, actor_id=demo_reviewer.id, target_type="listing",
                                   target_id=listing.id, action="reject", reason="Fictional listing review",
                                   created_at=listing.review_requested_at + timedelta(hours=6)))
    for index, application in enumerate(applications[:5]):
        assignment_id = demo_id("assignment", str(index))
        if db.get(ReviewAssignment, assignment_id) is None:
            db.add(ReviewAssignment(id=assignment_id, target_type="kitchen", target_id=application.id,
                                    reviewer_id=demo_reviewer.id, assigned_at=now - timedelta(hours=index + 1)))


def main() -> None:
    # This also makes the buyer's repeat-order suggestion lead to a usable local checkout.
    seed_order_test_listing()
    with SessionLocal() as db:
        modules = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
        if len(modules) < 5:
            raise SystemExit("Run python -m app.bootstrap_content first")
        buyers = [db.scalar(select(User).where(User.email == f"sample-buyer-{i + 1}@demo.nearbites.invalid")) for i in range(len(BUYERS))]
        sellers = [db.scalar(select(User).where(User.email == f"sample-seller-{i + 1}@demo.nearbites.invalid")) for i in range(len(KITCHENS))]
        if any(user is None for user in buyers + sellers):
            raise SystemExit("Run python -m app.seed_islamabad_samples first")
        now = datetime.now(timezone.utc)
        # Spread signups across five months so retention is visible by cohort.
        for index, buyer in enumerate(buyers):
            buyer.created_at = now - timedelta(days=(5 - index // 2) * 30 + index % 2 * 3)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        for index, seller in enumerate(sellers):
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id, Kitchen.status == "sample"))
            if kitchen is None:
                raise SystemExit(f"Missing sample kitchen for {seller.email}")
            kitchen.training_verified = index < 6
            kitchen.verified_at = now - timedelta(days=[5, 12, 22, 40, 65, 85][index]) if index < 6 else None
            for sample_dish in db.scalars(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample")).all():
                sample_dish.cost_per_portion_pkr = round(sample_dish.price_pkr * (0.58 if index % 3 else 0.86))
                sample_dish.portions_total = max(sample_dish.portions_total, 8)
                sample_dish.portions_available = max(sample_dish.portions_available, 4 + index % 3)
            for module in modules:
                count = len(json.loads(module.questions_json))
                quiz_id = demo_id("quiz", f"{index}:{module.id}")
                if db.get(QuizAttempt, quiz_id) is None:
                    db.add(QuizAttempt(id=quiz_id, user_id=seller.id, module_id=module.id, score=count, passed=True, submitted_at=now - timedelta(days=5, hours=index)))
                proof_id = demo_id("proof", f"{index}:{module.id}")
                if module.id == "allergens":
                    old_proof = db.get(ProofSubmission, proof_id)
                    if old_proof is not None:
                        db.delete(old_proof)
                    acknowledgement_id = demo_id("acknowledgement", str(index))
                    if db.get(TrainingAcknowledgement, acknowledgement_id) is None:
                        db.add(TrainingAcknowledgement(id=acknowledgement_id, user_id=seller.id, module_id="allergens", submitted_at=now - timedelta(days=5, hours=index)))
                    continue
                if db.get(ProofSubmission, proof_id) is None:
                    key = f"demo-proof-{index}-{module.id}.jpg"
                    path = UPLOAD_DIR / key
                    if not path.exists():
                        path.write_bytes(proof_art(module, kitchen))
                    stored_id = demo_id("file", key)
                    if db.get(StoredFile, stored_id) is None:
                        db.add(StoredFile(id=stored_id, owner_id=seller.id, storage_key=key, original_name=f"DEMO-{module.id}.jpg", content_type="image/jpeg", kind="proof"))
                    db.add(ProofSubmission(id=proof_id, user_id=seller.id, module_id=module.id, filename=f"DEMO-{module.id}.jpg", storage_key=key, content_type="image/jpeg", submitted_at=now - timedelta(days=4, hours=index)))
                proof = db.get(ProofSubmission, proof_id)
                proof.status = "approved" if index < 6 else "pending" if index < 8 else "rejected"
                proof.reason = "Fictional reviewer decision on an illustration; no real camera check" if proof.status != "pending" else None
                proof.reviewed_at = now - timedelta(days=3, hours=index) if proof.status != "pending" else None
                if module.id == "food-safety":
                    # Explicit simulation for the shadow chart, never model output or safety evidence.
                    confidence = 0.91 if index % 3 != 0 else 0.66
                    proof.model_result_json = json.dumps({"demo_synthetic": True, "model": "fictional illustration", "detections": [{"label": "hairnet", "confidence": confidence}, {"label": "glove", "confidence": confidence - 0.01}]})
            if index < len(sellers):
                dish_name, description, price, portion, tag, photo = KITCHENS[index][3][0]
                existing = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.name == dish_name))
                photo_dish = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample", Dish.image_url.is_not(None)))
                for variant in range(2):
                    pending_name = f"{dish_name} — demo review" if variant == 0 else f"{dish_name} — demo special review"
                    if db.scalar(select(Dish.id).where(Dish.kitchen_id == kitchen.id, Dish.name == pending_name)) is None:
                        submitted = now - timedelta(hours=2 + (index * 2 + variant) * 7)
                        db.add(Dish(id=demo_id("pending-listing", f"{index}:{variant}"), kitchen_id=kitchen.id, name=pending_name, description=f"Fictional listing awaiting review. {description}", price_pkr=price, portion_size=portion, image_url=existing.image_url if existing and existing.image_url else photo_dish.image_url if photo_dish else None, portions_available=4, portions_total=4, tag=tag, status="pending_review", created_at=submitted, review_requested_at=submitted))
        db.flush()
        statuses = ["delivered", "delivered", "out_for_delivery", "ready", "cooking", "accepted", "placed", "cancelled", "delivered", "delivered", "ready", "delivered", "accepted", "delivered", "out_for_delivery", "delivered", "cooking", "placed", "delivered", "delivered"]
        for index in range(600):
            status = statuses[index % len(statuses)] if index < 20 else statuses[(index * 7 + index // 10) % len(statuses)]
            buyer = buyers[index % len(buyers)]
            seller = sellers[(index * 3) % len(sellers)]
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id))
            address = db.scalar(select(Address).where(Address.user_id == buyer.id))
            dish = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample"))
            order_id = demo_id("order", str(index))
            if db.get(Order, order_id) is None:
                second_dish = db.scalar(select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "sample", Dish.id != dish.id)) if index >= 20 and index % 5 == 0 else None
                subtotal = dish.price_pkr + (second_dish.price_pkr if second_dish else 0)
                total = subtotal + 80
                placed_at = now - timedelta(days=index % 6 if index < 20 else (index * 9) % 56, hours=index % 8)
                db.add(Order(id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, address_id=address.id, idempotency_key=f"demo-{index}", status=status, payment_method="cod", payment_status="paid" if status == "delivered" and index % 4 != 0 else "unpaid", subtotal_pkr=subtotal, delivery_fee_pkr=80, total_pkr=total, placed_at=placed_at))
                db.add(OrderItem(id=demo_id("item", str(index)), order_id=order_id, dish_id=dish.id, name=dish.name, quantity=1, unit_price_pkr=dish.price_pkr))
                if second_dish:
                    db.add(OrderItem(id=demo_id("second-item", str(index)), order_id=order_id, dish_id=second_dish.id, name=second_dish.name, quantity=1, unit_price_pkr=second_dish.price_pkr))
                db.add(OrderStatusEvent(id=demo_id("event", str(index)), order_id=order_id, actor_id=seller.id, status=status, at=placed_at + timedelta(minutes=35)))
            if status == "delivered" and index % 3 != 0:
                review_id = demo_id("review", str(index))
                if db.get(Review, review_id) is None:
                    db.add(Review(id=review_id, order_id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, rating=4 + index % 2, comment=["Demo review: comforting meal and careful packing.", "Demo review: generous portion, arrived warm.", "Demo review: familiar Islamabad home cooking."][index % 3], created_at=now - timedelta(days=index % 5)))
            if status == "delivered" and index in {1, 8, 9, 15, 41, 71, 95}:
                report_id = demo_id("report", str(index))
                if db.get(HygieneReport, report_id) is None:
                    db.add(HygieneReport(id=report_id, order_id=order_id, buyer_id=buyer.id, kitchen_id=kitchen.id, description=["Demo report: container seal was loose at handover.", "Demo report: ingredient label was missing from the bag.", "Demo report: food packaging arrived damp.", "Demo report: requested allergen details were unclear."][index % 4], status="open", created_at=now - timedelta(days=index % 4)))
        enrich_demo_data(db, buyers, sellers, now)
        db.commit()
    print("Comprehensive fictional demo ready: seller, buyer, training, checkout, review, and analytics examples. No real accounts changed.")


if __name__ == "__main__":
    main()
