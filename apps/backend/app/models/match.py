from datetime import datetime, timezone
from typing import Literal, Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel

# "extra" = admin-created additional match (e.g. a friendly). It never affects group
# standings, the tournament stage, or the tournament player statistics.
Stage = Literal["group", "quarter", "semi", "final", "extra"]
# "upcoming"/"full_time" are the reference prototype's terms for "scheduled"/"completed"
# (see docs/PROJECT_ANALYSIS.md §6) — kept as-is rather than renamed, to avoid a disruptive
# rename across code/docs already built on them. "cancelled" is new in Part 5.
MatchStatus = Literal["upcoming", "live", "full_time", "cancelled"]


class Match(Document):
    tournament_id: PydanticObjectId
    match_number: int
    group_id: Optional[PydanticObjectId] = None  # set for stage="group", null for knockouts
    stage: Stage
    label: Optional[str] = None  # e.g. "Semi-final 1", "Final"; null for group matches
    bracket_slot: Optional[str] = None  # e.g. "QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "FINAL"
    round_order: Optional[int] = None  # 1 for quarter, 2 for semi, 3 for final (or 1 for semi, 2 for final)
    date: Optional[str] = None  # "YYYY-MM-DD"
    time: Optional[str] = None  # "HH:MM"
    venue: Optional[str] = None
    duration_minutes: Optional[int] = None  # e.g. 40 for a 7-a-side match; null = unspecified
    notes: Optional[str] = None  # free-text admin metadata, e.g. "Rescheduled due to rain"
    team1_id: Optional[PydanticObjectId] = None
    team2_id: Optional[PydanticObjectId] = None
    status: MatchStatus = "upcoming"
    winner_override_id: Optional[PydanticObjectId] = None  # manual winner for a drawn knockout match
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    is_half_time: bool = False
    elapsed_seconds: Optional[int] = None
    assigned_scorer_ids: list[PydanticObjectId] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "matches"
        indexes = [
            IndexModel([("stage", 1), ("group_id", 1)]),
            IndexModel("status"),
            IndexModel("date"),
            IndexModel([("tournament_id", 1), ("match_number", 1)], unique=True),
            IndexModel("tournament_id"),
            IndexModel("assigned_scorer_ids"),
        ]
