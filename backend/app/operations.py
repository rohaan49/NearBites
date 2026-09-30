from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    AdminSetting,
    Dish,
    HygieneReport,
    Kitchen,
    ModerationEvent,
    Order,
    OrderItem,
    OrderStatusEvent,
    Review,
    User,
)
from .security import current_user, require_admin
from .email import notify


router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ReportIn(BaseModel):
    description: str = Field(min_length=10, max_length=2000)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


class AdminStatusIn(BaseModel):
    status: Literal["out_for_delivery", "delivered", "cancelled"]


class ReportDecisionIn(BaseModel):
    status: Literal["resolved", "dismissed"]
    reason: str = Field(min_length=5, max_length=500)


class CashReceivedIn(BaseModel):
    amount_pkr: int = Field(gt=0)


class SettingsIn(BaseModel):
    hygiene_flag_threshold: int = Field(ge=1, le=20)
    review_sla_hours: int = Field(ge=1, le=168)
    notifications_enabled: bool


def range_start(value: str) -> datetime:
    days = {"today": 1, "week": 7, "month": 30}.get(value)
    if days is None:
        raise HTTPException(422, "Range must be today, week, or month")
    return datetime.now(timezone.utc) - timedelta(days=days)


def kitchen_for(db: Session, user: User) -> Kitchen:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    return kitchen


def order_for_buyer(db: Session, order_id: str, user: User) -> Order:
    order = db.get(Order, order_id)
    if order is None or order.buyer_id != user.id:
        raise HTTPException(404, "Order not found")
    return order


def review_out(row: Review) -> dict:
    return {
        "id": row.id,
        "order_id": row.order_id,
        "rating": row.rating,
        "comment": row.comment,
        "created_at": row.created_at,
    }


@router.post("/orders/{order_id}/review", status_code=201)
def create_review(order_id: str, payload: ReviewIn, user: CurrentUser, db: Db) -> dict:
    order = order_for_buyer(db, order_id, user)
    if order.status != "delivered":
        raise HTTPException(409, "Only delivered orders can be reviewed")
    row = Review(
        order_id=order.id,
        buyer_id=user.id,
        kitchen_id=order.kitchen_id,
        **payload.model_dump(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Order already reviewed") from exc
    db.refresh(row)
    return review_out(row)


@router.get("/vendors/{vendor_id}/reviews")
def vendor_reviews(vendor_id: str, db: Db, limit: int = Query(20, ge=1, le=100)) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None or kitchen.status not in {"active", "sample"}:
        raise HTTPException(404, "Vendor not found")
    rows = db.scalars(
        select(Review)
        .where(Review.kitchen_id == vendor_id)
        .order_by(Review.created_at.desc())
        .limit(limit)
    ).all()
    rating = db.scalar(select(func.avg(Review.rating)).where(Review.kitchen_id == vendor_id))
    return {"rating": round(float(rating), 1) if rating is not None else None, "items": [review_out(r) for r in rows]}


@router.post("/orders/{order_id}/hygiene-reports", status_code=201)
def report_hygiene(order_id: str, payload: ReportIn, user: CurrentUser, db: Db) -> dict:
    order = order_for_buyer(db, order_id, user)
    if order.status not in {"accepted", "cooking", "ready", "out_for_delivery", "delivered"}:
        raise HTTPException(409, "The order has not been prepared")
    row = HygieneReport(
        order_id=order.id,
        buyer_id=user.id,
        kitchen_id=order.kitchen_id,
        description=payload.description,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A report already exists for this order") from exc
    db.refresh(row)
    return {"id": row.id, "status": row.status}


@router.get("/seller/dashboard")
def seller_dashboard(user: CurrentUser, db: Db, range: str = "week") -> dict:
    kitchen = kitchen_for(db, user)
    since = range_start(range)
    orders = db.scalars(
        select(Order).where(Order.kitchen_id == kitchen.id, Order.placed_at >= since)
    ).all()
    delivered = [o for o in orders if o.status == "delivered"]
    rating = db.scalar(select(func.avg(Review.rating)).where(Review.kitchen_id == kitchen.id))
    counts = db.execute(
        select(OrderItem.dish_id, OrderItem.name, func.sum(OrderItem.quantity))
        .join(Order)
        .where(Order.kitchen_id == kitchen.id, Order.status == "delivered", Order.placed_at >= since)
        .group_by(OrderItem.dish_id, OrderItem.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    ).all()
    daily = db.execute(
        select(func.date(Order.placed_at), func.count(Order.id))
        .where(Order.kitchen_id == kitchen.id, Order.placed_at >= since)
        .group_by(func.date(Order.placed_at))
        .order_by(func.date(Order.placed_at))
    ).all()
    return {
        "kitchen_id": kitchen.id,
        "training_verified": kitchen.training_verified,
        "orders": len(orders),
        "delivered_orders": len(delivered),
        "revenue_pkr": sum(o.subtotal_pkr for o in delivered if o.payment_status == "paid"),
        "rating": round(float(rating), 1) if rating is not None else None,
        "top_dishes": [{"dish_id": dish_id, "name": name, "quantity": int(qty)} for dish_id, name, qty in counts],
        "orders_by_day": [{"day": day, "orders": count} for day, count in daily],
    }


@router.get("/seller/review-insights")
def seller_review_insights(user: CurrentUser, db: Db) -> dict:
    kitchen = kitchen_for(db, user)
    rows = db.scalars(
        select(Review)
        .where(Review.kitchen_id == kitchen.id)
        .order_by(Review.created_at.desc())
        .limit(50)
    ).all()
    return {
        "total_reviews": db.scalar(
            select(func.count()).select_from(Review).where(Review.kitchen_id == kitchen.id)
        ) or 0,
        "average_rating": db.scalar(
            select(func.avg(Review.rating)).where(Review.kitchen_id == kitchen.id)
        ),
        "recent": [review_out(r) for r in rows],
    }


@router.get("/users/me/recommendations")
def recommendations(user: CurrentUser, db: Db, limit: int = Query(3, ge=1, le=20)) -> dict:
    # Rank real sales; add an affinity boost for kitchens the buyer has ordered from.
    familiar = {
        vendor_id: count
        for vendor_id, count in db.execute(
            select(Order.kitchen_id, func.count(Order.id))
            .where(Order.buyer_id == user.id, Order.status == "delivered")
            .group_by(Order.kitchen_id)
        )
    }
    sales = (
        select(OrderItem.dish_id, func.sum(OrderItem.quantity).label("sold"))
        .join(Order)
        .where(Order.status == "delivered")
        .group_by(OrderItem.dish_id)
        .subquery()
    )
    rows = db.execute(
        select(Dish, func.coalesce(sales.c.sold, 0))
        .join(Kitchen, Kitchen.id == Dish.kitchen_id)
        .outerjoin(sales, sales.c.dish_id == Dish.id)
        .where(
            Dish.status == "approved", Dish.portions_available > 0,
            Kitchen.status == "active", Kitchen.training_verified.is_(True),
            Kitchen.latitude.is_not(None), Kitchen.longitude.is_not(None),
        )
    ).all()
    ranked = sorted(rows, key=lambda pair: (int(pair[1]) + familiar.get(pair[0].kitchen_id, 0) * 3, pair[0].created_at), reverse=True)[:limit]
    return {
        "items": [
            {
                "id": dish.id,
                "vendor_id": dish.kitchen_id,
                "vendor_name": db.get(Kitchen, dish.kitchen_id).name,
                "area": db.get(Kitchen, dish.kitchen_id).area,
                "name": dish.name,
                "description": dish.description,
                "price_pkr": dish.price_pkr,
                "portion_size": dish.portion_size,
                "image_url": dish.image_url,
                "portions_available": dish.portions_available,
                "portions_total": dish.portions_total,
                "tag": dish.tag,
                "status": dish.status,
                "is_sample": False,
                "is_demo": dish.kitchen.owner.email.endswith("@demo.nearbites.invalid"),
                "sold": int(sold),
            }
            for dish, sold in ranked
        ]
    }


@router.get("/admin/buyers")
def admin_buyers(admin: Admin, db: Db, q: str | None = None) -> dict:
    stmt = select(User).where(User.role != "admin")
    if q:
        stmt = stmt.where(User.email.ilike(f"%{q}%"))
    rows = db.scalars(stmt.limit(100)).all()
    return {
        "items": [
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "role": row.role,
                "email_verified": row.email_verified,
                "is_sample": row.email.endswith("@demo.nearbites.invalid"),
                "orders": db.scalar(
                    select(func.count()).select_from(Order).where(Order.buyer_id == row.id)
                ) or 0,
            }
            for row in rows
        ]
    }


@router.get("/admin/vendors/{vendor_id}")
def admin_vendor_detail(vendor_id: str, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    owner = db.get(User, kitchen.owner_id)
    return {
        "id": kitchen.id,
        "name": kitchen.name,
        "area": kitchen.area,
        "status": kitchen.status,
        "training_verified": kitchen.training_verified,
        "owner": {"id": owner.id, "name": owner.name, "email": owner.email},
        "orders": db.scalar(
            select(func.count()).select_from(Order).where(Order.kitchen_id == kitchen.id)
        ) or 0,
        "open_hygiene_reports": db.scalar(
            select(func.count()).select_from(HygieneReport).where(
                HygieneReport.kitchen_id == kitchen.id, HygieneReport.status == "open"
            )
        ) or 0,
    }


@router.get("/admin/hygiene/flags")
def admin_hygiene_flags(admin: Admin, db: Db) -> dict:
    rows = db.scalars(
        select(HygieneReport)
        .where(HygieneReport.status == "open")
        .order_by(HygieneReport.created_at.desc())
    ).all()
    return {
        "items": [
            {
                "id": row.id,
                "order_id": row.order_id,
                "vendor_id": row.kitchen_id,
                "description": row.description,
                "status": row.status,
                "created_at": row.created_at,
                "is_demo": db.get(Kitchen, row.kitchen_id).owner.email.endswith("@demo.nearbites.invalid"),
            }
            for row in rows
        ]
    }


@router.patch("/admin/hygiene/flags/{flag_id}")
def decide_hygiene_flag(flag_id: str, payload: ReportDecisionIn, admin: Admin, db: Db) -> dict:
    row = db.get(HygieneReport, flag_id)
    if row is None:
        raise HTTPException(404, "Report not found")
    if row.status != "open":
        raise HTTPException(409, "Report already reviewed")
    row.status = payload.status
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="hygiene_report",
            target_id=row.id,
            action=payload.status,
            reason=payload.reason,
        )
    )
    db.commit()
    return {"id": row.id, "status": row.status}


@router.get("/admin/hygiene/watchlist")
def admin_watchlist(admin: Admin, db: Db) -> dict:
    threshold = int(setting(db, "hygiene_flag_threshold", "3"))
    rows = db.execute(
        select(HygieneReport.kitchen_id, func.count(HygieneReport.id))
        .where(HygieneReport.status == "open")
        .group_by(HygieneReport.kitchen_id)
        .having(func.count(HygieneReport.id) >= threshold)
    ).all()
    return {
        "items": [
            {"vendor_id": vendor_id, "name": db.get(Kitchen, vendor_id).name, "open_flags": count}
            for vendor_id, count in rows
        ]
    }


@router.post("/admin/vendors/{vendor_id}/suspension")
def suspend_vendor(vendor_id: str, payload: ReasonIn, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    kitchen.status = "suspended"
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="kitchen",
            target_id=vendor_id,
            action="suspend",
            reason=payload.reason,
        )
    )
    db.commit()
    return {"vendor_id": vendor_id, "status": kitchen.status}


@router.delete("/admin/vendors/{vendor_id}/suspension")
def reinstate_vendor(vendor_id: str, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None:
        raise HTTPException(404, "Kitchen not found")
    if kitchen.status != "suspended":
        raise HTTPException(409, "Kitchen is not suspended")
    kitchen.status = "active"
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="kitchen",
            target_id=vendor_id,
            action="reinstate",
        )
    )
    db.commit()
    return {"vendor_id": vendor_id, "status": kitchen.status}


@router.get("/admin/orders")
def admin_orders(admin: Admin, db: Db, status: str | None = None) -> dict:
    stmt = select(Order)
    if status:
        stmt = stmt.where(Order.status == status)
    rows = db.scalars(stmt.order_by(Order.placed_at.desc()).limit(100)).all()
    return {
        "items": [
            {
                "id": row.id,
                "buyer_id": row.buyer_id,
                "vendor_id": row.kitchen_id,
                "vendor_name": db.get(Kitchen, row.kitchen_id).name,
                "buyer_name": db.get(User, row.buyer_id).name,
                "status": row.status,
                "payment_status": row.payment_status,
                "total_pkr": row.total_pkr,
                "placed_at": row.placed_at,
                "is_demo": db.get(Kitchen, row.kitchen_id).owner.email.endswith("@demo.nearbites.invalid"),
            }
            for row in rows
        ]
    }


@router.patch("/admin/orders/{order_id}/status")
def admin_order_status(order_id: str, payload: AdminStatusIn, admin: Admin, db: Db) -> dict:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    allowed = {
        "placed": {"cancelled"},
        "accepted": {"cancelled"},
        "cooking": {"cancelled"},
        "ready": {"out_for_delivery", "cancelled"},
        "out_for_delivery": {"delivered", "cancelled"},
    }
    if payload.status not in allowed.get(order.status, set()):
        raise HTTPException(409, "Invalid order status transition")
    if payload.status == "cancelled" and order.status in {"placed", "accepted"}:
        for dish_id, quantity in db.execute(
            select(OrderItem.dish_id, OrderItem.quantity).where(OrderItem.order_id == order.id)
        ):
            dish = db.get(Dish, dish_id)
            dish.portions_available += quantity
    order.status = payload.status
    db.add(OrderStatusEvent(order_id=order.id, actor_id=admin.id, status=payload.status))
    db.commit()
    buyer = db.get(User, order.buyer_id)
    if buyer:
        notify(db, buyer, "NearBites delivery update", f"Order {order.id} is now {payload.status}.")
    return {"id": order.id, "status": order.status}


@router.post("/admin/orders/{order_id}/cash-received")
def record_cash_received(order_id: str, payload: CashReceivedIn, admin: Admin, db: Db) -> dict:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.payment_method != "cod" or order.status != "delivered":
        raise HTTPException(409, "Cash can only be confirmed for a delivered COD order")
    if order.payment_status != "unpaid":
        raise HTTPException(409, "Payment already recorded")
    if payload.amount_pkr != order.total_pkr:
        raise HTTPException(422, "Amount must match the order total")
    order.payment_status = "paid"
    db.add(
        ModerationEvent(
            actor_id=admin.id,
            target_type="order",
            target_id=order.id,
            action="cash_received",
            reason=f"PKR {payload.amount_pkr}",
        )
    )
    db.commit()
    return {"order_id": order.id, "payment_status": order.payment_status}


def setting(db: Session, key: str, fallback: str) -> str:
    row = db.get(AdminSetting, key)
    return row.value if row else fallback


@router.get("/admin/settings")
def get_settings(admin: Admin, db: Db) -> dict:
    return {
        "hygiene_flag_threshold": int(setting(db, "hygiene_flag_threshold", "3")),
        "review_sla_hours": int(setting(db, "review_sla_hours", "24")),
        "notifications_enabled": setting(db, "notifications_enabled", "true") == "true",
    }


@router.patch("/admin/settings")
def save_settings(payload: SettingsIn, admin: Admin, db: Db) -> dict:
    for key, value in payload.model_dump().items():
        row = db.get(AdminSetting, key)
        if row is None:
            row = AdminSetting(key=key, value=str(value).lower())
            db.add(row)
        else:
            row.value = str(value).lower()
            row.updated_at = datetime.now(timezone.utc)
        db.add(
            ModerationEvent(
                actor_id=admin.id,
                target_type="setting",
                target_id=key,
                action="update",
                reason=str(value),
            )
        )
    db.commit()
    return payload.model_dump()
