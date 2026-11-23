from pydantic import BaseModel


class LeaderboardEntryOut(BaseModel):
    player_id: str
    player_name: str
    team_id: str
    team_name: str
    value: int


class LeaderboardsOut(BaseModel):
    top_scorers: list[LeaderboardEntryOut]
    top_assists: list[LeaderboardEntryOut]
    top_potm: list[LeaderboardEntryOut]
    most_appearances: list[LeaderboardEntryOut]
