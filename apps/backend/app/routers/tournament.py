from fastapi import APIRouter, Depends

from app.core.deps import get_current_admin
from app.models import Admin, Tournament
from app.schemas.tournament import TournamentOut, TournamentUpdate
from app.services.tournament_scope import get_active_tournament

router = APIRouter(prefix="/tournament", tags=["tournament"])


def _to_out(t: Tournament) -> TournamentOut:
    return TournamentOut(
        id=str(t.id),
        name=t.name,
        season=t.season,
        format_description=t.format_description,
        stage=t.stage,
        champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
    )


@router.get("", response_model=TournamentOut)
async def get_tournament() -> TournamentOut:
    return _to_out(await get_active_tournament())


@router.patch("", response_model=TournamentOut)
async def update_tournament(
    payload: TournamentUpdate, _admin: Admin = Depends(get_current_admin)
) -> TournamentOut:
    tournament = await get_active_tournament()
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tournament, field, value)
    await tournament.save()
    return _to_out(tournament)
