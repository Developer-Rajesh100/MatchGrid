from typing import Optional

from pydantic import BaseModel, Field

HEX_COLOR = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class TeamOut(BaseModel):
    id: str
    tournament_id: str
    name: str
    color: str
    crest_url: Optional[str] = None
    logo_url: Optional[str] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    player_count: Optional[int] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    color: Optional[str] = Field(default=None, pattern=HEX_COLOR)
    crest_url: Optional[str] = None
    logo_url: Optional[str] = None
    group_id: Optional[str] = None


class TeamCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str = Field(pattern=HEX_COLOR)
    crest_url: Optional[str] = None
    logo_url: Optional[str] = None
    group_id: Optional[str] = None
    tournament_id: str = Field(pattern=r"^[0-9a-fA-F]{24}$")
