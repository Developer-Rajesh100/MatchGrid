from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Tournament(Document):
    """Multi-tenant tournament entity."""

    organizer_id: Optional[PydanticObjectId] = None  # None for legacy/unclaimed tournaments
    name: str
    slug: Optional[str] = None  # URL-friendly slug, e.g. "matchgrid-season-1"
    season: str = "1"
    status: str = "active"  # "draft" | "active" | "completed"
    format_description: str = "Six teams, two groups of three, semi-finals and a final."
    stage: str = "group"  # group | semis | final | champions
    champion_team_id: Optional[PydanticObjectId] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "tournaments"
        indexes = [
            IndexModel(
                [("slug", 1)],
                unique=True,
                partialFilterExpression={"slug": {"$type": "string"}},
            ),
            IndexModel([("organizer_id", 1), ("status", 1)]),
            IndexModel("name"),
        ]
