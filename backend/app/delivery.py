import os
from math import asin, cos, radians, sin, sqrt

from fastapi import HTTPException

from .models import Address, Kitchen


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    a = sin(radians(lat2 - lat1) / 2) ** 2
    a += cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ** 2
    return 6371.0088 * 2 * asin(min(1.0, sqrt(a)))


def validate_delivery_area(kitchen: Kitchen, address: Address) -> None:
    if (
        address.latitude is None or address.longitude is None
        or kitchen.latitude is None or kitchen.longitude is None
    ):
        raise HTTPException(409, "Both kitchen and delivery address need map locations")
    if distance_km(address.latitude, address.longitude, kitchen.latitude, kitchen.longitude) > float(
        os.getenv("MAX_DELIVERY_KM", "10")
    ):
        raise HTTPException(409, "Address is outside this kitchen's delivery area")
