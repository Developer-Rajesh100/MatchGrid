from typing import Optional
from fastapi import APIRouter, Query

from app.schemas.statistics import LeaderboardsOut
from app.services.statistics import get_leaderboards
from app.services.tournament_scope import get_active_tournament_id, resolve_tournament_id

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/leaderboards", response_model=LeaderboardsOut)
async def leaderboards(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> LeaderboardsOut:
    tid = await resolve_tournament_id(tournament_id, tournament_slug)
    return await get_leaderboards(tid)

