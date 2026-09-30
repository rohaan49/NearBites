from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_db
from .models import Dish, HygieneReport, Kitchen, Order, OrderItem, ProofSubmission, Review, User
from .operations import range_start, setting
from .security import current_user, require_admin


router = APIRouter()
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


def daily_series(orders: list[Order]) -> list[dict]:
    counts: Counter[str] = Counter()
    revenue: Counter[str] = Counter()
    for order in orders:
        day = order.placed_at.date().isoformat()
        counts[day] += 1
        if order.payment_status == "paid":
            revenue[day] += order.total_pkr
    return [
        {"day": day, "orders": counts[day], "revenue_pkr": revenue[day]}
        for day in sorted(counts)
    ]


@router.get("/admin/overview")
def overview(admin: Admin, db: Db, range: str = "week", demo: bool = False) -> dict:
    since = range_start(range)
    orders = completed_orders(db, since, demo=demo)
    kitchen_scope = demo_scope(demo)
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
                Dish.status == "pending_review", Dish.created_at < review_deadline, kitchen_scope
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
        "revenue_pkr": sum(order.total_pkr for order in orders if order.payment_status == "paid"),
        "active_vendors": db.scalar(
            select(func.count()).select_from(Kitchen).join(User, User.id == Kitchen.owner_id).where(
                Kitchen.status == "active", Kitchen.training_verified.is_(True), demo_scope(demo)
            )
        ) or 0,
        "pending_listings": pending_listings,
        "pending_proofs": pending_proofs,
        "open_hygiene_reports": open_flags,
        "overdue_reviews": overdue_reviews,
        "daily": daily_series(orders),
    }


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
        by_day_hour[(order.placed_at.weekday(), order.placed_at.hour)] += 1
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
    orders = completed_orders(db, range_start(range), kitchen.id)
    by_day_hour: Counter[tuple[int, int]] = Counter()
    buyers: Counter[str] = Counter()
    for order in orders:
        by_day_hour[(order.placed_at.weekday(), order.placed_at.hour)] += 1
        buyers[order.buyer_id] += 1
    return {
        "daily": daily_series(orders),
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
