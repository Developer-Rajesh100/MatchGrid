from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Player(Document):
    team_id: PydanticObjectId
    dcl_id: str  # e.g. "DCL-001"
    name: str
    number: int
    is_manager: bool = False
    photo_url: Optional[str] = None  # e.g. "/assets/players/DCL-001.jpg"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "players"
        indexes = [
            IndexModel([("team_id", 1), ("number", 1)], unique=True),
            IndexModel("dcl_id", unique=True),
            IndexModel("team_id"),
        ]
