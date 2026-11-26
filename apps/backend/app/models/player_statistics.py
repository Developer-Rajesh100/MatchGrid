from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class PlayerStatistics(Document):
    """Materialized (write-through cache) per-player tournament statistics.

    Recomputed by app.services.player_stats.recalculate_player_statistics()
    whenever that player's match events or lineup entries change. Appearances
    are derived from MatchLineup, not merely "team played" — see MatchLineup's
    docstring and docs/PROJECT_ANALYSIS.md §7.
    """

    tournament_id: PydanticObjectId
    player_id: PydanticObjectId
    team_id: PydanticObjectId
    appearances: int = 0
    goals: int = 0
    assists: int = 0
    yellow_cards: int = 0
    red_cards: int = 0
    potm_awards: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "player_statistics"
        indexes = [
            IndexModel("player_id", unique=True),
            IndexModel("tournament_id"),  # leaderboards and tournament deletion
        ]
