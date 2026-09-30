from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    wants_to_sell: bool = False


class LoginIn(BaseModel):
    # Existing fictional demo accounts use .invalid; registration still requires EmailStr.
    email: str = Field(min_length=3, max_length=255)
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class ProfilePatch(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class PreferenceIn(BaseModel):
    view_preference: Literal["buyer", "seller", "both"]


class KitchenIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    chef: str = Field(min_length=2, max_length=120)
    area: str = Field(min_length=2, max_length=160)
    bio: str = Field(default="", max_length=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class KitchenPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    chef: str | None = Field(default=None, min_length=2, max_length=120)
    area: str | None = Field(default=None, min_length=2, max_length=160)
    bio: str | None = Field(default=None, max_length=2000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class DishIn(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    description: str = Field(default="", max_length=2000)
    price_pkr: int = Field(gt=0, le=100_000)
    portion_size: Literal["small", "regular", "large"] = "regular"
    image_url: str | None = Field(default=None, max_length=2000)
    portions_available: int = Field(ge=0, le=10_000)
    tag: str | None = Field(default=None, max_length=80)


class DishPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    description: str | None = Field(default=None, max_length=2000)
    price_pkr: int | None = Field(default=None, gt=0, le=100_000)
    portion_size: Literal["small", "regular", "large"] | None = None
    image_url: str | None = Field(default=None, max_length=2000)
    portions_available: int | None = Field(default=None, ge=0, le=10_000)
    tag: str | None = Field(default=None, max_length=80)


class AvailabilityIn(BaseModel):
    portions_available: int = Field(ge=0, le=10_000)
    paused: bool = False


class AddressIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    line1: str = Field(min_length=3, max_length=255)
    area: str = Field(min_length=2, max_length=160)
    city: str = Field(min_length=2, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    is_default: bool = False


class OrderLineIn(BaseModel):
    dish_id: str
    quantity: int = Field(ge=1, le=100)


class QuoteIn(BaseModel):
    address_id: str
    items: list[OrderLineIn] = Field(min_length=1, max_length=50)


class OrderIn(QuoteIn):
    payment_method: Literal["cod"] = "cod"


class OrderStatusIn(BaseModel):
    status: Literal["accepted", "rejected", "cooking", "ready"]


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=500)
