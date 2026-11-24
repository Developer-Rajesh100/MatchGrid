from typing import Optional

from pydantic import BaseModel, Field

from app.models.tournament import KnockoutFormat, TournamentConfig


class TournamentConfigUpdate(BaseModel):
    num_groups: Optional[int] = Field(default=None, ge=1, le=16)
    teams_per_group: Optional[int] = Field(default=None, ge=2, le=32)
    qualifiers_per_group: Optional[int] = Field(default=None, ge=0, le=16)
    knockout_format: Optional[KnockoutFormat] = None
    points_win: Optional[int] = Field(default=None, ge=0, le=10)
    points_draw: Optional[int] = Field(default=None, ge=0, le=10)
    points_loss: Optional[int] = Field(default=None, ge=0, le=10)
    half_duration_minutes: Optional[int] = Field(default=None, ge=5, le=90)


class TournamentOut(BaseModel):
    id: str
    name: str
    season: str
    format_description: str
    stage: str
    champion_team_id: Optional[str] = None
    organizer_id: Optional[str] = None
    slug: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    logo_url: Optional[str] = None
    config: Optional[TournamentConfig] = None


class TournamentSummaryOut(BaseModel):
    id: str
    name: str
    season: str
    slug: str
    format_description: str
    stage: str
    status: str = "ACTIVE"
    logo_url: Optional[str] = None
    organizer_id: Optional[str] = None
    organizer_name: Optional[str] = None
    organization_name: Optional[str] = None
    teams_count: int = 0
    matches_count: int = 0
    live_matches_count: int = 0
    champion_team_id: Optional[str] = None
    champion_team_name: Optional[str] = None
    champion_crest_url: Optional[str] = None



class TournamentCreate(BaseModel):
    name: str = Field(min_length=1)
    season: str = Field(min_length=1)
    format_description: Optional[str] = "2 groups of 3 teams, top 2 advance to semi-finals"
    slug: Optional[str] = None
    logo_url: Optional[str] = None
    config: Optional[TournamentConfig] = None


class TournamentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    season: Optional[str] = Field(default=None, min_length=1)
    format_description: Optional[str] = None
    status: Optional[str] = None
    logo_url: Optional[str] = None
    config: Optional[TournamentConfig] = None

