"""Explainable internal seller track record; it does not certify food safety."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import HygieneReport, Kitchen, Order, Review


def seller_track_record(db: Session, kitchen: Kitchen) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=90)
    orders = db.scalars(select(Order).where(Order.kitchen_id == kitchen.id, Order.placed_at >= since)).all()
    delivered = sum(order.status == "delivered" for order in orders)
    cancelled = sum(order.status in {"cancelled", "rejected"} for order in orders)
    reports = db.scalars(select(HygieneReport).where(
        HygieneReport.kitchen_id == kitchen.id, HygieneReport.created_at >= since,
        HygieneReport.status != "dismissed",
    )).all()
    reviews = db.scalars(select(Review).where(Review.kitchen_id == kitchen.id, Review.created_at >= since)).all()
    rating = round(sum(row.rating for row in reviews) / len(reviews), 2) if reviews else None
    cancel_rate = cancelled / len(orders) if orders else None
    eligible = (
        kitchen.training_verified and kitchen.status in {"active", "sample"} and delivered >= 20
        and len(reports) == 0 and len(reviews) >= 5 and rating is not None and rating >= 4.5
        and cancel_rate is not None and cancel_rate <= 0.05
    )
    return {
        "tier": "established" if eligible else "standard",
        "window_days": 90,
        "delivered_orders": delivered,
        "cancelled_or_rejected_orders": cancelled,
        "cancellation_rate": round(cancel_rate, 3) if cancel_rate is not None else None,
        "review_count": len(reviews),
        "average_rating": rating,
        "open_or_resolved_hygiene_reports": len(reports),
        "criteria": "20 delivered orders, 5 reviews, rating at least 4.5, cancellations at most 5%, no open or resolved hygiene reports, current training verification in 90 days",
        "effect": "Review priority context only; no automatic publishing or safety approval",
    }
