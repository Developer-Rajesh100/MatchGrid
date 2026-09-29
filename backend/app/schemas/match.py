from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.match_event import MatchEventOut

Stage = Literal["group", "semi", "final"]
MatchStatus = Literal["upcoming", "live", "full_time", "cancelled"]


class MatchOut(BaseModel):
    id: str
    tournament_id: str
    match_number: int
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    stage: Stage
    label: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    venue: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    team1_id: Optional[str] = None
    team1_name: Optional[str] = None
    team2_id: Optional[str] = None
    team2_name: Optional[str] = None
    status: MatchStatus
    score1: int = 0
    score2: int = 0
    winner_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    is_half_time: bool = False
    elapsed_seconds: Optional[int] = None


class HalfTimePayload(BaseModel):
    # Upper bound is generous (2 hours) — just a sanity cap against a typo'd
    # or malformed client value, not a real match-length constraint.
    elapsed_seconds: Optional[int] = Field(default=None, ge=0, le=7200)


class MatchUpdate(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    venue: Optional[str] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    notes: Optional[str] = None


class WinnerRequest(BaseModel):
    team_id: str


class GenerateGroupFixturesRequest(BaseModel):
    group_id: str
    force: bool = False


class MatchDetailOut(MatchOut):
    events: list[MatchEventOut] = []
    lineup: list[str] = []  # player ids
