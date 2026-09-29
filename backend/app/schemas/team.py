from typing import Optional

from pydantic import BaseModel, Field


class TeamOut(BaseModel):
    id: str
    tournament_id: str
    name: str
    color: str
    logo_url: Optional[str] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    player_count: Optional[int] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    color: Optional[str] = Field(default=None, min_length=1)
    logo_url: Optional[str] = None
    group_id: Optional[str] = None


class TeamCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = Field(min_length=1)
    logo_url: Optional[str] = None
    group_id: Optional[str] = None
