"""Unifies Tournament.status on the lowercase enum draft | active | completed.

Older rows hold "ACTIVE" (or nothing). Tournaments that already have a champion become "completed".
Works on the raw collection so it does not depend on model validation of the old values.
"""

from app.core.config import get_settings
from app.core.database import get_client

NAME = "0009_tournament_status_enum"


async def up() -> None:
    collection = get_client()[get_settings().mongo_db_name]["tournaments"]
    async for doc in collection.find({}, {"status": 1, "stage": 1}):
        raw = doc.get("status")
        status = raw.strip().lower() if isinstance(raw, str) and raw.strip() else "active"
        if status not in ("draft", "active", "completed"):
            status = "active"
        if doc.get("stage") == "champions" and status == "active":
            status = "completed"
        if status != raw:
            await collection.update_one({"_id": doc["_id"]}, {"$set": {"status": status}})
