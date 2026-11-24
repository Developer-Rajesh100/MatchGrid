from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models import Match, User, UserRole
from app.routers.matches import _to_out
from app.schemas.match import MatchOut

router = APIRouter(prefix="/scorer", tags=["scorer"])


@router.get("/matches", response_model=list[MatchOut])
async def list_assigned_matches(user: User = Depends(get_current_user)) -> list[MatchOut]:
    if user.role == UserRole.SUPER_ADMIN:
        matches = await Match.find_all().to_list()
    else:
        matches = await Match.find({"assigned_scorer_ids": user.id}).to_list()
    return [await _to_out(m) for m in matches]
