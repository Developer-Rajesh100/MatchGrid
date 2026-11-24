from beanie import PydanticObjectId
from fastapi import APIRouter, Depends

from app.core.deps import check_tournament_ownership, get_current_admin
from app.core.errors import NotFoundError
from app.models import Match, Team, Tournament, TournamentConfig, User
from app.schemas.tournament import (
    TournamentConfigUpdate,
    TournamentOut,
    TournamentSummaryOut,
    TournamentUpdate,
)
from app.services.tournament_scope import get_active_tournament

router = APIRouter(prefix="/tournament", tags=["tournament"])
tournaments_router = APIRouter(prefix="/tournaments", tags=["tournaments"])


def _to_out(t: Tournament) -> TournamentOut:
    return TournamentOut(
        id=str(t.id),
        name=t.name,
        season=t.season,
        format_description=t.format_description,
        stage=t.stage,
        champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
        organizer_id=str(t.organizer_id) if t.organizer_id else None,
        slug=t.slug,
        status=t.status,
        logo_url=t.logo_url,
        config=getattr(t, "config", None) or TournamentConfig(),
    )


@router.get("/public", response_model=list[TournamentSummaryOut])
@tournaments_router.get("/public", response_model=list[TournamentSummaryOut])
@tournaments_router.get("", response_model=list[TournamentSummaryOut])
async def list_public_tournaments() -> list[TournamentSummaryOut]:
    tournaments = await Tournament.find_all().to_list()
    organizer_ids = [t.organizer_id for t in tournaments if t.organizer_id]
    organizers = {u.id: u for u in await User.find({"_id": {"$in": organizer_ids}}).to_list()}

    champion_ids = [t.champion_team_id for t in tournaments if t.champion_team_id]
    champions = {tm.id: tm for tm in await Team.find({"_id": {"$in": champion_ids}}).to_list()}

    summaries = []
    for t in tournaments:
        teams_count = await Team.find(Team.tournament_id == t.id).count()
        matches_count = await Match.find(Match.tournament_id == t.id).count()
        live_matches_count = await Match.find(Match.tournament_id == t.id, Match.status == "live").count()
        org = organizers.get(t.organizer_id)
        champ = champions.get(t.champion_team_id)

        summaries.append(
            TournamentSummaryOut(
                id=str(t.id),
                name=t.name,
                season=t.season,
                slug=t.slug or str(t.id),
                format_description=t.format_description,
                stage=t.stage,
                status=t.status or "ACTIVE",
                logo_url=t.logo_url,
                organizer_id=str(t.organizer_id) if t.organizer_id else None,
                organizer_name=org.username if org else None,
                organization_name=org.organization_name if org else None,
                teams_count=teams_count,
                matches_count=matches_count,
                live_matches_count=live_matches_count,
                champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
                champion_team_name=champ.name if champ else None,
                champion_crest_url=champ.crest_url or champ.logo_url if champ else None,
            )
        )
    return summaries


@router.get("/slug/{slug}", response_model=TournamentOut)
@tournaments_router.get("/slug/{slug}", response_model=TournamentOut)
async def get_tournament_by_slug(slug: str) -> TournamentOut:
    t = await Tournament.find_one(Tournament.slug == slug)
    if not t:
        raise NotFoundError(f"Tournament with slug '{slug}' not found")
    return _to_out(t)


@router.get("/{tournament_id}", response_model=TournamentOut)
@tournaments_router.get("/{tournament_id}", response_model=TournamentOut)
async def get_tournament_by_id(tournament_id: str) -> TournamentOut:
    try:
        oid = PydanticObjectId(tournament_id)
    except Exception:
        raise NotFoundError("Invalid tournament ID")
    t = await Tournament.get(oid)
    if not t:
        raise NotFoundError(f"Tournament '{tournament_id}' not found")
    return _to_out(t)


@router.get("", response_model=TournamentOut)
async def get_tournament() -> TournamentOut:
    return _to_out(await get_active_tournament())


@router.patch("", response_model=TournamentOut)
async def update_tournament(
    payload: TournamentUpdate, admin: User = Depends(get_current_admin)
) -> TournamentOut:
    tournament = await get_active_tournament()
    await check_tournament_ownership(admin, tournament.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "config" and value is not None:
            tournament.config = TournamentConfig(**value)
        else:
            setattr(tournament, field, value)
    await tournament.save()
    return _to_out(tournament)


@router.patch("/config", response_model=TournamentOut)
async def update_tournament_config(
    payload: TournamentConfigUpdate, admin: User = Depends(get_current_admin)
) -> TournamentOut:
    tournament = await get_active_tournament()
    await check_tournament_ownership(admin, tournament.id)
    current_config = getattr(tournament, "config", None) or TournamentConfig()
    config_dict = current_config.model_dump()
    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            config_dict[field] = val
    tournament.config = TournamentConfig(**config_dict)
    await tournament.save()
    return _to_out(tournament)


