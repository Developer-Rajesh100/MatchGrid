from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.match_event import MatchEventOut

Stage = Literal["group", "quarter", "semi", "final", "extra"]
MatchStatus = Literal["upcoming", "live", "full_time", "cancelled"]


class MatchOut(BaseModel):
    id: str
    tournament_id: str
    tournament_name: Optional[str] = None
    tournament_slug: Optional[str] = None
    match_number: int
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    stage: Stage
    label: Optional[str] = None
    bracket_slot: Optional[str] = None
    round_order: Optional[int] = None
    date: Optional[str] = None
    time: Optional[str] = None
    venue: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    team1_id: Optional[str] = None
    team1_name: Optional[str] = None
    team1_crest_url: Optional[str] = None
    team1_color: Optional[str] = None
    team2_id: Optional[str] = None
    team2_name: Optional[str] = None
    team2_crest_url: Optional[str] = None
    team2_color: Optional[str] = None
    status: MatchStatus
    score1: int = 0
    score2: int = 0
    winner_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    is_half_time: bool = False
    elapsed_seconds: Optional[int] = None
    # Server UTC clock at response time: clients derive the match clock from it (not their own clock).
    server_now: Optional[datetime] = None


class MatchAdminOut(MatchOut):
    """Match as seen by the tournament's staff: adds who is assigned to score it. Never public."""

    assigned_scorer_ids: list[str] = Field(default_factory=list)


class HalfTimePayload(BaseModel):
    # Upper bound is generous (2 hours) — just a sanity cap against a typo'd
    # or malformed client value, not a real match-length constraint.
    elapsed_seconds: Optional[int] = Field(default=None, ge=0, le=7200)


class MatchCreate(BaseModel):
    # "extra": an additional match (friendly) that never counts in standings/stats.
    # "group": a real group-stage fixture; needs group_id and two teams of that group.
    stage: Literal["extra", "group"] = "extra"
    group_id: Optional[str] = Field(default=None, pattern=r"^[0-9a-fA-F]{24}$")
    match_number: Optional[int] = Field(default=None, ge=1, le=999)  # omit for the next free number
    team1_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
    team2_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD
    time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")  # HH:MM, 24h
    venue: Optional[str] = Field(default=None, max_length=200)
    label: Optional[str] = Field(default=None, max_length=100)
    tournament_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("date")
    @classmethod
    def _real_calendar_date(cls, v: str) -> str:
        date.fromisoformat(v)
        return v

    @field_validator("venue", "label", "notes")
    @classmethod
    def _strip(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() or None if v is not None else None


class MatchUpdate(BaseModel):
    match_number: Optional[int] = Field(default=None, ge=1, le=999)  # the "M1", "M2" … number
    label: Optional[str] = Field(default=None, max_length=100)  # only applied to extra matches
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD
    time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")  # HH:MM, 24h
    venue: Optional[str] = Field(default=None, max_length=200)
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("date")
    @classmethod
    def _real_calendar_date(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            date.fromisoformat(v)  # rejects e.g. 2026-13-45
        return v


class AssignTeamsRequest(BaseModel):
    team1_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
    team2_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")


class WinnerRequest(BaseModel):
    team_id: str


class GenerateGroupFixturesRequest(BaseModel):
    group_id: str
    force: bool = False


class MatchDetailOut(MatchOut):
    events: list[MatchEventOut] = []
    lineup: list[str] = []  # player ids


class AssignScorerRequest(BaseModel):
    scorer_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")


class BracketTeamNode(BaseModel):
    id: str
    name: str
    crest_url: Optional[str] = None
    color: Optional[str] = None
    seed: Optional[str] = None


class BracketMatchNode(BaseModel):
    bracket_slot: str  # "QF1", "SF1", "FINAL"
    match_id: Optional[str] = None
    match_number: Optional[int] = None
    stage: str
    label: Optional[str] = None
    team1: Optional[BracketTeamNode] = None
    team2: Optional[BracketTeamNode] = None
    score1: int = 0
    score2: int = 0
    winner_id: Optional[str] = None
    status: MatchStatus = "upcoming"
    notes: Optional[str] = None


class BracketRoundNode(BaseModel):
    round_order: int
    round_name: str  # "Quarter-finals", "Semi-finals", "Final"
    matches: list[BracketMatchNode] = []


class BracketChampionNode(BaseModel):
    team_id: str
    name: str
    crest_url: Optional[str] = None


class BracketTreeOut(BaseModel):
    tournament_id: str
    knockout_format: str
    rounds: list[BracketRoundNode] = []
    champion: Optional[BracketChampionNode] = None


class SeedKnockoutRequest(BaseModel):
    target_stage: Optional[Literal["quarter", "semi", "final"]] = None


