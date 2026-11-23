from typing import Literal, Optional

from pydantic import BaseModel, Field

EventType = Literal["goal", "yellow", "red", "potm"]


class MatchEventOut(BaseModel):
    id: str
    match_id: str
    type: EventType
    team_id: str
    player_id: str
    player_name: Optional[str] = None
    assist_player_id: Optional[str] = None
    assist_player_name: Optional[str] = None
    minute: Optional[int] = None


class MatchEventCreate(BaseModel):
    type: EventType
    team_id: str
    player_id: str
    assist_player_id: Optional[str] = None
    minute: Optional[int] = Field(default=None, ge=0, le=120)
