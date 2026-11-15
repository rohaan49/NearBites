"""Set up a fictional weekly menu on the existing local Order Test Kitchen."""

import argparse
import getpass
import os

from sqlalchemy import select

from .database import SessionLocal
from .models import Address, Dish, Kitchen, MealPlan, User
from .security import password_hash
from .seed_order_test_listing import DISHES, EMAIL, fixed_id, main as seed_checkout_kitchen


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enable-seller", action="store_true", help="Set a local password for the fictional seller")
    args = parser.parse_args()
    if not os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:8080").startswith(
        ("http://127.0.0.1:", "http://localhost:")
    ):
        raise SystemExit("The fictional meal plan is only available on localhost.")
    password = getpass.getpass("Choose a password for the local demo seller: ") if args.enable_seller else None
    if password is not None and len(password) < 10:
        raise SystemExit("Use at least 10 characters.")
    with SessionLocal() as db:
        seller = db.scalar(select(User).where(User.email == EMAIL))
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id)) if seller else None
    if kitchen is None:
        seed_checkout_kitchen()
    with SessionLocal() as db:
        seller = db.scalar(select(User).where(User.email == EMAIL))
        kitchen = db.scalar(select(Kitchen).where(Kitchen.owner_id == seller.id))
        plan_id = fixed_id("meal-plan", "weekly-lunch")
        if db.get(MealPlan, plan_id) is None:
            dishes = {dish.name: dish.id for dish in db.scalars(
                select(Dish).where(Dish.kitchen_id == kitchen.id, Dish.status == "approved")
            )}
            if not all(name in dishes for name, *_ in DISHES):
                raise SystemExit("Set up the three approved Order Test Kitchen dishes first.")
            biryani, daal, karahi = [dishes[name] for name, *_ in DISHES]
            db.add(MealPlan(
                id=plan_id, kitchen_id=kitchen.id, name="Workweek Lunch Plan", price_pkr=450,
                capacity=10, delivery_time="13:00", published=True,
                menu={"0": [daal, karahi], "1": [karahi, biryani], "2": [daal, biryani],
                      "3": [karahi, daal], "4": [biryani, daal, karahi]},
            ))
        if password is not None:
            seller.password_hash = password_hash.hash(password)
            seller.email_verified = True
        buyer = db.scalar(select(User).where(User.email == "sample-buyer-1@demo.nearbites.invalid"))
        address_id = fixed_id("address", "meal-plan-demo")
        if buyer is not None and db.get(Address, address_id) is None:
            db.add(Address(
                id=address_id, user_id=buyer.id, label="Meal Plan Demo Address",
                line1="Fictional Demo Street", area=kitchen.area, city="Islamabad",
                latitude=kitchen.latitude, longitude=kitchen.longitude, is_default=False,
            ))
        db.commit()
    print("Fictional Workweek Lunch Plan ready. No real food or delivery is offered.")
    if password is not None:
        print(f"Local seller sign-in enabled for {EMAIL}.")


if __name__ == "__main__":
    main()
