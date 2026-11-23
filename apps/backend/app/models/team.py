from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Team(Document):
    tournament_id: PydanticObjectId
    name: str
    color: str  # hex color, e.g. "#d0483f"
    logo_url: Optional[str] = None  # e.g. "/assets/teams/red-dragons.png"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "teams"
        indexes = [IndexModel("name", unique=True)]
