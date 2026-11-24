from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models import Match, Tournament, User, UserRole
from app.routers.matches import _to_out
from app.schemas.match import MatchOut

router = APIRouter(prefix="/scorer", tags=["scorer"])


@router.get("/matches", response_model=list[MatchOut])
async def list_assigned_matches(user: User = Depends(get_current_user)) -> list[MatchOut]:
    """Lists matches assigned to or managed by the current authenticated user.
    - SUPER_ADMIN: returns all matches
    - ORGANIZER: returns all matches across tournaments owned by this organizer
    - SCORER: returns strictly matches where assigned_scorer_ids contains user.id
    """
    if user.role == UserRole.SUPER_ADMIN:
        matches = await Match.find_all().sort("match_number").to_list()
    elif user.role == UserRole.ORGANIZER:
        tournaments = await Tournament.find(Tournament.organizer_id == user.id).to_list()
        t_ids = [t.id for t in tournaments]
        matches = await Match.find({"tournament_id": {"$in": t_ids}}).sort("match_number").to_list()
    else:  # SCORER
        matches = await Match.find({"assigned_scorer_ids": user.id}).sort("match_number").to_list()

    return [await _to_out(m) for m in matches]
