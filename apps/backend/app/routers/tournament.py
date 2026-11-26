from typing import Optional

from fastapi import APIRouter, Depends

from app.core.deps import get_optional_user
from app.models import Match, Team, Tournament, User
from app.schemas.tournament import TournamentOut, TournamentSummaryOut
from app.services.serializers import tournament_to_out
from app.services.tournament_scope import resolve_tournament

router = APIRouter(prefix="/tournament", tags=["tournament"])
tournaments_router = APIRouter(prefix="/tournaments", tags=["tournaments"])


async def _counts_by_tournament(model, *extra_match: dict) -> dict:
    """{tournament_id: n} for a whole collection in a single grouped query."""
    pipeline = [*({"$match": m} for m in extra_match), {"$group": {"_id": "$tournament_id", "n": {"$sum": 1}}}]
    return {row["_id"]: row["n"] async for row in model.get_pymongo_collection().aggregate(pipeline)}


@router.get("/public", response_model=list[TournamentSummaryOut])
@tournaments_router.get("/public", response_model=list[TournamentSummaryOut])
@tournaments_router.get("", response_model=list[TournamentSummaryOut])
async def list_public_tournaments() -> list[TournamentSummaryOut]:
    """The public directory. Draft tournaments are private until their organizer publishes them."""
    tournaments = await Tournament.find(Tournament.status != "draft").to_list()
    organizer_ids = [t.organizer_id for t in tournaments if t.organizer_id]
    organizers = {u.id: u for u in await User.find({"_id": {"$in": organizer_ids}}).to_list()}

    champion_ids = [t.champion_team_id for t in tournaments if t.champion_team_id]
    champions = {tm.id: tm for tm in await Team.find({"_id": {"$in": champion_ids}}).to_list()}

    teams_counts = await _counts_by_tournament(Team)
    matches_counts = await _counts_by_tournament(Match)
    live_counts = await _counts_by_tournament(Match, {"status": "live"})

    summaries = []
    for t in tournaments:
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
                status=t.status,
                logo_url=t.logo_url,
                banner_url=t.banner_url,
                organizer_id=str(t.organizer_id) if t.organizer_id else None,
                # The organizer's login username is never published; only their organization name.
                organizer_name=org.organization_name if org else None,
                organization_name=org.organization_name if org else None,
                teams_count=teams_counts.get(t.id, 0),
                matches_count=matches_counts.get(t.id, 0),
                live_matches_count=live_counts.get(t.id, 0),
                champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
                champion_team_name=champ.name if champ else None,
                champion_crest_url=champ.crest if champ else None,
            )
        )
    return summaries


async def _out_with_live_count(t: Tournament) -> TournamentOut:
    live = await Match.find(Match.tournament_id == t.id, Match.status == "live").count()
    return tournament_to_out(t, live)


@router.get("/slug/{slug}", response_model=TournamentOut)
@tournaments_router.get("/slug/{slug}", response_model=TournamentOut)
async def get_tournament_by_slug(slug: str, viewer: Optional[User] = Depends(get_optional_user)) -> TournamentOut:
    return await _out_with_live_count(await resolve_tournament(tournament_slug=slug, viewer=viewer))


@router.get("/{tournament_id}", response_model=TournamentOut)
@tournaments_router.get("/{tournament_id}", response_model=TournamentOut)
async def get_tournament_by_id(
    tournament_id: str, viewer: Optional[User] = Depends(get_optional_user)
) -> TournamentOut:
    return await _out_with_live_count(await resolve_tournament(tournament_id=tournament_id, viewer=viewer))
