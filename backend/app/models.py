from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="buyer")
    view_preference: Mapped[str] = mapped_column(String(20), default="buyer")
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class Kitchen(Base):
    __tablename__ = "kitchens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    chef: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(160))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    bio: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    training_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retraining_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    dishes: Mapped[list["Dish"]] = relationship(back_populates="kitchen")
    owner: Mapped[User] = relationship()


class Dish(Base):
    __tablename__ = "dishes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kitchen_id: Mapped[str] = mapped_column(ForeignKey("kitchens.id"), index=True)
    name: Mapped[str] = mapped_column(String(140))
    description: Mapped[str] = mapped_column(Text, default="")
    price_pkr: Mapped[int] = mapped_column(Integer)
    cost_per_portion_pkr: Mapped[int | None] = mapped_column(Integer)
    portion_size: Mapped[str] = mapped_column(String(20), default="regular")
    image_url: Mapped[str | None] = mapped_column(Text)
    photo_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_photo_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    photo_challenge_code: Mapped[str | None] = mapped_column(String(8))
    photo_policy_required: Mapped[bool] = mapped_column(Boolean, default=False)
    portions_available: Mapped[int] = mapped_column(Integer)
    portions_total: Mapped[int] = mapped_column(Integer)
    tag: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20), default="pending_review")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    review_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utc_now)
    kitchen: Mapped[Kitchen] = relationship(back_populates="dishes")


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    line1: Mapped[str] = mapped_column(String(255))
    area: Mapped[str] = mapped_column(String(160))
    city: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("buyer_id", "idempotency_key"),
        Index("ix_orders_status_placed_at", "status", "placed_at"),
        Index("ix_orders_kitchen_placed_at", "kitchen_id", "placed_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kitchen_id: Mapped[str] = mapped_column(ForeignKey("kitchens.id"), index=True)
    address_id: Mapped[str] = mapped_column(ForeignKey("addresses.id"))
    idempotency_key: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="placed")
    payment_method: Mapped[str] = mapped_column(String(20), default="cod")
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid")
    subtotal_pkr: Mapped[int] = mapped_column(Integer)
    delivery_fee_pkr: Mapped[int] = mapped_column(Integer)
    total_pkr: Mapped[int] = mapped_column(Integer)
    placed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    dish_id: Mapped[str] = mapped_column(ForeignKey("dishes.id"))
    name: Mapped[str] = mapped_column(String(140))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_pkr: Mapped[int] = mapped_column(Integer)
    order: Mapped[Order] = relationship(back_populates="items")


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kitchen_id: Mapped[str] = mapped_column(ForeignKey("kitchens.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    price_pkr: Mapped[int] = mapped_column(Integer)
    capacity: Mapped[int] = mapped_column(Integer)
    delivery_time: Mapped[str] = mapped_column(String(5))
    menu: Mapped[dict[str, list[str]]] = mapped_column(JSON)
    published: Mapped[bool] = mapped_column(Boolean, default=False)


class MealSubscription(Base):
    __tablename__ = "meal_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("meal_plans.id"), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    plan_name: Mapped[str] = mapped_column(String(120))
    delivery_address: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")


class MealDelivery(Base):
    __tablename__ = "meal_deliveries"
    __table_args__ = (UniqueConstraint("subscription_id", "delivery_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    subscription_id: Mapped[str] = mapped_column(ForeignKey("meal_subscriptions.id"), index=True)
    delivery_date: Mapped[date] = mapped_column(Date, index=True)
    delivery_time: Mapped[str] = mapped_column(String(5))
    dish_id: Mapped[str] = mapped_column(ForeignKey("dishes.id"))
    dish_name: Mapped[str] = mapped_column(String(140))
    total_pkr: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="scheduled")


class EmailCode(Base):
    __tablename__ = "email_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(30))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class TrainingModule(Base):
    __tablename__ = "training_modules"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    proof_instruction: Mapped[str] = mapped_column(Text)
    questions_json: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("training_modules.id"))
    score: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class TrainingAcknowledgement(Base):
    __tablename__ = "training_acknowledgements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("training_modules.id"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProofSubmission(Base):
    __tablename__ = "proof_submissions"
    __table_args__ = (Index("ix_proofs_status_submitted_at", "status", "submitted_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("training_modules.id"))
    filename: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    model_result_json: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reason: Mapped[str | None] = mapped_column(String(500))
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("order_id", "buyer_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kitchen_id: Mapped[str] = mapped_column(ForeignKey("kitchens.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class HygieneReport(Base):
    __tablename__ = "hygiene_reports"
    __table_args__ = (
        UniqueConstraint("order_id", "buyer_id", name="uq_hygiene_reports_order_buyer"),
        Index("ix_hygiene_status_kitchen", "status", "kitchen_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    kitchen_id: Mapped[str] = mapped_column(ForeignKey("kitchens.id"), index=True)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ModerationEvent(Base):
    __tablename__ = "moderation_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(40))
    reason: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ReviewAssignment(Base):
    __tablename__ = "review_assignments"
    __table_args__ = (UniqueConstraint("target_type", "target_id", name="uq_review_assignment_target"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[str] = mapped_column(String(36))
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True)
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(30))
    source: Mapped[str] = mapped_column(String(20), default="upload")
    challenge_code: Mapped[str | None] = mapped_column(String(8))
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
