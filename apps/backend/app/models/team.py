from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Team(Document):
    tournament_id: PydanticObjectId
    name: str
    short_name: Optional[str] = None  # e.g. "RDG"
    color: str  # hex color, e.g. "#d0483f"
    crest_url: Optional[str] = None  # R2 cloud URL or local fallback
    logo_url: Optional[str] = None  # Backward compatibility alias
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "teams"
        indexes = [
            IndexModel([("tournament_id", 1), ("name", 1)], unique=True),
            IndexModel("tournament_id"),
        ]
