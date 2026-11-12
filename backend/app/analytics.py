from collections import Counter, defaultdict
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Dish, HygieneReport, Kitchen, Order, OrderItem, ProofSubmission, Review, User
from .operations import range_start, setting
from .security import current_user, require_admin
from .trust import seller_track_record


router = APIRouter()
MARKET_TZ = timezone(timedelta(hours=5))
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]


def demo_scope(demo: bool):
    sample_email = User.email.like("%@demo.nearbites.invalid")
    return sample_email if demo else ~sample_email


def completed_orders(db: Session, since: datetime, kitchen_id: str | None = None, demo: bool = False) -> list[Order]:
    stmt = select(Order).join(Kitchen, Kitchen.id == Order.kitchen_id).join(User, User.id == Kitchen.owner_id).where(
        Order.status == "delivered", Order.placed_at >= since,
        demo_scope(demo),
    )
    if kitchen_id:
        stmt = stmt.where(Order.kitchen_id == kitchen_id)
    return db.scalars(stmt).all()


@router.get("/marketplace/discovery")
def marketplace_discovery(db: Db) -> dict:
    """Popularity cards for buyers, computed from delivered orders and current stock."""
    now = datetime.now(timezone.utc)
    since_30d = now - timedelta(days=30)
    since_90d = now - timedelta(days=90)
    dishes = db.scalars(
        select(Dish).join(Kitchen, Kitchen.id == Dish.kitchen_id).where(
            Dish.status == "approved", Dish.portions_available > 0,
            Kitchen.status == "active", Kitchen.training_verified.is_(True),
        )
    ).all()
    dish_by_id = {dish.id: dish for dish in dishes}
    kitchen_by_id = {dish.kitchen_id: dish.kitchen for dish in dishes}
    delivered = db.scalars(
        select(Order).where(Order.status == "delivered", Order.placed_at >= since_90d)
    ).all()
    items = db.scalars(select(OrderItem).join(Order).where(
        Order.status == "delivered", Order.placed_at >= since_90d,
    )).all()
    items_by_order: dict[str, list[OrderItem]] = defaultdict(list)
    for item in items:
        items_by_order[item.order_id].append(item)
    sold_30d: Counter[str] = Counter()
    dinner_30d: Counter[str] = Counter()
    kitchen_orders: Counter[str] = Counter()
    by_weekday: Counter[tuple[int, str]] = Counter()
    for order in delivered:
        kitchen = kitchen_by_id.get(order.kitchen_id)
        if kitchen is None:
            continue
        local = order.placed_at.replace(tzinfo=timezone.utc).astimezone(MARKET_TZ)
        kitchen_orders[order.kitchen_id] += 1
        for item in items_by_order.get(order.id, []):
            if item.dish_id not in dish_by_id:
                continue
            by_weekday[(local.weekday(), item.dish_id)] += item.quantity
            if local >= since_30d:
                sold_30d[item.dish_id] += item.quantity
                if 17 <= local.hour < 22:
                    dinner_30d[item.dish_id] += item.quantity

    def dish_card(dish: Dish) -> dict:
        kitchen = kitchen_by_id[dish.kitchen_id]
        return {
            "id": dish.id, "vendor_id": kitchen.id, "vendor_name": kitchen.name,
            "area": kitchen.area, "name": dish.name, "description": dish.description,
            "price_pkr": dish.price_pkr, "portion_size": dish.portion_size,
            "image_url": dish.image_url, "portions_available": dish.portions_available,
            "portions_total": dish.portions_total, "tag": dish.tag, "status": dish.status,
            "is_sample": False, "is_demo": kitchen.owner.email.endswith("@demo.nearbites.invalid"),
        }

    trending = sorted(dishes, key=lambda dish: (sold_30d[dish.id], dinner_30d[dish.id]), reverse=True)[:6]
    ratings = dict(db.execute(
        select(Review.kitchen_id, func.avg(Review.rating)).group_by(Review.kitchen_id)
    ).all())
    kitchens = sorted(
        (kitchen for kitchen in kitchen_by_id.values() if kitchen_orders[kitchen.id] > 0),
        key=lambda kitchen: kitchen_orders[kitchen.id], reverse=True,
    )[:6]
    popular_kitchens = [{
        "id": kitchen.id, "name": kitchen.name, "chef": kitchen.chef, "area": kitchen.area,
        "orders_90d": kitchen_orders[kitchen.id],
        "rating": round(float(ratings[kitchen.id]), 1) if ratings.get(kitchen.id) is not None else None,
        "is_demo": kitchen.owner.email.endswith("@demo.nearbites.invalid"),
    } for kitchen in kitchens]
    popular_by_day = []
    for weekday in range(7):
        candidates = [(count, dish_by_id[dish_id]) for (day, dish_id), count in by_weekday.items() if day == weekday]
        if candidates:
            count, dish = max(candidates, key=lambda pair: pair[0])
            popular_by_day.append({"weekday": weekday, "dish": dish.name, "orders_90d": count})

    return {
        "trending": [{**dish_card(dish), "portions_sold_30d": sold_30d[dish.id], "dinner_portions_30d": dinner_30d[dish.id]} for dish in trending],
        "popular_kitchens": popular_kitchens,
        "popular_by_day": popular_by_day,
        "definition": "Popularity uses delivered orders from the last 30 days; weekday picks use the last 90 days. Remaining portions are current listing stock.",
    }


def daily_series(orders: list[Order], include_delivery_fee: bool = True) -> list[dict]:
    counts: Counter[str] = Counter()
    revenue: Counter[str] = Counter()
    for order in orders:
        day = order.placed_at.replace(tzinfo=timezone.utc).astimezone(MARKET_TZ).date().isoformat()
        counts[day] += 1
        if order.payment_status == "paid":
            revenue[day] += order.total_pkr if include_delivery_fee else order.subtotal_pkr
    return [
        {"day": day, "orders": counts[day], "revenue_pkr": revenue[day]}
        for day in sorted(counts)
    ]


@router.get("/admin/overview")
def overview(admin: Admin, db: Db, range: str = "week", demo: bool = False) -> dict:
    since = range_start(range)
    orders = completed_orders(db, since, demo=demo)
    kitchen_scope = demo_scope(demo)
    placed = db.scalars(
        select(Order).join(Kitchen, Kitchen.id == Order.kitchen_id).join(User, User.id == Kitchen.owner_id)
        .where(Order.placed_at >= since, demo_scope(demo))
    ).all()
    pending_listings = db.scalar(
        select(func.count()).select_from(Dish).join(Kitchen, Kitchen.id == Dish.kitchen_id).join(User, User.id == Kitchen.owner_id).where(Dish.status == "pending_review", kitchen_scope)
    ) or 0
    pending_proofs = db.scalar(
        select(func.count()).select_from(ProofSubmission).join(Kitchen, Kitchen.owner_id == ProofSubmission.user_id).join(User, User.id == Kitchen.owner_id).where(ProofSubmission.status == "pending", kitchen_scope)
    ) or 0
    open_flags = db.scalar(
        select(func.count()).select_from(HygieneReport).join(Kitchen, Kitchen.id == HygieneReport.kitchen_id).join(User, User.id == Kitchen.owner_id).where(HygieneReport.status == "open", kitchen_scope)
    ) or 0
    review_deadline = datetime.now(timezone.utc) - timedelta(hours=int(setting(db, "review_sla_hours", "24")))
    overdue_reviews = (
        (db.scalar(
            select(func.count()).select_from(Dish).join(Kitchen, Kitchen.id == Dish.kitchen_id).join(User, User.id == Kitchen.owner_id).where(
                Dish.status == "pending_review", func.coalesce(Dish.review_requested_at, Dish.created_at) < review_deadline, kitchen_scope
            )
        ) or 0)
        + (db.scalar(
            select(func.count()).select_from(ProofSubmission).join(Kitchen, Kitchen.owner_id == ProofSubmission.user_id).join(User, User.id == Kitchen.owner_id).where(
                ProofSubmission.status == "pending", ProofSubmission.submitted_at < review_deadline, kitchen_scope
            )
        ) or 0)
    )
    return {
        "range": range,
        "demo": demo,
        "delivered_orders": len(orders),
        "orders_placed": len(placed),
        "buyers_ordering": len({order.buyer_id for order in placed}),
        "average_paid_order_pkr": round(sum(order.total_pkr for order in orders if order.payment_status == "paid") / max(1, sum(order.payment_status == "paid" for order in orders))),
        "revenue_pkr": sum(order.total_pkr for order in orders if order.payment_status == "paid"),
        "active_vendors": db.scalar(
            select(func.count()).select_from(Kitchen).join(User, User.id == Kitchen.owner_id).where(
                Kitchen.status.in_(["active", "sample"] if demo else ["active"]), Kitchen.training_verified.is_(True), demo_scope(demo)
            )
        ) or 0,
        "pending_listings": pending_listings,
        "pending_proofs": pending_proofs,
        "open_hygiene_reports": open_flags,
        "overdue_reviews": overdue_reviews,
        "daily": daily_series(orders),
    }


@router.get("/admin/analytics/activity")
def recent_activity(admin: Admin, db: Db, demo: bool = False) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    events: list[dict] = []
    orders = db.scalars(
        select(Order).join(Kitchen, Kitchen.id == Order.kitchen_id).join(User, User.id == Kitchen.owner_id)
        .where(Order.placed_at >= since, demo_scope(demo)).order_by(Order.placed_at.desc()).limit(8)
    ).all()
    for order in orders:
        kitchen = db.get(Kitchen, order.kitchen_id)
        first_item = db.scalar(select(OrderItem).where(OrderItem.order_id == order.id).limit(1))
        events.append({
            "at": order.placed_at.isoformat(), "kind": "order",
            "title": "Order delivered" if order.status == "delivered" else "New order placed",
            "detail": f"{first_item.name + ' · ' if first_item else ''}{kitchen.name if kitchen else 'A kitchen'} · Rs {order.total_pkr:,}",
        })
    reports = db.scalars(
        select(HygieneReport).join(Kitchen, Kitchen.id == HygieneReport.kitchen_id).join(User, User.id == Kitchen.owner_id)
        .where(HygieneReport.created_at >= since, demo_scope(demo)).order_by(HygieneReport.created_at.desc()).limit(6)
    ).all()
    for report in reports:
        kitchen = db.get(Kitchen, report.kitchen_id)
        events.append({"at": report.created_at.isoformat(), "kind": "hygiene", "title": "New hygiene report", "detail": f"{kitchen.name if kitchen else 'A kitchen'} · needs admin review"})
    new_kitchens = db.scalars(
        select(Kitchen).join(User, User.id == Kitchen.owner_id)
        .where(Kitchen.created_at >= since, demo_scope(demo)).order_by(Kitchen.created_at.desc()).limit(5)
    ).all()
    for kitchen in new_kitchens:
        events.append({"at": kitchen.created_at.isoformat(), "kind": "kitchen", "title": "New kitchen application", "detail": f"{kitchen.name} · {kitchen.area}"})
    proofs = db.scalars(
        select(ProofSubmission).join(Kitchen, Kitchen.owner_id == ProofSubmission.user_id).join(User, User.id == Kitchen.owner_id)
        .where(ProofSubmission.submitted_at >= since, demo_scope(demo)).order_by(ProofSubmission.submitted_at.desc()).limit(5)
    ).all()
    for proof in proofs:
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == proof.user_id))
        events.append({"at": proof.submitted_at.isoformat(), "kind": "training", "title": "Training proof submitted", "detail": f"{kitchen.name if kitchen else 'A kitchen'} · {proof.module_id.replace('-', ' ')}"})
    events.sort(key=lambda event: event["at"], reverse=True)
    return {"items": events[:12], "definition": "Recent events from orders, hygiene reports, kitchen applications, and training submissions. Buyer identities are omitted."}


@router.get("/admin/analytics/leaderboard")
def leaderboard(admin: Admin, db: Db, range: str = "week", demo: bool = False) -> dict:
    since = range_start(range)
    vendors = db.execute(
        select(Kitchen.id, Kitchen.name, func.sum(Order.total_pkr), func.count(Order.id))
        .join(Order, Order.kitchen_id == Kitchen.id)
        .join(User, User.id == Kitchen.owner_id)
        .where(Order.status == "delivered", Order.payment_status == "paid", Order.placed_at >= since, demo_scope(demo))
        .group_by(Kitchen.id, Kitchen.name)
        .order_by(func.sum(Order.total_pkr).desc())
        .limit(20)
    ).all()
    dishes = db.execute(
        select(OrderItem.dish_id, OrderItem.name, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .join(Kitchen, Kitchen.id == Order.kitchen_id)
        .join(User, User.id == Kitchen.owner_id)
        .where(Order.status == "delivered", Order.placed_at >= since, demo_scope(demo))
        .group_by(OrderItem.dish_id, OrderItem.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(20)
    ).all()
    return {
        "vendors": [
            {"vendor_id": id_, "name": name, "revenue_pkr": int(revenue), "orders": count}
            for id_, name, revenue, count in vendors
        ],
        "dishes": [
            {"dish_id": id_, "name": name, "portions_sold": int(quantity)}
            for id_, name, quantity in dishes
        ],
    }


@router.get("/admin/analytics/demand")
def demand(admin: Admin, db: Db, range: str = "month", demo: bool = False) -> dict:
    orders = completed_orders(db, range_start(range), demo=demo)
    by_day_hour: Counter[tuple[int, int]] = Counter()
    by_area: Counter[str] = Counter()
    for order in orders:
        local = order.placed_at.replace(tzinfo=timezone.utc).astimezone(MARKET_TZ)
        by_day_hour[(local.weekday(), local.hour)] += 1
        kitchen = db.get(Kitchen, order.kitchen_id)
        if kitchen:
            by_area[kitchen.area] += 1
    return {
        "heatmap": [
            {"weekday": day, "hour": hour, "orders": count}
            for (day, hour), count in sorted(by_day_hour.items())
        ],
        "areas": [{"area": area, "orders": count} for area, count in by_area.most_common()],
        "daily": daily_series(orders),
    }


@router.get("/admin/analytics/revenue")
def revenue(admin: Admin, db: Db, range: str = "month", demo: bool = False) -> dict:
    orders = [order for order in completed_orders(db, range_start(range), demo=demo) if order.payment_status == "paid"]
    by_area: Counter[str] = Counter()
    for order in orders:
        kitchen = db.get(Kitchen, order.kitchen_id)
        if kitchen:
            by_area[kitchen.area] += order.total_pkr
    return {
        "total_pkr": sum(order.total_pkr for order in orders),
        "daily": daily_series(orders),
        "areas": [
            {"area": area, "revenue_pkr": amount}
            for area, amount in by_area.most_common()
        ],
        "payment_methods": [{"method": "cod", "revenue_pkr": sum(order.total_pkr for order in orders)}],
    }


@router.get("/seller/insights")
def seller_insights(user: CurrentUser, db: Db, range: str = "month") -> dict:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        return {"daily": [], "heatmap": [], "repeat_buyers": 0, "orders": 0}
    orders = completed_orders(db, range_start(range), kitchen.id, demo=user.email.endswith("@demo.nearbites.invalid"))
    by_day_hour: Counter[tuple[int, int]] = Counter()
    buyers: Counter[str] = Counter()
    for order in orders:
        local = order.placed_at.replace(tzinfo=timezone.utc).astimezone(MARKET_TZ)
        by_day_hour[(local.weekday(), local.hour)] += 1
        buyers[order.buyer_id] += 1
    return {
        "daily": daily_series(orders, include_delivery_fee=False),
        "heatmap": [
            {"weekday": day, "hour": hour, "orders": count}
            for (day, hour), count in sorted(by_day_hour.items())
        ],
        "repeat_buyers": sum(count > 1 for count in buyers.values()),
        "orders": len(orders),
        "average_rating": db.scalar(
            select(func.avg(Review.rating)).where(Review.kitchen_id == kitchen.id)
        ),
    }


@router.get("/seller/trust")
def seller_trust(user: CurrentUser, db: Db) -> dict:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        return {"tier": "standard", "reason": "Create a kitchen to build a track record"}
    return seller_track_record(db, kitchen)


@router.get("/admin/analytics/chefcam-shadow")
def chefcam_shadow(admin: Admin, db: Db, demo: bool = False) -> dict:
    rows = db.scalars(
        select(ProofSubmission)
        .join(Kitchen, Kitchen.owner_id == ProofSubmission.user_id)
        .join(User, User.id == Kitchen.owner_id)
        .where(ProofSubmission.module_id == "food-safety", ProofSubmission.model_result_json.is_not(None), demo_scope(demo))
    ).all()
    suggested = 0
    reviewed = 0
    disagreements = 0
    for row in rows:
        try:
            detections = json.loads(row.model_result_json or "{}").get("detections", [])
        except (TypeError, ValueError):
            continue
        high_confidence = all(
            any(item.get("label") == label and float(item.get("confidence", 0)) >= 0.85 for item in detections)
            for label in ("hairnet", "glove")
        )
        if high_confidence:
            suggested += 1
            if row.status in {"approved", "rejected"}:
                reviewed += 1
                disagreements += row.status == "rejected"
    return {
        "rule": "Both hairnet and glove detections at least 0.85",
        "mode": "shadow_only",
        "proofs_with_model_evidence": len(rows),
        "would_approve": suggested,
        "would_approve_reviewed": reviewed,
        "human_rejections_among_would_approve": disagreements,
        "note": ("Demo mode uses explicitly fictional detection scores on illustrations. " if demo else "") + "Human disagreement is not a measured false-accept rate. The model does not approve proofs.",
    }
