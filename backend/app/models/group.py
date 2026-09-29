from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Group(Document):
    tournament_id: PydanticObjectId
    name: str  # "A" | "B"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "groups"
        indexes = [IndexModel([("tournament_id", 1), ("name", 1)], unique=True)]
