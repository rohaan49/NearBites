"""Explainable buyer, kitchen, and platform analytics from stored activity."""

import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations
from statistics import median
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Address, Dish, HygieneReport, Kitchen, ModerationEvent, Order, OrderItem, ProofSubmission, Review, User
from .review_topics import LABELS, TOPICS, get_model
from .forecasting import compare_forecasts
from .security import current_user, require_admin


router = APIRouter()
MARKET_TZ = timezone(timedelta(hours=5))
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]


def utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def seller_kitchen(db: Session, user: User) -> Kitchen:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    return kitchen


def order_items(db: Session, orders: list[Order]) -> dict[str, list[OrderItem]]:
    if not orders:
        return {}
    grouped: dict[str, list[OrderItem]] = defaultdict(list)
    for item in db.scalars(select(OrderItem).where(OrderItem.order_id.in_([row.id for row in orders]))).all():
        grouped[item.order_id].append(item)
    return grouped


@router.get("/seller/analytics/opportunities")
def seller_opportunities(user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=90)
    orders = db.scalars(select(Order).where(Order.kitchen_id == kitchen.id, Order.status == "delivered").order_by(Order.placed_at)).all()
    recent = [row for row in orders if utc(row.placed_at) >= since]
    items = order_items(db, recent)

    # Cohort: buyers whose first delivered order was 30-120 days ago.
    by_buyer: dict[str, list[Order]] = defaultdict(list)
    for row in orders:
        by_buyer[row.buyer_id].append(row)
    matured = [rows for rows in by_buyer.values() if now - timedelta(days=120) <= utc(rows[0].placed_at) <= now - timedelta(days=30)]
    second = sum(len(rows) > 1 and utc(rows[1].placed_at) <= utc(rows[0].placed_at) + timedelta(days=30) for rows in matured)
    third = sum(len(rows) > 2 and utc(rows[2].placed_at) <= utc(rows[0].placed_at) + timedelta(days=30) for rows in matured)

    pair_counts: Counter[tuple[str, str]] = Counter()
    names: dict[str, str] = {}
    for row in recent:
        unique = {item.dish_id: item.name for item in items.get(row.id, [])}
        names.update(unique)
        pair_counts.update(combinations(sorted(unique), 2))
    pairs = [
        {"dish_ids": list(pair), "names": [names[id_] for id_ in pair], "orders_together": count}
        for pair, count in pair_counts.most_common(5) if count >= 2
    ]

    keywords = {
        "cold": r"\b(?:cold|thanda|thandi)\b", "late": r"\b(?:late|der|delay)\b",
        "packaging": r"\b(?:packag\w*|packing|dabba|box|container|packet)\b",
        "spicy": r"\b(?:spic\w*|mirch|masala|teekha)\b",
        "fresh": r"\b(?:fresh|taaza)\b",
        "portion": r"\b(?:portion\w*|quantity|hissa|serving)\b",
        "taste": r"\b(?:tast\w*|zaiqa|mazedar|pheeka)\b",
    }
    reviews = db.scalars(select(Review).where(Review.kitchen_id == kitchen.id, Review.created_at >= since)).all()
    word_counts: Counter[str] = Counter()
    current_words: Counter[str] = Counter()
    previous_words: Counter[str] = Counter()
    for review in reviews:
        text = review.comment.lower()
        found = [label for label, pattern in keywords.items() if re.search(pattern, text)]
        word_counts.update(found)
        if utc(review.created_at) >= now - timedelta(days=30):
            current_words.update(found)
        elif utc(review.created_at) >= now - timedelta(days=60):
            previous_words.update(found)

    dormant = 0
    for rows in by_buyer.values():
        if len(rows) < 3:
            continue
        dates = [utc(row.placed_at) for row in rows]
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        normal = max(7, median(gaps))
        if (now - dates[-1]).days >= max(14, normal * 1.5):
            dormant += 1

    dishes = {row.id: row for row in db.scalars(select(Dish).where(Dish.kitchen_id == kitchen.id)).all()}
    margins: dict[str, dict] = {}
    recent_qty: Counter[str] = Counter()
    previous_qty: Counter[str] = Counter()
    for row in recent:
        for item in items.get(row.id, []):
            if utc(row.placed_at) >= now - timedelta(days=14):
                recent_qty[item.dish_id] += item.quantity
            elif utc(row.placed_at) >= now - timedelta(days=28):
                previous_qty[item.dish_id] += item.quantity
            dish = dishes.get(item.dish_id)
            if dish is None or dish.cost_per_portion_pkr is None:
                continue
            entry = margins.setdefault(dish.id, {"dish_id": dish.id, "name": dish.name, "portions": 0, "sales_pkr": 0, "estimated_gross_margin_pkr": 0})
            entry["portions"] += item.quantity
            entry["sales_pkr"] += item.quantity * item.unit_price_pkr
            entry["estimated_gross_margin_pkr"] += item.quantity * (item.unit_price_pkr - dish.cost_per_portion_pkr)

    dish_planning = []
    surplus_advice = []
    for dish in dishes.values():
        a, b = previous_qty[dish.id], recent_qty[dish.id]
        if a + b < 10:
            continue
        change = (b - a) / a if a else None
        adjustment = max(-0.2, min(0.2, change)) if change is not None else 0.2
        margin_ratio = (dish.price_pkr - dish.cost_per_portion_pkr) / dish.price_pkr if dish.cost_per_portion_pkr is not None else None
        dish_planning.append({
            "dish_id": dish.id, "name": dish.name,
            "previous_14_day_portions": a, "recent_14_day_portions": b,
            "suggested_preparation_target": max(1, round(dish.portions_total * (1 + adjustment))),
            "price_note": "Estimated gross margin is below 20%; review price or cost" if margin_ratio is not None and margin_ratio < 0.2 else "Order trend alone cannot determine an optimal price",
        })

    # Advisory order-time signal; no sell-through claim without stock snapshots.
    dish_hours: dict[str, Counter[int]] = defaultdict(Counter)
    for order in recent:
        hour = utc(order.placed_at).astimezone(MARKET_TZ).hour
        for item in items.get(order.id, []):
            dish_hours[item.dish_id][hour] += item.quantity
    for dish in dishes.values():
        if dish.status not in {"approved", "sample"} or dish.portions_available <= 0:
            continue
        hourly = dish_hours[dish.id]
        best_hour = hourly.most_common(1)[0][0] if sum(hourly.values()) >= 5 else None
        surplus_advice.append({
            "dish_id": dish.id,
            "name": dish.name,
            "available_portions": dish.portions_available,
            "preview_only": dish.status == "sample",
            "delivered_portions_14d": recent_qty[dish.id],
            "suggested_post_hour": best_hour,
            "advice": "Post available portions before your usual order hour and update stock as portions sell" if best_hour is not None else "Keep your available portions current; more orders are needed to identify a usual order hour",
        })

    today = now.astimezone(MARKET_TZ).date()
    # Use complete local days, including zero-order days. Today's partial count is excluded.
    daily = Counter(utc(row.placed_at).astimezone(MARKET_TZ).date() for row in recent)
    forecast = []
    forecast_validation = None
    forecast_selected = None
    if len(recent) >= 20 and daily and (today - min(daily)).days >= 28:
        start = min(daily)
        complete_days = (today - start).days
        values = [daily[start + timedelta(days=offset)] for offset in range(complete_days)]
        compared = compare_forecasts(values, horizon=8)
        forecast_selected = compared["selected"]
        forecast_validation = compared["validation"]
        for offset in range(1, 8):
            day = today + timedelta(days=offset)
            baseline = compared["weekday"][offset]
            winter = compared["holt_winters"][offset] if compared["holt_winters"] else None
            chosen = winter if compared["selected"] == "holt_winters" else baseline
            forecast.append({"day": day.isoformat(), "estimated_orders": round(chosen, 1),
                             "weekday_average": round(baseline, 1),
                             "holt_winters": round(winter, 1) if winter is not None else None})

    return {
        "window_days": 90,
        "retention": {"eligible_first_buyers": len(matured), "second_order_within_30_days": second, "third_order_within_30_days": third},
        "dish_pairs": pairs,
        "review_keywords": [{"keyword": word, "reviews": count} for word, count in word_counts.most_common()],
        "review_keyword_trends": [{"keyword": word, "recent_30_days": current_words[word], "previous_30_days": previous_words[word]} for word in sorted(set(current_words) | set(previous_words))],
        "review_count": len(reviews),
        "dormant_regular_count": dormant,
        "estimated_margins": sorted(margins.values(), key=lambda row: row["estimated_gross_margin_pkr"], reverse=True),
        "dish_planning": dish_planning,
        "surplus_advice": surplus_advice,
        "forecast": forecast,
        "forecast_selected": forecast_selected,
        "forecast_validation": forecast_validation,
        "forecast_method": "Daily delivered orders in Pakistan time; Holt-Winters additive weekly seasonality is compared with an eight-week weekday average on the latest 14 complete days. The lower holdout MAE is selected. Sparse histories use the weekday average.",
        "margin_note": "Sales less seller-entered portion cost only; excludes labor, packaging, delivery, and other expenses",
    }


@router.get("/seller/analytics/review-topics")
def seller_review_topics(user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    since = datetime.now(timezone.utc) - timedelta(days=90)
    reviews = db.scalars(select(Review).where(Review.kitchen_id == kitchen.id, Review.created_at >= since).order_by(Review.created_at.desc())).all()
    model = get_model()
    counts: Counter[str] = Counter()
    recent: list[dict] = []
    classified = 0
    for review in reviews:
        topics = model.predict(review.comment or "")
        if topics:
            classified += 1
            counts.update(topics)
        if len(recent) < 5 and review.comment:
            recent.append({"review_id": review.id, "text": review.comment, "topics": [{"id": topic, "label": LABELS[topic]} for topic in topics]})
    return {
        "window_days": 90,
        "review_count": len(reviews),
        "classified_count": classified,
        "topics": [{"id": topic, "label": LABELS[topic], "reviews": counts[topic]} for topic in TOPICS],
        "recent": recent,
        "model": {
            "method": "TF-IDF unigrams and bigrams with five one-vs-rest logistic classifiers",
            "training_source": "Fictional labeled English and Roman Urdu reviews bundled with this demo",
            "training_examples": model.training_examples,
            "evaluation_examples": model.evaluation_examples,
            "evaluation": model.evaluation,
            "roman_training_examples": model.roman_training_examples,
            "roman_evaluation_examples": model.roman_evaluation_examples,
            "roman_evaluation": model.roman_evaluation,
            "limit": "Evaluation uses held-out synthetic examples only. Predictions are descriptive and require review before use in safety decisions.",
        },
    }


@router.get("/vendors/{vendor_id}/reliability")
def vendor_reliability(vendor_id: str, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None or kitchen.status not in {"active", "sample"}:
        raise HTTPException(404, "Kitchen not found")
    since = datetime.now(timezone.utc) - timedelta(days=90)
    orders = db.scalars(select(Order).where(Order.kitchen_id == vendor_id, Order.placed_at >= since)).all()
    finished = [row for row in orders if row.status in {"delivered", "cancelled", "rejected"}]
    cancelled = sum(row.status in {"cancelled", "rejected"} for row in finished)
    return {
        "window_days": 90,
        "finished_orders": len(finished),
        "delivered_orders": len(finished) - cancelled,
        "cancelled_or_rejected_orders": cancelled,
        "cancellation_rate": round(cancelled / len(finished), 3) if len(finished) >= 5 else None,
        "order_completion_rate": round((len(finished) - cancelled) / len(finished), 3) if len(finished) >= 5 else None,
        "verified_at": kitchen.verified_at if kitchen.training_verified else None,
        "training_verified": kitchen.training_verified,
        "note": "A cancellation rate needs at least five finished orders; this is not an on-time delivery measure",
    }


@router.get("/users/me/reorder-prompts")
def reorder_prompts(user: CurrentUser, db: Db) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=84)
    orders = db.scalars(select(Order).where(Order.buyer_id == user.id, Order.status == "delivered", Order.placed_at >= since)).all()
    items = order_items(db, orders)
    weekday = datetime.now(timezone.utc).astimezone(MARKET_TZ).weekday()
    patterns: dict[str, set[str]] = defaultdict(set)
    for row in orders:
        date = utc(row.placed_at).astimezone(MARKET_TZ).date()
        if date.weekday() == weekday:
            for item in items.get(row.id, []):
                patterns[item.dish_id].add(date.isoformat())
    candidates = [dish_id for dish_id, dates in patterns.items() if len(dates) >= 3]
    if not candidates:
        return {"items": []}
    dishes = db.scalars(select(Dish).where(Dish.id.in_(candidates), Dish.status == "approved", Dish.portions_available > 0)).all()
    result = []
    for dish in dishes:
        kitchen = db.get(Kitchen, dish.kitchen_id)
        if kitchen and kitchen.status == "active" and kitchen.training_verified:
            result.append({"dish_id": dish.id, "name": dish.name, "vendor_id": kitchen.id, "vendor_name": kitchen.name, "matching_days": len(patterns[dish.id]), "weekday": weekday})
    result.sort(key=lambda row: row["matching_days"], reverse=True)
    return {"items": result[:3]}


@router.get("/admin/analytics/marketplace-health")
def marketplace_health(admin: Admin, db: Db, demo: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    kitchens = db.scalars(select(Kitchen)).all()
    scope = {row.id: row for row in kitchens if row.owner.email.endswith("@demo.nearbites.invalid") == demo}
    eligible_dishes = db.scalars(select(Dish).where(Dish.status.in_(["approved", "sample"] if demo else ["approved"]))).all()
    available_ids = {row.kitchen_id for row in eligible_dishes if (demo and row.status == "sample") or (row.status == "approved" and row.portions_available > 0)}
    supply: Counter[str] = Counter(row.area.strip().casefold() for row in scope.values() if row.id in available_ids and row.training_verified and (row.status in {"active", "sample"} if demo else row.status == "active"))
    orders = db.scalars(select(Order).where(Order.placed_at >= since, Order.status == "delivered")).all()
    demand: Counter[str] = Counter()
    current: Counter[str] = Counter()
    previous: Counter[str] = Counter()
    for row in orders:
        if row.kitchen_id not in scope:
            continue
        address = db.get(Address, row.address_id)
        if address:
            demand[address.area.strip().casefold()] += 1
        current[row.kitchen_id] += 1
    earlier = db.scalars(select(Order).where(Order.placed_at >= now - timedelta(days=60), Order.placed_at < since, Order.status == "delivered")).all()
    for row in earlier:
        if row.kitchen_id in scope:
            previous[row.kitchen_id] += 1
    areas = sorted(set(demand) | set(supply), key=lambda area: (-demand[area], area))
    trajectories = []
    for kitchen in scope.values():
        a, b = previous[kitchen.id], current[kitchen.id]
        if a + b < 10:
            label = "insufficient history"
        elif a == 0:
            label = "growing"
        else:
            change = (b - a) / a
            label = "growing" if change >= 0.2 else "declining" if change <= -0.2 else "stable"
        trajectories.append({"kitchen_id": kitchen.id, "name": kitchen.name, "previous_30_days": a, "recent_30_days": b, "trajectory": label})
    return {
        "areas": [{"area": area, "delivered_orders_to_area": demand[area], "available_verified_kitchens_in_area": supply[area], "orders_per_available_kitchen": round(demand[area] / supply[area], 1) if supply[area] else None} for area in areas],
        "seller_trajectories": sorted(trajectories, key=lambda row: row["recent_30_days"], reverse=True),
        "notes": ("Fictional demo supply counts verified preview kitchens with sample menus; those menus are not orderable. " if demo else "") + "Demand uses delivery address area; supply uses kitchen area. Area names need consistent spelling. Trajectory compares the two most recent 30-day windows and needs ten delivered orders.",
    }


@router.get("/admin/analytics/buyer-cohorts")
def buyer_cohorts(admin: Admin, db: Db, demo: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    users = db.scalars(select(User).where(User.role != "admin")).all()
    past_buyers = set(db.scalars(select(Order.buyer_id).distinct()).all())
    scoped = {row.id: row for row in users if row.email.endswith("@demo.nearbites.invalid") == demo and (row.role == "buyer" or row.id in past_buyers)}
    grouped: dict[str, list[User]] = defaultdict(list)
    for row in scoped.values():
        if utc(row.created_at) >= now - timedelta(days=180):
            grouped[utc(row.created_at).strftime("%Y-%m")].append(row)
    orders = db.scalars(select(Order).where(Order.buyer_id.in_(list(scoped)), Order.status == "delivered")).all() if scoped else []
    purchases: dict[str, list[datetime]] = defaultdict(list)
    for row in orders:
        purchases[row.buyer_id].append(utc(row.placed_at))
    cohorts = []
    for month, members in sorted(grouped.items()):
        weeks = []
        for week in range(4):
            eligible = [member for member in members if utc(member.created_at) <= now - timedelta(days=(week + 1) * 7)]
            active = sum(any(week * 7 <= (ordered - utc(member.created_at)).days < (week + 1) * 7 for ordered in purchases.get(member.id, [])) for member in eligible)
            weeks.append({"week": week + 1, "eligible_buyers": len(eligible), "buyers_with_delivered_order": active, "rate": round(active / len(eligible), 3) if eligible else None})
        cohorts.append({"signup_month": month, "buyers": len(members), "weeks": weeks})
    return {"cohorts": cohorts, "definition": "Share of buyer accounts signed up in each month with at least one delivered order in each complete week after signup; only mature weeks enter each denominator"}


@router.get("/admin/analytics/review-operations")
def review_operations(admin: Admin, db: Db, demo: bool = False) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    events = db.scalars(select(ModerationEvent).where(ModerationEvent.created_at >= since, ModerationEvent.target_type.in_(["kitchen", "listing", "proof", "hygiene_report"]))).all()
    counts: Counter[str] = Counter()
    waits: dict[str, list[float]] = defaultdict(list)
    models = {"kitchen": Kitchen, "listing": Dish, "proof": ProofSubmission, "hygiene_report": HygieneReport}
    for event in events:
        if event.action not in {"approve", "reject", "resolved", "dismissed"}:
            continue
        target = db.get(models[event.target_type], event.target_id)
        if target is None:
            continue
        if event.target_type == "kitchen":
            kitchen = target
            submitted = target.created_at
        elif event.target_type == "listing":
            kitchen = db.get(Kitchen, target.kitchen_id)
            submitted = target.review_requested_at or target.created_at
            last_submission = db.scalar(select(ModerationEvent).where(
                ModerationEvent.target_type == "listing", ModerationEvent.target_id == target.id,
                ModerationEvent.action == "submit_review", ModerationEvent.created_at <= event.created_at,
            ).order_by(ModerationEvent.created_at.desc()).limit(1))
            if last_submission:
                submitted = last_submission.created_at
        elif event.target_type == "proof":
            kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == target.user_id))
            submitted = target.submitted_at
        else:
            kitchen = db.get(Kitchen, target.kitchen_id)
            submitted = target.created_at
        if kitchen is None or kitchen.owner.email.endswith("@demo.nearbites.invalid") != demo:
            continue
        counts[event.target_type] += 1
        waits[event.target_type].append(max(0, (utc(event.created_at) - utc(submitted)).total_seconds() / 3600))
    return {"window_days": 30, "by_type": [{"type": kind, "completed_reviews": counts[kind], "average_wait_hours": round(sum(waits[kind]) / len(waits[kind]), 1) if waits[kind] else None} for kind in models]}


@router.get("/admin/analytics/verification-outcomes")
def verification_outcomes(admin: Admin, db: Db, demo: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    kitchens = [row for row in db.scalars(select(Kitchen).where(Kitchen.verified_at.is_not(None))).all() if row.owner.email.endswith("@demo.nearbites.invalid") == demo]
    groups = {"verified_within_30_days": {"kitchens": 0, "delivered_orders": 0, "buyer_reports": 0}, "verified_over_30_days_ago": {"kitchens": 0, "delivered_orders": 0, "buyer_reports": 0}}
    for kitchen in kitchens:
        verified = utc(kitchen.verified_at)
        name = "verified_within_30_days" if verified >= now - timedelta(days=30) else "verified_over_30_days_ago"
        group = groups[name]
        group["kitchens"] += 1
        recent_orders = db.scalars(select(Order).where(Order.kitchen_id == kitchen.id, Order.status == "delivered", Order.placed_at >= max(verified, now - timedelta(days=90)))).all()
        group["delivered_orders"] += len(recent_orders)
        if recent_orders:
            ids = [row.id for row in recent_orders]
            group["buyer_reports"] += len(db.scalars(select(HygieneReport).where(HygieneReport.order_id.in_(ids), HygieneReport.status != "dismissed")).all())
    return {"groups": [{"group": name, **values, "reports_per_100_delivered_orders": round(values["buyer_reports"] * 100 / values["delivered_orders"], 1) if values["delivered_orders"] else None} for name, values in groups.items()], "note": "Descriptive monitoring only. Unverified kitchens cannot take orders, and buyer reports are not an independent food-safety audit. This cannot prove verification effectiveness."}
