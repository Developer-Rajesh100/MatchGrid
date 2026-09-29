from pydantic import BaseModel


class StandingOut(BaseModel):
    team_id: str
    team_name: str
    team_color: str
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int


class GroupStandingsOut(BaseModel):
    group_id: str
    group_name: str
    standings: list[StandingOut]
