from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field


class Tournament(Document):
    """Singleton document — this app serves exactly one tournament."""

    name: str
    season: str
    format_description: str = "Six teams, two groups of three, semi-finals and a final."
    stage: str = "group"  # group | semis | final | champions
    champion_team_id: Optional[PydanticObjectId] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "tournaments"
