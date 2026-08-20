"""Run with a scheduler: ``python -m app.push_worker``."""
from .db import SessionLocal
from .push_service import process_due_pushes


def main() -> None:
    db = SessionLocal()
    try:
        print(process_due_pushes(db))
    finally:
        db.close()


if __name__ == "__main__":
    main()
