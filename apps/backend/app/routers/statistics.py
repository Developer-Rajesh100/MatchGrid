from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_optional_user
from app.models import User

from app.schemas.statistics import LeaderboardsOut
from app.services.statistics import get_leaderboards
from app.services.tournament_scope import resolve_tournament_id

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/leaderboards", response_model=LeaderboardsOut)
async def leaderboards(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
    viewer: Optional[User] = Depends(get_optional_user),
) -> LeaderboardsOut:
    tid = await resolve_tournament_id(tournament_id, tournament_slug, viewer)
    return await get_leaderboards(tid)

