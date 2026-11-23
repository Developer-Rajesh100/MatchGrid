from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class TournamentStanding(Document):
    """Materialized (write-through cache) standings row for one team in one group.

    Recomputed by app.services.standings.recalculate_group_standings() whenever a
    group-stage match's result changes, rather than recalculated on every read —
    see docs/DATABASE_DESIGN.md for the rationale (this is a deliberate evolution
    from the original "compute on every read" prototype logic).
    """

    tournament_id: PydanticObjectId
    group_id: PydanticObjectId
    team_id: PydanticObjectId
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    goal_difference: int = 0
    points: int = 0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "tournament_standings"
        indexes = [IndexModel([("group_id", 1), ("team_id", 1)], unique=True)]
