from datetime import datetime, timezone
from typing import Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

EventType = Literal["goal", "yellow", "red", "potm"]


class MatchEvent(Document):
    match_id: PydanticObjectId
    type: EventType
    team_id: PydanticObjectId
    player_id: PydanticObjectId
    assist_player_id: Optional[PydanticObjectId] = None  # only meaningful for type="goal"
    minute: Optional[int] = None  # required for goal|yellow|red, null for potm
    created_by: Optional[PydanticObjectId] = None  # admin who recorded the event
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "match_events"
        indexes = [
            IndexModel("match_id"),
            IndexModel([("match_id", 1), ("type", 1)]),
            IndexModel("player_id"),
            # Backs recalculate_player_statistics()'s $or query for events
            # where this player is either the primary player or the assist
            # provider (Performance & Scalability audit follow-up).
            IndexModel("assist_player_id"),
        ]
