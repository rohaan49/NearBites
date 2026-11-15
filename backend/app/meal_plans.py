import json
import os
from calendar import monthrange
from datetime import date, timedelta
from hashlib import sha256
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .analytics import MARKET_TZ
from .database import get_db
from .delivery import validate_delivery_area
from .models import Address, Dish, Kitchen, MealDelivery, MealPlan, MealSubscription, User, utc_now
from .security import current_user
from .training import local_order_test_kitchen, seller_kitchen

router = APIRouter()
Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
DeliveryTime = Annotated[str, Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")]


class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    price_pkr: int = Field(ge=1, le=50000)
    capacity: int = Field(ge=1, le=100)
    delivery_time: DeliveryTime
    menu: dict[str, list[str]] = Field(min_length=1, max_length=7)
    published: bool = False


class SelectionIn(BaseModel):
    address_id: str = Field(min_length=1, max_length=36)
    start_date: date
    choices: dict[str, str] = Field(min_length=1, max_length=7)


class SubscriptionIn(SelectionIn):
    quote_version: str = Field(pattern=r"^[0-9a-f]{64}$")


class BuyerDeliveryIn(BaseModel):
    status: Literal["skipped", "scheduled"]


class SellerDeliveryIn(BaseModel):
    status: Literal["preparing", "delivered", "cancelled"]


def local_today() -> date:
    return utc_now().astimezone(MARKET_TZ).date()


def delivery_fee() -> int:
    return int(os.getenv("DELIVERY_FEE_PKR", "80"))


def eligible_kitchen(db: Session, kitchen: Kitchen) -> bool:
    return (
        kitchen.status == "active" and kitchen.training_verified
        and kitchen.latitude is not None and kitchen.longitude is not None
        and (not kitchen.owner.email.endswith("@demo.nearbites.invalid") or local_order_test_kitchen(db, kitchen))
    )


def lock_plan(db: Session, plan_id: str) -> MealPlan:
    # A write locks the plan on PostgreSQL and serializes writers on SQLite.
    db.execute(update(MealPlan).where(MealPlan.id == plan_id).values(capacity=MealPlan.capacity))
    plan = db.get(MealPlan, plan_id, populate_existing=True)
    if not plan:
        raise HTTPException(404, "Meal plan not found")
    return plan


def menu_dishes(db: Session, plan: MealPlan) -> dict[str, Dish]:
    ids = {dish_id for options in plan.menu.values() for dish_id in options}
    return {dish.id: dish for dish in db.scalars(
        select(Dish).where(Dish.kitchen_id == plan.kitchen_id, Dish.id.in_(ids))
    )}


def plan_out(plan: MealPlan, kitchen: Kitchen, dishes: dict[str, Dish], *, seller: bool = False) -> dict:
    return {
        "id": plan.id,
        "kitchen_id": kitchen.id,
        "kitchen_name": kitchen.name,
        "area": kitchen.area,
        "is_demo": kitchen.owner.email.endswith("@demo.nearbites.invalid"),
        "name": plan.name,
        "price_pkr": plan.price_pkr,
        "delivery_fee_pkr": delivery_fee(),
        "delivery_time": plan.delivery_time,
        "capacity": plan.capacity,
        "published": plan.published,
        "menu": {
            day: [
                {"id": dish_id, "name": dishes[dish_id].name, "description": dishes[dish_id].description}
                for dish_id in options if dish_id in dishes and (seller or dishes[dish_id].status == "approved")
            ]
            for day, options in plan.menu.items()
        },
    }


def save_plan(db: Session, kitchen: Kitchen, plan: MealPlan, data: PlanIn) -> dict:
    name = data.name.strip()
    if len(name) < 2:
        raise HTTPException(422, "Enter a plan name")
    if data.published and not eligible_kitchen(db, kitchen):
        raise HTTPException(409, "Only active, verified kitchens with a map location can publish plans")
    if any(day not in "0123456" or len(day) != 1 or not 1 <= len(options) <= 3
           or len(options) != len(set(options)) for day, options in data.menu.items()):
        raise HTTPException(422, "Choose one to three distinct dishes on each meal day")
    ids = {dish_id for options in data.menu.values() for dish_id in options}
    dishes = {dish.id: dish for dish in db.scalars(select(Dish).where(
        Dish.kitchen_id == kitchen.id, Dish.status == "approved", Dish.id.in_(ids)
    ))}
    if ids != dishes.keys():
        raise HTTPException(422, "Use approved dishes from your kitchen")
    if plan.id and data.capacity < plan.capacity:
        over_capacity = db.scalar(
            select(MealDelivery.delivery_date)
            .join(MealSubscription, MealSubscription.id == MealDelivery.subscription_id)
            .where(MealSubscription.plan_id == plan.id, MealDelivery.delivery_date >= local_today(),
                   MealDelivery.status.in_(["scheduled", "preparing", "delivered"]))
            .group_by(MealDelivery.delivery_date)
            .having(func.count(MealDelivery.id) > data.capacity)
            .limit(1)
        )
        if over_capacity:
            raise HTTPException(409, "Daily capacity cannot be lower than the meals already booked")
    for key, value in data.model_dump().items():
        setattr(plan, key, value)
    plan.name = name
    db.add(plan)
    db.commit()
    return plan_out(plan, kitchen, dishes, seller=True)


@router.get("/seller/meal-plans")
def seller_plans(user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    plans = db.scalars(select(MealPlan).where(MealPlan.kitchen_id == kitchen.id).order_by(MealPlan.name))
    return {"items": [plan_out(plan, kitchen, menu_dishes(db, plan), seller=True) for plan in plans],
            "can_publish": eligible_kitchen(db, kitchen), "today": local_today()}


@router.post("/seller/meal-plans", status_code=201)
def create_plan(data: PlanIn, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    return save_plan(db, kitchen, MealPlan(kitchen_id=kitchen.id), data)


@router.patch("/seller/meal-plans/{plan_id}")
def change_plan(plan_id: str, data: PlanIn, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    plan = lock_plan(db, plan_id)
    if plan.kitchen_id != kitchen.id:
        raise HTTPException(404, "Meal plan not found")
    return save_plan(db, kitchen, plan, data)


@router.post("/seller/meal-plans/{plan_id}/unpublish")
def unpublish_plan(plan_id: str, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    plan = lock_plan(db, plan_id)
    if plan.kitchen_id != kitchen.id:
        raise HTTPException(404, "Meal plan not found")
    plan.published = False
    db.commit()
    return plan_out(plan, kitchen, menu_dishes(db, plan), seller=True)


@router.get("/meal-plans")
def public_plans(db: Db, kitchen_id: str | None = None) -> dict:
    stmt = select(MealPlan, Kitchen).join(Kitchen, MealPlan.kitchen_id == Kitchen.id).where(
        MealPlan.published.is_(True), Kitchen.status == "active", Kitchen.training_verified.is_(True)
    ).order_by(Kitchen.name, MealPlan.name)
    if kitchen_id:
        stmt = stmt.where(Kitchen.id == kitchen_id)
    items = []
    for plan, kitchen in db.execute(stmt):
        if eligible_kitchen(db, kitchen):
            row = plan_out(plan, kitchen, menu_dishes(db, plan))
            if any(row["menu"].values()):
                items.append(row)
    return {"items": items, "earliest_start": local_today() + timedelta(days=1),
            "latest_start": local_today() + timedelta(days=30)}


def booked_counts(db: Session, plan_id: str, dates: list[date]) -> dict[date, int]:
    rows = db.execute(
        select(MealDelivery.delivery_date, func.count(MealDelivery.id))
        .join(MealSubscription, MealSubscription.id == MealDelivery.subscription_id)
        .where(MealSubscription.plan_id == plan_id, MealDelivery.delivery_date.in_(dates),
               MealDelivery.status.in_(["scheduled", "preparing", "delivered"]))
        .group_by(MealDelivery.delivery_date)
    )
    return dict(rows.all())


def subscription_quote(db: Session, plan: MealPlan, data: SelectionIn, user: User) -> tuple[dict, list[tuple[date, Dish]]]:
    if user.role == "admin" or not user.email_verified:
        raise HTTPException(403, "Use a verified buyer account to subscribe")
    kitchen = db.get(Kitchen, plan.kitchen_id)
    if not plan.published or not eligible_kitchen(db, kitchen):
        raise HTTPException(409, "This plan is unavailable")
    if kitchen.owner_id == user.id:
        raise HTTPException(422, "Choose a plan from another kitchen")
    if kitchen.owner.email.endswith("@demo.nearbites.invalid") != user.email.endswith("@demo.nearbites.invalid"):
        raise HTTPException(403, "Use a local demo buyer for fictional plans and a regular buyer for other plans")
    address = db.get(Address, data.address_id)
    if not address or address.user_id != user.id:
        raise HTTPException(404, "Choose one of your saved delivery addresses")
    validate_delivery_area(kitchen, address)

    start = data.start_date
    today = local_today()
    if not today + timedelta(days=1) <= start <= today + timedelta(days=30):
        raise HTTPException(422, "Start between tomorrow and 30 days from today")
    month = start.month % 12 + 1
    year = start.year + (month == 1)
    end = date(year, month, min(start.day, monthrange(year, month)[1])) - timedelta(days=1)
    choices = menu_dishes(db, plan)
    for day, dish_id in data.choices.items():
        dish = choices.get(dish_id)
        if dish_id not in plan.menu.get(day, []) or not dish or dish.status != "approved":
            raise HTTPException(409, "A selected dish is no longer on that day's menu")
    dates = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
    selected = [day for day in dates if str(day.weekday()) in data.choices]
    if db.scalar(select(MealSubscription.id).where(
        MealSubscription.plan_id == plan.id, MealSubscription.buyer_id == user.id,
        MealSubscription.status == "active", MealSubscription.start_date <= end,
        MealSubscription.end_date >= start,
    ).limit(1)):
        raise HTTPException(409, "You already have this plan during those dates")
    counts = booked_counts(db, plan.id, selected)
    for day in selected:
        if counts.get(day, 0) >= plan.capacity:
            raise HTTPException(409, f"This plan is full on {day:%d %B}. Try another weekday or start date.")
    schedule = [(day, choices[data.choices[str(day.weekday())]]) for day in selected]
    total = plan.price_pkr + delivery_fee()
    quote = {
        "end_date": end.isoformat(),
        "delivery_time": plan.delivery_time,
        "delivery_address": f"{address.line1}, {address.area}, {address.city}",
        "total_pkr": len(schedule) * total,
        "deliveries": [{"date": day.isoformat(), "dish_name": dish.name, "total_pkr": total} for day, dish in schedule],
    }
    reviewed = {
        "plan_name": plan.name, "quote": quote,
        "selection": data.model_dump(mode="json", include=set(SelectionIn.model_fields)),
        "location": [address.latitude, address.longitude],
        "ingredients": {dish.id: dish.description for _, dish in schedule},
    }
    quote["quote_version"] = sha256(json.dumps(reviewed, sort_keys=True).encode()).hexdigest()
    return quote, schedule


def delivery_out(row: MealDelivery, today: date | None = None, *, can_prepare: bool = True) -> dict:
    status = row.status
    if today is not None and row.delivery_date < today and status == "scheduled":
        status = "missed"
    if status == "scheduled" and not can_prepare:
        status = "unavailable"
    return {
        "id": row.id, "date": row.delivery_date, "time": row.delivery_time,
        "dish_name": row.dish_name, "total_pkr": row.total_pkr, "status": status,
    }


@router.post("/meal-plans/{plan_id}/quote")
def quote_plan(plan_id: str, data: SelectionIn, user: CurrentUser, db: Db) -> dict:
    plan = db.get(MealPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Meal plan not found")
    quote, _ = subscription_quote(db, plan, data, user)
    return quote


@router.post("/meal-plans/{plan_id}/subscribe", status_code=201)
def subscribe(
    plan_id: str, data: SubscriptionIn, user: CurrentUser, db: Db,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
) -> dict:
    plan = lock_plan(db, plan_id)
    subscription_id = str(uuid5(NAMESPACE_URL, f"nearbites:meal-subscription:{user.id}:{plan.id}:{idempotency_key}"))
    if db.get(MealSubscription, subscription_id):
        return {"id": subscription_id}
    quote, schedule = subscription_quote(db, plan, data, user)
    if quote["quote_version"] != data.quote_version:
        raise HTTPException(409, "The meal plan or address changed. Review the updated schedule before confirming.")
    subscription = MealSubscription(
        id=subscription_id, plan_id=plan.id, buyer_id=user.id, plan_name=plan.name,
        delivery_address=quote["delivery_address"],
        start_date=data.start_date, end_date=date.fromisoformat(quote["end_date"]),
    )
    db.add(subscription)
    db.flush()
    db.add_all([
        MealDelivery(subscription_id=subscription.id, delivery_date=day, delivery_time=quote["delivery_time"],
                     dish_id=dish.id, dish_name=dish.name, total_pkr=delivery["total_pkr"])
        for (day, dish), delivery in zip(schedule, quote["deliveries"], strict=True)
    ])
    db.commit()
    return {"id": subscription.id}


@router.get("/meal-subscriptions")
def buyer_subscriptions(user: CurrentUser, db: Db) -> dict:
    today = local_today()
    rows = db.execute(
        select(MealSubscription, Kitchen).join(MealPlan, MealPlan.id == MealSubscription.plan_id)
        .join(Kitchen, Kitchen.id == MealPlan.kitchen_id)
        .where(MealSubscription.buyer_id == user.id).order_by(MealSubscription.start_date.desc())
    ).all()
    deliveries: dict[str, list[dict]] = {}
    ready_kitchens = {kitchen.id: eligible_kitchen(db, kitchen) for _, kitchen in rows}
    ready_subscriptions = {sub.id for sub, kitchen in rows if ready_kitchens[kitchen.id]}
    for row, dish_status in db.execute(select(MealDelivery, Dish.status)
        .join(Dish, Dish.id == MealDelivery.dish_id).where(
        MealDelivery.subscription_id.in_([sub.id for sub, _ in rows])
    ).order_by(MealDelivery.delivery_date)):
        deliveries.setdefault(row.subscription_id, []).append(delivery_out(
            row, today, can_prepare=row.subscription_id in ready_subscriptions and dish_status == "approved",
        ))
    return {"today": today, "items": [
        {"id": sub.id, "plan_name": sub.plan_name, "kitchen_name": kitchen.name,
         "is_demo": kitchen.owner.email.endswith("@demo.nearbites.invalid"),
         "start_date": sub.start_date, "end_date": sub.end_date, "delivery_address": sub.delivery_address,
         "status": "ended" if sub.status == "active" and sub.end_date < today else sub.status,
         "deliveries": deliveries.get(sub.id, [])}
        for sub, kitchen in rows
    ]}


def owned_subscription(db: Session, subscription_id: str, user: User) -> MealSubscription:
    sub = db.get(MealSubscription, subscription_id)
    if not sub or sub.buyer_id != user.id:
        raise HTTPException(404, "Subscription not found")
    return sub


@router.post("/meal-subscriptions/{subscription_id}/cancel")
def cancel_subscription(subscription_id: str, user: CurrentUser, db: Db) -> dict:
    sub = owned_subscription(db, subscription_id, user)
    lock_plan(db, sub.plan_id)
    db.refresh(sub)
    today = local_today()
    if sub.status == "active" and sub.end_date < today:
        raise HTTPException(409, "This subscription has ended")
    if sub.status == "active":
        sub.status = "cancelled"
        db.execute(update(MealDelivery).where(
            MealDelivery.subscription_id == sub.id, MealDelivery.delivery_date > today,
            MealDelivery.status.in_(["scheduled", "skipped"]),
        ).values(status="cancelled"))
    db.commit()
    return {"status": sub.status}


@router.patch("/meal-subscriptions/{subscription_id}/deliveries/{delivery_id}")
def buyer_delivery(subscription_id: str, delivery_id: str, data: BuyerDeliveryIn, user: CurrentUser, db: Db) -> dict:
    sub = owned_subscription(db, subscription_id, user)
    plan = lock_plan(db, sub.plan_id)
    db.refresh(sub)
    row = db.get(MealDelivery, delivery_id)
    if not row or row.subscription_id != sub.id:
        raise HTTPException(404, "Scheduled meal not found")
    if sub.status != "active" or row.delivery_date <= local_today() or row.status not in {"scheduled", "skipped"}:
        raise HTTPException(409, "Changes close at midnight Pakistan time before delivery day")
    if data.status == "scheduled" and row.status == "skipped":
        kitchen = db.get(Kitchen, plan.kitchen_id)
        dish = db.get(Dish, row.dish_id)
        if not eligible_kitchen(db, kitchen) or not dish or dish.status != "approved":
            raise HTTPException(409, "The kitchen or dish is currently unavailable")
        if booked_counts(db, plan.id, [row.delivery_date]).get(row.delivery_date, 0) >= plan.capacity:
            raise HTTPException(409, "The seller is now fully booked for that day")
    row.status = data.status
    db.commit()
    return delivery_out(row)


@router.get("/seller/meal-deliveries")
def seller_deliveries(user: CurrentUser, db: Db, start: date | None = None) -> dict:
    kitchen = seller_kitchen(db, user)
    today = local_today()
    start = start or today
    if start > date.max - timedelta(days=6):
        raise HTTPException(422, "Choose an earlier week")
    end = start + timedelta(days=6)
    kitchen_ready = eligible_kitchen(db, kitchen)
    rows = db.execute(
        select(MealDelivery, MealSubscription, User.name, Dish.status)
        .join(MealSubscription, MealDelivery.subscription_id == MealSubscription.id)
        .join(MealPlan, MealPlan.id == MealSubscription.plan_id).join(User, User.id == MealSubscription.buyer_id)
        .join(Dish, Dish.id == MealDelivery.dish_id)
        .where(MealPlan.kitchen_id == kitchen.id, MealDelivery.delivery_date.between(start, end),
               MealDelivery.status != "skipped")
        .order_by(MealDelivery.delivery_date, MealDelivery.delivery_time)
    )
    return {"today": today, "start": start, "end": end, "items": [
        {**delivery_out(row, today, can_prepare=kitchen_ready and dish_status == "approved"),
         "plan_name": sub.plan_name, "buyer_name": name,
         "delivery_address": sub.delivery_address if (
             row.status == "preparing" or (
                 row.status == "scheduled" and row.delivery_date >= today and kitchen_ready and dish_status == "approved"
             )
         ) else None}
        for row, sub, name, dish_status in rows
    ]}


@router.patch("/seller/meal-deliveries/{delivery_id}")
def seller_delivery(delivery_id: str, data: SellerDeliveryIn, user: CurrentUser, db: Db) -> dict:
    kitchen = seller_kitchen(db, user)
    match = db.execute(select(MealDelivery, MealPlan.id)
        .join(MealSubscription, MealDelivery.subscription_id == MealSubscription.id)
        .join(MealPlan, MealPlan.id == MealSubscription.plan_id)
        .where(MealDelivery.id == delivery_id, MealPlan.kitchen_id == kitchen.id)).one_or_none()
    if not match:
        raise HTTPException(404, "Scheduled meal not found")
    row, plan_id = match
    lock_plan(db, plan_id)
    db.refresh(row)
    if data.status == row.status:
        return delivery_out(row)
    allowed = {"scheduled": {"preparing", "cancelled"}, "preparing": {"delivered", "cancelled"}}
    if data.status not in allowed.get(row.status, set()):
        raise HTTPException(409, "This meal cannot move to that status")
    if data.status == "preparing":
        if row.delivery_date != local_today():
            raise HTTPException(409, "Start preparation on the scheduled delivery day")
        dish = db.get(Dish, row.dish_id)
        if not eligible_kitchen(db, kitchen) or not dish or dish.status != "approved":
            raise HTTPException(409, "The kitchen or dish is currently unavailable")
    row.status = data.status
    db.commit()
    return delivery_out(row)
