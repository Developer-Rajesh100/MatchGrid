from datetime import datetime, timezone
from typing import Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import BaseModel, Field, field_validator, model_validator
from pymongo import IndexModel

KnockoutFormat = Literal["none", "semis_final", "quarters_semis_final"]
# Lifecycle of a tournament: "draft" (being set up), "active", "completed" (a champion is crowned).
TournamentStatus = Literal["draft", "active", "completed"]
# Competition stage derived from fixtures/results (see services/tournament_stage.py).
TournamentStage = Literal["group", "quarters", "semis", "final", "champions"]


class TournamentConfig(BaseModel):
    """Configuration governing group sizes, points rules, and knockout bracket format."""

    num_groups: int = Field(default=2, ge=1, le=16, description="Number of groups (1 to 16)")
    teams_per_group: int = Field(default=3, ge=2, le=32, description="Target teams per group")
    qualifiers_per_group: int = Field(default=2, ge=0, le=16, description="Top N teams advancing per group")
    knockout_format: KnockoutFormat = Field(default="semis_final", description="Knockout structure")
    points_win: int = Field(default=3, ge=0, le=10, description="Points awarded for a win")
    points_draw: int = Field(default=1, ge=0, le=10, description="Points awarded for a draw")
    points_loss: int = Field(default=0, ge=0, le=10, description="Points awarded for a loss")
    half_duration_minutes: int = Field(default=25, ge=5, le=90, description="Half length in minutes")

    @model_validator(mode="after")
    def validate_bracket_feasibility(self) -> "TournamentConfig":
        total_qualifiers = self.num_groups * self.qualifiers_per_group
        if self.knockout_format == "quarters_semis_final" and total_qualifiers < 8:
            raise ValueError(
                f"Quarters format requires at least 8 qualifiers, but num_groups ({self.num_groups}) "
                f"x qualifiers_per_group ({self.qualifiers_per_group}) = {total_qualifiers}"
            )
        if self.knockout_format == "semis_final" and total_qualifiers < 4:
            raise ValueError(
                f"Semis format requires at least 4 qualifiers, but num_groups ({self.num_groups}) "
                f"x qualifiers_per_group ({self.qualifiers_per_group}) = {total_qualifiers}"
            )
        if self.qualifiers_per_group > self.teams_per_group:
            raise ValueError("qualifiers_per_group cannot exceed teams_per_group")
        return self


class Tournament(Document):
    """Multi-tenant tournament entity."""

    organizer_id: Optional[PydanticObjectId] = None  # None for legacy/unclaimed tournaments
    name: str
    slug: Optional[str] = None  # URL-friendly slug, e.g. "matchgrid-season-1"
    season: str = "1"
    status: TournamentStatus = "active"
    format_description: str = "Six teams, two groups of three, semi-finals and a final."
    stage: TournamentStage = "group"
    champion_team_id: Optional[PydanticObjectId] = None
    player_seq: int = 0  # last auto-assigned player number (DCL-nnn), per tournament
    config: TournamentConfig = Field(default_factory=TournamentConfig)
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value):
        # Rows written before the enum was unified hold "ACTIVE" / "Active" / ""; read them as the enum.
        return value.strip().lower() if isinstance(value, str) and value.strip() else "active"

    class Settings:
        name = "tournaments"
        indexes = [
            IndexModel(
                [("slug", 1)],
                unique=True,
                partialFilterExpression={"slug": {"$type": "string"}},
            ),
            IndexModel([("organizer_id", 1), ("status", 1)]),
            IndexModel("name"),
        ]

