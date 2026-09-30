import os
from urllib.parse import urlparse
from math import asin, cos, radians, sin, sqrt
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .database import get_db
from .models import (
    Address,
    Dish,
    Kitchen,
    Order,
    OrderItem,
    OrderStatusEvent,
    ModerationEvent,
    RefreshSession,
    StoredFile,
    Review,
    User,
)
from .schemas import (
    AddressIn,
    AvailabilityIn,
    DecisionIn,
    DishIn,
    DishPatch,
    KitchenIn,
    KitchenPatch,
    LoginIn,
    OrderIn,
    OrderStatusIn,
    ProfilePatch,
    PreferenceIn,
    QuoteIn,
    RefreshIn,
    RegisterIn,
)
from .security import current_user, decode_token, password_hash, require_admin, tokens_for
from .email import create_and_send_code, notify
from .auth_extra import router as auth_router
from .media import router as media_router
from .training import router as training_router
from .operations import router as operations_router
from .analytics import router as analytics_router
from .admin_users import router as admin_users_router
from .chefcam import router as chefcam_router


api = FastAPI(title="NearBites API", version="0.1.0")
api.include_router(auth_router)
api.include_router(media_router)
api.include_router(training_router)
api.include_router(operations_router)
api.include_router(analytics_router)
api.include_router(admin_users_router)
api.include_router(chefcam_router)
api.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8080")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
app = FastAPI(title="NearBites")
app.mount("/api/v1", api)

Db = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]
Admin = Annotated[User, Depends(require_admin)]


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "view_preference": user.view_preference,
        "email_verified": user.email_verified,
        "created_at": user.created_at,
    }


def kitchen_out(kitchen: Kitchen) -> dict:
    return {
        "id": kitchen.id,
        "name": kitchen.name,
        "chef": kitchen.chef,
        "area": kitchen.area,
        "location_set": kitchen.latitude is not None and kitchen.longitude is not None,
        "bio": kitchen.bio,
        "status": kitchen.status,
        "training_verified": kitchen.training_verified,
        "is_sample": kitchen.status == "sample",
        "is_demo": kitchen.owner.email.endswith("@demo.nearbites.invalid"),
        "created_at": kitchen.created_at,
    }


def public_kitchen_out(db: Session, kitchen: Kitchen) -> dict:
    rating = db.scalar(select(func.avg(Review.rating)).where(Review.kitchen_id == kitchen.id))
    review_count = db.scalar(select(func.count()).select_from(Review).where(Review.kitchen_id == kitchen.id)) or 0
    return {
        **kitchen_out(kitchen),
        "rating": round(float(rating), 1) if rating is not None else None,
        "review_count": review_count,
        "is_sample": kitchen.status == "sample",
    }


def dish_out(dish: Dish) -> dict:
    return {
        "id": dish.id,
        "vendor_id": dish.kitchen_id,
        "vendor_name": dish.kitchen.name,
        "area": dish.kitchen.area,
        "name": dish.name,
        "description": dish.description,
        "price_pkr": dish.price_pkr,
        "portion_size": dish.portion_size,
        "image_url": dish.image_url,
        "portions_available": dish.portions_available,
        "portions_total": dish.portions_total,
        "tag": dish.tag,
        "status": dish.status,
        "is_sample": dish.status == "sample",
        "is_demo": dish.kitchen.owner.email.endswith("@demo.nearbites.invalid"),
        "created_at": dish.created_at,
    }


def address_out(address: Address) -> dict:
    return {
        "id": address.id,
        "label": address.label,
        "line1": address.line1,
        "area": address.area,
        "city": address.city,
        "latitude": address.latitude,
        "longitude": address.longitude,
        "is_default": address.is_default,
    }


def order_out(order: Order) -> dict:
    return {
        "id": order.id,
        "buyer_id": order.buyer_id,
        "vendor_id": order.kitchen_id,
        "address_id": order.address_id,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "subtotal_pkr": order.subtotal_pkr,
        "delivery_fee_pkr": order.delivery_fee_pkr,
        "total_pkr": order.total_pkr,
        "placed_at": order.placed_at,
        "items": [
            {
                "dish_id": item.dish_id,
                "name": item.name,
                "quantity": item.quantity,
                "unit_price_pkr": item.unit_price_pkr,
            }
            for item in order.items
        ],
    }


def own_kitchen(db: Session, user: User) -> Kitchen:
    kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id))
    if kitchen is None:
        raise not_found("Kitchen")
    return kitchen


def validate_listing_image(db: Session, user: User, image_url: str | None) -> str:
    if not image_url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a real dish photo")
    path = urlparse(image_url).path
    if not path.startswith("/api/v1/media/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use your uploaded dish photo")
    file_id = path.split("/")[-1]
    stored = db.get(StoredFile, file_id)
    if stored is None or stored.owner_id != user.id or stored.kind != "public_image":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Use your uploaded dish photo")
    base = os.getenv("API_PUBLIC_BASE_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")
    return f"{base}/media/{file_id}"


def order_with_items(db: Session, order_id: str) -> Order:
    order = db.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    if order is None:
        raise not_found("Order")
    return order


def priced_lines(db: Session, lines: list, address_id: str, buyer_id: str) -> tuple[list, int, int, str]:
    address = db.get(Address, address_id)
    if address is None or address.user_id != buyer_id:
        raise not_found("Address")
    ids = [line.dish_id for line in lines]
    if len(ids) != len(set(ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Duplicate dish IDs")
    dishes = {
        dish.id: dish
        for dish in db.scalars(select(Dish).where(Dish.id.in_(ids))).all()
    }
    if len(dishes) != len(ids):
        raise HTTPException(status.HTTP_409_CONFLICT, "One or more dishes are unavailable")
    kitchen_ids = {dish.kitchen_id for dish in dishes.values()}
    if len(kitchen_ids) != 1:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One kitchen per order")
    kitchen_id = next(iter(kitchen_ids))
    kitchen = db.get(Kitchen, kitchen_id)
    if kitchen is None or kitchen.status != "active" or not kitchen.training_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "Kitchen unavailable")
    if (
        address.latitude is None or address.longitude is None
        or kitchen.latitude is None or kitchen.longitude is None
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Both kitchen and delivery address need map locations")
    if distance_km(address.latitude, address.longitude, kitchen.latitude, kitchen.longitude) > float(
        os.getenv("MAX_DELIVERY_KM", "10")
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "Address is outside this kitchen's delivery area")
    priced = []
    subtotal = 0
    for line in lines:
        dish = dishes[line.dish_id]
        if dish.status != "approved" or dish.portions_available < line.quantity:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{dish.name} is unavailable")
        subtotal += dish.price_pkr * line.quantity
        priced.append((dish, line.quantity))
    delivery_fee = int(os.getenv("DELIVERY_FEE_PKR", "80"))
    return priced, subtotal, delivery_fee, kitchen_id


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    a = sin(radians(lat2 - lat1) / 2) ** 2
    a += cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ** 2
    return 6371.0088 * 2 * asin(min(1.0, sqrt(a)))


def nearby(kitchen: Kitchen, lat: float | None, lng: float | None, radius_km: float | None) -> float | None:
    if radius_km is not None and (lat is None or lng is None):
        raise HTTPException(422, "Coordinates are required for radius search")
    if lat is None or lng is None or kitchen.latitude is None or kitchen.longitude is None:
        return None
    return round(distance_km(lat, lng, kitchen.latitude, kitchen.longitude), 2)


@api.get("/health")
def health() -> dict:
    return {"status": "ok"}


@api.post("/auth/register", status_code=201)
def register(payload: RegisterIn, db: Db) -> dict:
    email = str(payload.email).lower()
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=password_hash.hash(payload.password),
        role="seller" if payload.wants_to_sell else "buyer",
        view_preference="seller" if payload.wants_to_sell else "buyer",
    )
    db.add(user)
    try:
        db.flush()
        create_and_send_code(db, user, "verify")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from exc
    except Exception:
        db.rollback()
        raise
    db.refresh(user)
    return {**tokens_for(db, user), "user": user_out(user)}


@api.post("/auth/login")
def login(payload: LoginIn, db: Db) -> dict:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not password_hash.verify(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    return {**tokens_for(db, user), "user": user_out(user)}


@api.post("/auth/refresh")
def refresh(payload: RefreshIn, db: Db) -> dict:
    claims = decode_token(payload.refresh_token, "refresh")
    session = db.get(RefreshSession, claims.get("jti"))
    if session is None or session.revoked or session.user_id != claims["sub"]:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session unavailable")
    if session.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account unavailable")
    session.revoked = True
    db.commit()
    return {**tokens_for(db, user), "user": user_out(user)}


@api.post("/auth/logout", status_code=204)
def logout(payload: RefreshIn, db: Db) -> None:
    claims = decode_token(payload.refresh_token, "refresh")
    session = db.get(RefreshSession, claims.get("jti"))
    if session and session.user_id == claims["sub"]:
        session.revoked = True
        db.commit()


@api.get("/users/me")
def me(user: CurrentUser) -> dict:
    return user_out(user)


@api.patch("/users/me")
def update_me(payload: ProfilePatch, user: CurrentUser, db: Db) -> dict:
    user.name = payload.name.strip()
    db.commit()
    return user_out(user)


@api.patch("/users/me/preferences")
def update_preferences(payload: PreferenceIn, user: CurrentUser, db: Db) -> dict:
    user.view_preference = payload.view_preference
    db.commit()
    return user_out(user)


@api.get("/vendors")
def vendors(
    db: Db, q: str | None = None, area: str | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, gt=0, le=50),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    if radius_km is not None and (lat is None or lng is None):
        raise HTTPException(422, "Coordinates are required for radius search")
    stmt = select(Kitchen).where(
        or_(Kitchen.status == "sample", and_(Kitchen.status == "active", Kitchen.training_verified.is_(True))),
        Kitchen.latitude.is_not(None), Kitchen.longitude.is_not(None),
    )
    if q:
        stmt = stmt.where(or_(Kitchen.name.ilike(f"%{q}%"), Kitchen.chef.ilike(f"%{q}%")))
    if area:
        stmt = stmt.where(Kitchen.area.ilike(f"%{area}%"))
    rows = []
    for kitchen in db.scalars(stmt).all():
        distance = nearby(kitchen, lat, lng, radius_km)
        if radius_km is not None and (distance is None or distance > radius_km):
            continue
        rows.append({**public_kitchen_out(db, kitchen), "distance_km": distance})
    if lat is not None and lng is not None:
        rows.sort(key=lambda row: row["distance_km"] if row["distance_km"] is not None else float("inf"))
    else:
        rows.sort(key=lambda row: row["is_sample"])
    return {"items": rows[:limit]}


@api.get("/vendors/{vendor_id}")
def vendor(vendor_id: str, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None or (kitchen.status != "sample" and (kitchen.status != "active" or not kitchen.training_verified)) or kitchen.latitude is None or kitchen.longitude is None:
        raise not_found("Vendor")
    return public_kitchen_out(db, kitchen)


@api.get("/vendors/{vendor_id}/dishes")
def vendor_dishes(vendor_id: str, db: Db) -> dict:
    kitchen = db.get(Kitchen, vendor_id)
    if kitchen is None or (kitchen.status != "sample" and (kitchen.status != "active" or not kitchen.training_verified)) or kitchen.latitude is None or kitchen.longitude is None:
        raise not_found("Vendor")
    dishes = db.scalars(
        select(Dish).where(Dish.kitchen_id == vendor_id, Dish.status.in_(["approved", "sample"]))
    ).all()
    return {"items": [dish_out(dish) for dish in dishes]}


@api.get("/dishes")
def dishes(
    db: Db,
    q: str | None = None,
    vendor_id: str | None = None,
    area: str | None = None,
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, gt=0, le=50),
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    if radius_km is not None and (lat is None or lng is None):
        raise HTTPException(422, "Coordinates are required for radius search")
    stmt = select(Dish).join(Kitchen).where(
        or_(and_(Dish.status == "sample", Kitchen.status == "sample"), and_(Dish.status == "approved", Kitchen.status == "active", Kitchen.training_verified.is_(True))),
        Kitchen.latitude.is_not(None), Kitchen.longitude.is_not(None),
    )
    if q:
        stmt = stmt.where(or_(Dish.name.ilike(f"%{q}%"), Kitchen.name.ilike(f"%{q}%"), Kitchen.area.ilike(f"%{q}%")))
    if vendor_id:
        stmt = stmt.where(Dish.kitchen_id == vendor_id)
    if area:
        stmt = stmt.where(Kitchen.area.ilike(f"%{area}%"))
    rows = []
    for dish in db.scalars(stmt).all():
        distance = nearby(dish.kitchen, lat, lng, radius_km)
        if radius_km is not None and (distance is None or distance > radius_km):
            continue
        rows.append({**dish_out(dish), "distance_km": distance})
    if lat is not None and lng is not None:
        rows.sort(key=lambda row: row["distance_km"] if row["distance_km"] is not None else float("inf"))
    else:
        rows.sort(key=lambda row: row["is_sample"])
    return {"items": rows[:limit]}


@api.get("/dishes/{dish_id}")
def dish(dish_id: str, db: Db) -> dict:
    item = db.get(Dish, dish_id)
    if item is None or item.status not in {"approved", "sample"}:
        raise not_found("Dish")
    kitchen = db.get(Kitchen, item.kitchen_id)
    if kitchen is None or (kitchen.status != "sample" and (kitchen.status != "active" or not kitchen.training_verified)) or kitchen.latitude is None or kitchen.longitude is None:
        raise not_found("Dish")
    return dish_out(item)


@api.post("/seller/kitchen", status_code=201)
def create_kitchen(payload: KitchenIn, user: CurrentUser, db: Db) -> dict:
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email first")
    if user.role == "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin accounts cannot sell")
    if db.scalar(select(Kitchen).where(Kitchen.owner_id == user.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Kitchen already exists")
    kitchen = Kitchen(owner_id=user.id, **payload.model_dump())
    user.role = "seller"
    db.add(kitchen)
    db.commit()
    db.refresh(kitchen)
    return kitchen_out(kitchen)


@api.get("/seller/kitchen")
def get_own_kitchen(user: CurrentUser, db: Db) -> dict:
    return kitchen_out(own_kitchen(db, user))


@api.patch("/seller/kitchen")
def update_kitchen(payload: KitchenPatch, user: CurrentUser, db: Db) -> dict:
    kitchen = own_kitchen(db, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(kitchen, key, value)
    db.commit()
    return kitchen_out(kitchen)


@api.get("/seller/listings")
def own_listings(user: CurrentUser, db: Db) -> dict:
    kitchen = own_kitchen(db, user)
    items = db.scalars(select(Dish).where(Dish.kitchen_id == kitchen.id)).all()
    return {"items": [dish_out(item) for item in items]}


@api.post("/seller/listings", status_code=201)
def create_listing(payload: DishIn, user: CurrentUser, db: Db) -> dict:
    kitchen = own_kitchen(db, user)
    if kitchen.status != "active" or not kitchen.training_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Kitchen approval and training are required")
    image_url = validate_listing_image(db, user, payload.image_url)
    item = Dish(
        kitchen_id=kitchen.id,
        portions_total=payload.portions_available,
        **{**payload.model_dump(), "image_url": image_url},
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return dish_out(item)


@api.patch("/seller/listings/{listing_id}")
def update_listing(listing_id: str, payload: DishPatch, user: CurrentUser, db: Db) -> dict:
    kitchen = own_kitchen(db, user)
    item = db.get(Dish, listing_id)
    if item is None or item.kitchen_id != kitchen.id:
        raise not_found("Listing")
    changes = payload.model_dump(exclude_unset=True)
    if "image_url" in changes:
        changes["image_url"] = validate_listing_image(db, user, changes["image_url"])
    for key, value in changes.items():
        setattr(item, key, value)
    if set(changes) - {"portions_available"}:
        item.status = "pending_review"
    db.commit()
    return dish_out(item)


@api.patch("/seller/listings/{listing_id}/availability")
def update_availability(
    listing_id: str, payload: AvailabilityIn, user: CurrentUser, db: Db
) -> dict:
    kitchen = own_kitchen(db, user)
    item = db.get(Dish, listing_id)
    if item is None or item.kitchen_id != kitchen.id:
        raise not_found("Listing")
    item.portions_available = payload.portions_available
    item.portions_total = max(item.portions_total, payload.portions_available)
    if payload.paused and item.status == "approved":
        item.status = "paused"
    elif not payload.paused and item.status == "paused":
        item.status = "approved"
    db.commit()
    return dish_out(item)


@api.get("/users/me/addresses")
def addresses(user: CurrentUser, db: Db) -> dict:
    rows = db.scalars(select(Address).where(Address.user_id == user.id)).all()
    return {"items": [address_out(row) for row in rows]}


@api.post("/users/me/addresses", status_code=201)
def create_address(payload: AddressIn, user: CurrentUser, db: Db) -> dict:
    if payload.is_default:
        db.execute(
            update(Address).where(Address.user_id == user.id).values(is_default=False)
        )
    row = Address(user_id=user.id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return address_out(row)


@api.patch("/users/me/addresses/{address_id}")
def update_address(address_id: str, payload: AddressIn, user: CurrentUser, db: Db) -> dict:
    row = db.get(Address, address_id)
    if row is None or row.user_id != user.id:
        raise not_found("Address")
    if payload.is_default:
        db.execute(
            update(Address).where(Address.user_id == user.id).values(is_default=False)
        )
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return address_out(row)


@api.delete("/users/me/addresses/{address_id}", status_code=204)
def delete_address(address_id: str, user: CurrentUser, db: Db) -> None:
    row = db.get(Address, address_id)
    if row is None or row.user_id != user.id:
        raise not_found("Address")
    if db.scalar(select(Order.id).where(Order.address_id == row.id).limit(1)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Address used by an order")
    db.delete(row)
    db.commit()


@api.post("/orders/quote")
def quote(payload: QuoteIn, user: CurrentUser, db: Db) -> dict:
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email first")
    priced, subtotal, delivery_fee, vendor_id = priced_lines(
        db, payload.items, payload.address_id, user.id
    )
    return {
        "vendor_id": vendor_id,
        "items": [
            {"dish_id": dish.id, "name": dish.name, "quantity": qty, "unit_price_pkr": dish.price_pkr}
            for dish, qty in priced
        ],
        "subtotal_pkr": subtotal,
        "delivery_fee_pkr": delivery_fee,
        "total_pkr": subtotal + delivery_fee,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
    }


@api.post("/orders", status_code=201)
def create_order(
    payload: OrderIn,
    user: CurrentUser,
    db: Db,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
) -> dict:
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Verify your email first")
    existing = db.scalar(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.buyer_id == user.id, Order.idempotency_key == idempotency_key)
    )
    if existing:
        return order_out(existing)
    priced, subtotal, delivery_fee, vendor_id = priced_lines(
        db, payload.items, payload.address_id, user.id
    )
    order = Order(
        buyer_id=user.id,
        kitchen_id=vendor_id,
        address_id=payload.address_id,
        idempotency_key=idempotency_key,
        subtotal_pkr=subtotal,
        delivery_fee_pkr=delivery_fee,
        total_pkr=subtotal + delivery_fee,
        payment_method="cod",
    )
    db.add(order)
    db.flush()
    for item, quantity in priced:
        result = db.execute(
            update(Dish)
            .where(
                Dish.id == item.id,
                Dish.status == "approved",
                Dish.portions_available >= quantity,
            )
            .values(portions_available=Dish.portions_available - quantity)
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, f"{item.name} sold out")
        db.add(
            OrderItem(
                order_id=order.id,
                dish_id=item.id,
                name=item.name,
                quantity=quantity,
                unit_price_pkr=item.price_pkr,
            )
        )
    db.add(OrderStatusEvent(order_id=order.id, actor_id=user.id, status="placed"))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.buyer_id == user.id, Order.idempotency_key == idempotency_key)
        )
        if existing:
            return order_out(existing)
        raise HTTPException(status.HTTP_409_CONFLICT, "Order conflict") from exc
    seller = db.get(User, db.get(Kitchen, vendor_id).owner_id)
    notify(db, user, "NearBites order placed", f"Your order {order.id} was placed for PKR {order.total_pkr}.")
    if seller:
        notify(db, seller, "New NearBites order", f"New order {order.id} needs your response.")
    return order_out(order_with_items(db, order.id))


@api.get("/orders")
def buyer_orders(user: CurrentUser, db: Db, limit: int = Query(20, ge=1, le=100)) -> dict:
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.buyer_id == user.id)
        .order_by(Order.placed_at.desc())
        .limit(limit)
    ).all()
    return {"items": [order_out(row) for row in rows]}


@api.get("/orders/{order_id}")
def order_detail(order_id: str, user: CurrentUser, db: Db) -> dict:
    row = order_with_items(db, order_id)
    kitchen = db.get(Kitchen, row.kitchen_id)
    if row.buyer_id != user.id and user.role != "admin" and kitchen.owner_id != user.id:
        raise not_found("Order")
    return order_out(row)


@api.get("/seller/orders")
def seller_orders(user: CurrentUser, db: Db, limit: int = Query(20, ge=1, le=100)) -> dict:
    kitchen = own_kitchen(db, user)
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.kitchen_id == kitchen.id)
        .order_by(Order.placed_at.desc())
        .limit(limit)
    ).all()
    return {"items": [order_out(row) for row in rows]}


@api.patch("/seller/orders/{order_id}/status")
def seller_order_status(order_id: str, payload: OrderStatusIn, user: CurrentUser, db: Db) -> dict:
    kitchen = own_kitchen(db, user)
    order = order_with_items(db, order_id)
    if order.kitchen_id != kitchen.id:
        raise not_found("Order")
    allowed = {
        "placed": {"accepted", "rejected"},
        "accepted": {"cooking"},
        "cooking": {"ready"},
    }
    if payload.status not in allowed.get(order.status, set()):
        raise HTTPException(status.HTTP_409_CONFLICT, "Invalid order status transition")
    if payload.status == "rejected":
        for item in order.items:
            db.execute(
                update(Dish)
                .where(Dish.id == item.dish_id)
                .values(portions_available=Dish.portions_available + item.quantity)
            )
    order.status = payload.status
    db.add(OrderStatusEvent(order_id=order.id, actor_id=user.id, status=payload.status))
    db.commit()
    buyer = db.get(User, order.buyer_id)
    if buyer:
        notify(db, buyer, "NearBites order update", f"Order {order.id} is now {payload.status}.")
    return order_out(order)


@api.get("/admin/kitchens")
def admin_kitchens(admin: Admin, db: Db, status_filter: str | None = Query(None, alias="status")) -> dict:
    stmt = select(Kitchen)
    if status_filter:
        stmt = stmt.where(Kitchen.status == status_filter)
    return {"items": [kitchen_out(k) for k in db.scalars(stmt).all()]}


@api.post("/admin/kitchens/{kitchen_id}/decision")
def decide_kitchen(kitchen_id: str, payload: DecisionIn, admin: Admin, db: Db) -> dict:
    kitchen = db.get(Kitchen, kitchen_id)
    if kitchen is None:
        raise not_found("Kitchen")
    if kitchen.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "Kitchen is not pending")
    if payload.decision == "reject" and not payload.reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reason required")
    kitchen.status = "active" if payload.decision == "approve" else "rejected"
    db.add(ModerationEvent(actor_id=admin.id, target_type="kitchen", target_id=kitchen.id, action=payload.decision, reason=payload.reason))
    db.commit()
    return kitchen_out(kitchen)


@api.get("/admin/listings")
def admin_listings(admin: Admin, db: Db, status_filter: str | None = Query(None, alias="status")) -> dict:
    stmt = select(Dish)
    if status_filter:
        stmt = stmt.where(Dish.status == status_filter)
    return {"items": [dish_out(d) for d in db.scalars(stmt).all()]}


@api.post("/admin/listings/{listing_id}/decision")
def decide_listing(listing_id: str, payload: DecisionIn, admin: Admin, db: Db) -> dict:
    item = db.get(Dish, listing_id)
    if item is None:
        raise not_found("Listing")
    if item.status != "pending_review":
        raise HTTPException(status.HTTP_409_CONFLICT, "Listing is not pending")
    if payload.decision == "reject" and not payload.reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reason required")
    item.status = "approved" if payload.decision == "approve" else "rejected"
    db.add(ModerationEvent(actor_id=admin.id, target_type="listing", target_id=item.id, action=payload.decision, reason=payload.reason))
    db.commit()
    return dish_out(item)
