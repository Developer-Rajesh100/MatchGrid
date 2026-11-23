from typing import Optional

from pydantic import BaseModel, Field


class TournamentOut(BaseModel):
    id: str
    name: str
    season: str
    format_description: str
    stage: str
    champion_team_id: Optional[str] = None


class TournamentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    season: Optional[str] = Field(default=None, min_length=1)
    format_description: Optional[str] = None
