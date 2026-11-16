"""Local API smoke test for the new photo capture boundary."""

import io
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from dotenv import load_dotenv
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def picture(dark: bool = False, code: str = "123456") -> bytes:
    image = Image.new("RGB", (640, 480), "#080808" if dark else "#ecd7ac")
    if not dark:
        draw = ImageDraw.Draw(image)
        for x in range(20, 620, 25):
            draw.line((x, 20, x, 460), fill="#79502f", width=3)
        draw.rectangle((180, 150, 440, 330), fill="#ad3b20")
        draw.text((210, 220), code, fill="white")
    result = io.BytesIO()
    image.save(result, format="JPEG")
    return result.getvalue()


def test_camera_listing_boundary() -> None:
    with TemporaryDirectory() as directory:
        os.environ["DATABASE_URL"] = f"sqlite:///{(Path(directory) / 'capture.db').as_posix()}"
        os.environ["UPLOAD_DIR"] = str(Path(directory) / "uploads")
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")

        from app.database import Base, SessionLocal, engine
        from app.capture_quality import inspect_capture
        from app import chefcam
        from app.chefcam import paired_evidence
        from app.main import app, fresh_dish_photo
        from app.models import Dish, Kitchen, QuizAttempt, TrainingModule, User
        from app.security import issue_token

        Base.metadata.create_all(engine)
        assert "dark" in (inspect_capture(picture(True))[1] or "").lower()
        paired = paired_evidence(picture(), picture())
        assert Image.open(io.BytesIO(paired)).size == (1280, 510)
        user = User(name="Capture Test", email="capture-test@example.invalid", password_hash="unused", email_verified=True, role="seller")
        admin = User(name="Admin Test", email="admin-test@example.invalid", password_hash="unused", email_verified=True, role="admin")
        with SessionLocal() as db:
            db.add_all([user, admin])
            db.flush()
            db.add(Kitchen(owner_id=user.id, name="Test Kitchen", chef="Test", area="F-6", status="active", training_verified=True))
            db.add(TrainingModule(id="food-safety", title="Food Safety", description="Test", proof_instruction="Test", questions_json="[]", active=True))
            db.add(QuizAttempt(user_id=user.id, module_id="food-safety", score=100, passed=True))
            db.commit()
        headers = {"Authorization": f"Bearer {issue_token(user.id, 'access', 5)}"}
        admin_headers = {"Authorization": f"Bearer {issue_token(admin.id, 'access', 5)}"}
        with TestClient(app) as client:
            motion = client.post("/api/v1/seller/training/food-safety/challenge", headers=headers)
            assert motion.status_code == 200, motion.text
            motion_token = motion.json()["token"]
            same = client.post("/api/v1/seller/training/food-safety/camera-check", headers=headers,
                data={"challenge_token": motion_token}, files={"file": ("one.jpg", picture(), "image/jpeg"), "second_file": ("two.jpg", picture(), "image/jpeg")})
            assert same.status_code == 422
            original_detect = chefcam.detect
            responses = iter([
                [{"label": "hairnet", "confidence": 0.91}, {"label": "glove", "confidence": 0.89}],
                [{"label": "glove", "confidence": 0.87}],
            ])
            chefcam.detect = lambda _: next(responses)
            try:
                proof = client.post("/api/v1/seller/training/food-safety/camera-check", headers=headers,
                    data={"challenge_token": motion_token}, files={"file": ("one.jpg", picture(), "image/jpeg"), "second_file": ("two.jpg", picture(code="654321"), "image/jpeg")})
                assert proof.status_code == 200 and proof.json()["status"] == "pending_admin_review", proof.text
            finally:
                chefcam.detect = original_detect
            issued = client.post("/api/v1/uploads/camera-challenge", headers=headers).json()
            assert len(issued["code"]) == 6
            endpoint = "/api/v1/uploads/camera-images"
            fields = {"challenge_token": issued["token"]}
            dark = client.post(endpoint, headers=headers, data=fields, files={"file": ("dark.jpg", picture(True), "image/jpeg")})
            assert dark.status_code == 422 and "dark" in dark.json()["detail"].lower()
            valid = picture()
            photo = client.post(endpoint, headers=headers, data=fields, files={"file": ("food.jpg", valid, "image/jpeg")})
            assert photo.status_code == 201, photo.text
            duplicate = client.post(endpoint, headers=headers, data=fields, files={"file": ("again.jpg", valid, "image/jpeg")})
            assert duplicate.status_code == 409
            listing = client.post("/api/v1/seller/listings", headers=headers, json={
                "name": "Cooked test dish", "description": "Ingredients and allergens in test dish",
                "price_pkr": 350, "portions_available": 3, "image_url": photo.json()["url"],
            })
            assert listing.status_code == 201, listing.text
            assert listing.json()["photo_policy_required"] and listing.json()["fresh_photo"]
            decide_url = f"/api/v1/admin/listings/{listing.json()['id']}/decision"
            unconfirmed = client.post(decide_url, headers=admin_headers, json={"decision": "approve"})
            assert unconfirmed.status_code == 422
            approved = client.post(decide_url, headers=admin_headers, json={"decision": "approve", "photo_code_confirmed": True})
            assert approved.status_code == 200, approved.text
            old_batch = client.patch(f"/api/v1/seller/listings/{listing.json()['id']}/availability", headers=headers, json={"portions_available": 4, "paused": False})
            assert old_batch.status_code == 409
            with SessionLocal() as db:
                dish = db.get(Dish, listing.json()["id"])
                dish.photo_captured_at = datetime.now(timezone.utc) - timedelta(hours=25)
                db.commit()
                assert not fresh_dish_photo(dish)
            stale_stock = client.patch(f"/api/v1/seller/listings/{listing.json()['id']}/availability", headers=headers, json={"portions_available": 3, "paused": False})
            assert stale_stock.status_code == 409
        engine.dispose()


if __name__ == "__main__":
    test_camera_listing_boundary()
    print("Capture flow smoke test passed")
