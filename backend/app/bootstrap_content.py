"""Load the real seller curriculum after database migrations."""

import json

from .database import SessionLocal
from .models import TrainingModule
from .training_data import MODULES


def main() -> None:
    with SessionLocal() as db:
        for source in MODULES:
            row = db.get(TrainingModule, source["id"])
            if row is None:
                db.add(
                    TrainingModule(
                        id=source["id"],
                        title=source["title"],
                        description=source["description"],
                        proof_instruction=source["proof_instruction"],
                        questions_json=json.dumps(source["questions"]),
                    )
                )
            else:
                row.title = source["title"]
                row.description = source["description"]
                row.proof_instruction = source["proof_instruction"]
                row.questions_json = json.dumps(source["questions"])
        db.commit()
    print(f"Training curriculum ready: {len(MODULES)} modules")


if __name__ == "__main__":
    main()
