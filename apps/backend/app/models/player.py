from datetime import datetime, timezone
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class Player(Document):
    tournament_id: Optional[PydanticObjectId] = None
    team_id: PydanticObjectId
    dcl_id: Optional[str] = None  # e.g. "DCL-001" (legacy identifier)
    player_code: Optional[str] = None  # tournament-scoped code e.g. "PLY-01"
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
            IndexModel("tournament_id"),
            IndexModel("team_id"),
            IndexModel(
                [("tournament_id", 1), ("player_code", 1)],
                unique=True,
                partialFilterExpression={"player_code": {"$type": "string"}},
            ),
            IndexModel("dcl_id"),
        ]
