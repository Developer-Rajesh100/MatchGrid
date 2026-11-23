from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class MatchLineup(Document):
    """Records which players actually took part in a given match.

    This closes a gap in the original prototype (see docs/PROJECT_ANALYSIS.md §7),
    where "appearance" meant only "the player's team played this match." Here,
    appearance stats are derived from real per-player lineup entries instead.
    """

    match_id: PydanticObjectId
    team_id: PydanticObjectId
    player_id: PydanticObjectId
    is_starting: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "match_lineups"
        indexes = [
            IndexModel([("match_id", 1), ("player_id", 1)], unique=True),
            IndexModel("match_id"),
            IndexModel("player_id"),
        ]
