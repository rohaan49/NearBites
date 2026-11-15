"""Readiness of a seller application, shared by the queue and approval action."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Kitchen, TrainingModule, User
from .training import module_progress


def application_readiness(db: Session, kitchen: Kitchen) -> dict:
    owner = db.get(User, kitchen.owner_id)
    modules = db.scalars(select(TrainingModule).where(TrainingModule.active.is_(True))).all()
    lessons = []
    for module in modules:
        progress = module_progress(db, kitchen, module)
        lessons.append({
            "id": module.id,
            "title": module.title,
            "quiz_passed": progress["quiz_passed"],
            "proof_status": progress["proof_status"],
            "acknowledged": progress["acknowledged"],
            "completed": progress["completed"],
        })
    requirements = {
        "email_verified": bool(owner and owner.email_verified),
        "location_set": kitchen.latitude is not None and kitchen.longitude is not None,
        "training_complete": bool(lessons) and all(row["completed"] for row in lessons),
    }
    return {"ready": all(requirements.values()), "requirements": requirements, "lessons": lessons}
