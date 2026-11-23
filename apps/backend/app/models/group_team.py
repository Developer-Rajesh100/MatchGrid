from datetime import datetime, timezone

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class GroupTeam(Document):
    """Join record: which group a team is currently assigned to.

    A team belongs to at most one group at a time, so ``team_id`` is unique —
    reassigning a team's group is an update to its existing GroupTeam record,
    not an insert of a second one.
    """

    tournament_id: PydanticObjectId
    group_id: PydanticObjectId
    team_id: PydanticObjectId
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "group_teams"
        indexes = [
            IndexModel("team_id", unique=True),
            IndexModel([("group_id", 1), ("team_id", 1)], unique=True),
        ]
