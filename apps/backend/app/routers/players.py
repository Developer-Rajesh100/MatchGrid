from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import check_tournament_ownership, get_current_admin, get_optional_user
from app.core.errors import NotFoundError
from app.models import Player, Team, User
from app.schemas.player import PlayerCreate, PlayerDetailOut, PlayerOut, PlayerUpdate
from app.services.players import create_player, delete_player, get_player_detail, update_player
from app.services.media import validate_media_url
from app.services.serializers import player_to_out
from app.services.tournament_scope import ensure_tournament_visible, resolve_tournament_id

router = APIRouter(prefix="/players", tags=["players"])


async def _player_or_404(player_id: str) -> Player:
    player = await Player.get(PydanticObjectId(player_id))
    if player is None:
        raise NotFoundError("Player not found")
    return player


async def _resolve_player_tournament_id(player: Player) -> Optional[PydanticObjectId]:
    if getattr(player, "tournament_id", None):
        return player.tournament_id
    team = await Team.get(player.team_id)
    return team.tournament_id if team else None


@router.get("", response_model=list[PlayerOut])
async def list_players(
    team_id: Optional[str] = Query(default=None),
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
    viewer: Optional[User] = Depends(get_optional_user),
) -> list[PlayerOut]:
    resolved_tid = await resolve_tournament_id(tournament_id, tournament_slug, viewer)
    teams = {t.id: t for t in await Team.find(Team.tournament_id == resolved_tid).to_list()}

    if team_id:
        tid = PydanticObjectId(team_id)
        # A team_id outside the current tournament has no players to show,
        # same as any other team_id with an empty roster.
        query = Player.find(Player.team_id == tid) if tid in teams else None
    else:
        query = Player.find({"team_id": {"$in": list(teams.keys())}})

    players = await query.sort("number").to_list() if query is not None else []
    return [player_to_out(p, teams.get(p.team_id)) for p in players]


@router.get("/{player_id}", response_model=PlayerDetailOut)
async def get_player(player_id: str, viewer: Optional[User] = Depends(get_optional_user)) -> PlayerDetailOut:
    player = await _player_or_404(player_id)
    try:
        await ensure_tournament_visible(await _resolve_player_tournament_id(player), viewer)
    except NotFoundError:
        raise NotFoundError("Player not found")
    return await get_player_detail(player)


@router.post("", response_model=PlayerOut, status_code=201)
async def add_player(payload: PlayerCreate, admin: User = Depends(get_current_admin)) -> PlayerOut:
    """Add a player to a team. Registration ID is auto-assigned; jersey number must be unique on the team."""
    team = await Team.get(PydanticObjectId(payload.team_id))
    if team is None:
        raise NotFoundError("Team not found")
    await check_tournament_ownership(admin, team.tournament_id)
    payload.photo_url = validate_media_url(payload.photo_url, team.tournament_id)

    player = await create_player(payload)
    return player_to_out(player, team)


@router.patch("/{player_id}", response_model=PlayerOut)
async def edit_player(
    player_id: str, payload: PlayerUpdate, admin: User = Depends(get_current_admin)
) -> PlayerOut:
    """Update player fields. Setting is_manager=true unsets any other manager on the same team."""
    player = await _player_or_404(player_id)
    tid = await _resolve_player_tournament_id(player)
    await check_tournament_ownership(admin, tid)
    if "photo_url" in payload.model_fields_set:
        payload.photo_url = validate_media_url(payload.photo_url, tid)

    player = await update_player(player, payload)
    team = await Team.get(player.team_id)
    return player_to_out(player, team)


@router.delete("/{player_id}", status_code=204)
async def remove_player(player_id: str, admin: User = Depends(get_current_admin)) -> None:
    """Remove a player. Blocked if the player already has recorded match events or lineup entries."""
    player = await _player_or_404(player_id)
    tid = await _resolve_player_tournament_id(player)
    await check_tournament_ownership(admin, tid)
    await delete_player(player)
