from typing import Optional

from pydantic import BaseModel, Field


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


class TournamentCreate(BaseModel):
    name: str = Field(min_length=1)
    season: str = Field(min_length=1)
    format_description: Optional[str] = "2 groups of 3 teams, top 2 advance to semi-finals"
    slug: Optional[str] = None
    logo_url: Optional[str] = None


class TournamentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    season: Optional[str] = Field(default=None, min_length=1)
    format_description: Optional[str] = None
    status: Optional[str] = None
    logo_url: Optional[str] = None
