from pydantic import BaseModel


class LineupEntryOut(BaseModel):
    player_id: str
    player_name: str
    team_id: str
    is_starting: bool


class LineupSetRequest(BaseModel):
    """Replaces the full lineup for a match — one entry per participating player."""

    player_ids: list[str]
