from fastapi import APIRouter

from app.schemas.statistics import LeaderboardsOut
from app.services.statistics import get_leaderboards
from app.services.tournament_scope import get_active_tournament_id

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("/leaderboards", response_model=LeaderboardsOut)
async def leaderboards() -> LeaderboardsOut:
    return await get_leaderboards(await get_active_tournament_id())
