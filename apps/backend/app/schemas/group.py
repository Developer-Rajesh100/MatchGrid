from pydantic import BaseModel

from app.schemas.team import TeamOut


class GroupOut(BaseModel):
    id: str
    tournament_id: str
    name: str


class GroupWithTeamsOut(GroupOut):
    teams: list[TeamOut] = []


class TeamGroupAssignRequest(BaseModel):
    group_id: str
