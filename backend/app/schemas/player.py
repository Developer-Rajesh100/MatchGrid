from typing import Literal, Optional

from pydantic import BaseModel, Field

Position = Literal["GK", "DEF", "MID", "FWD"]


class PlayerOut(BaseModel):
    id: str
    team_id: str
    team_name: Optional[str] = None
    team_color: Optional[str] = None
    dcl_id: str
    name: str
    number: int
    position: Position
    is_manager: bool
    photo_url: Optional[str] = None


class PlayerCreate(BaseModel):
    team_id: str
    name: str = Field(min_length=1)
    number: int = Field(ge=0, le=999)
    position: Position
    is_manager: bool = False
    photo_url: Optional[str] = None


class PlayerUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    number: Optional[int] = Field(default=None, ge=0, le=999)
    position: Optional[Position] = None
    is_manager: Optional[bool] = None
    photo_url: Optional[str] = None


class PlayerStatsOut(BaseModel):
    appearances: int
    goals: int
    assists: int
    yellow_cards: int
    red_cards: int
    potm_awards: int


class MatchHistoryEntryOut(BaseModel):
    match_id: str
    label: str
    opponent_name: str
    result: str  # Won | Lost | Drew | Live
    my_score: int
    opponent_score: int
    goals: int
    assists: int
    yellow_cards: int
    red_cards: int
    potm: bool


class GoalLogEntryOut(BaseModel):
    match_id: str
    label: str
    opponent_name: str
    minute: Optional[int] = None


class PlayerDetailOut(PlayerOut):
    stats: PlayerStatsOut
    history: list[MatchHistoryEntryOut] = []
    goal_log: list[GoalLogEntryOut] = []
