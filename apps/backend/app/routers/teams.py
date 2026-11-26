from typing import Optional
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import check_tournament_ownership, get_current_admin, get_optional_user
from app.core.errors import NotFoundError
from app.models import Group, GroupTeam, Player, Team, User
from app.schemas.team import TeamCreate, TeamOut, TeamUpdate
from app.services.groups import assert_group_in_tournament, assign_team_group
from app.services.media import release_media, validate_media_url
from app.services.serializers import team_to_out
from app.services.teams import create_team, delete_team, rename_team_checked
from app.services.tournament_scope import ensure_tournament_visible, resolve_tournament_id

router = APIRouter(prefix="/teams", tags=["teams"])


async def _team_or_404(team_id: str, viewer: Optional[User] = None, public: bool = False) -> Team:
    team = await Team.get(PydanticObjectId(team_id))
    if team is None:
        raise NotFoundError("Team not found")
    if public or viewer is not None:
        try:
            await ensure_tournament_visible(team.tournament_id, viewer)
        except NotFoundError:
            raise NotFoundError("Team not found")
    return team


@router.get("", response_model=list[TeamOut])
async def list_teams(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
    viewer: Optional[User] = Depends(get_optional_user),
) -> list[TeamOut]:
    resolved_tid = await resolve_tournament_id(tournament_id, tournament_slug, viewer)
    teams = await Team.find(Team.tournament_id == resolved_tid).to_list()
    group_teams = {gt.team_id: gt for gt in await GroupTeam.find(GroupTeam.tournament_id == resolved_tid).to_list()}
    groups = {g.id: g for g in await Group.find(Group.tournament_id == resolved_tid).to_list()}
    # one grouped query for every team's roster size instead of one count per team
    counts = {
        row["_id"]: row["n"]
        async for row in Player.get_pymongo_collection().aggregate(
            [
                {"$match": {"team_id": {"$in": [t.id for t in teams]}}},
                {"$group": {"_id": "$team_id", "n": {"$sum": 1}}},
            ]
        )
    }

    out = []
    for team in teams:
        gt = group_teams.get(team.id)
        group = groups.get(gt.group_id) if gt else None
        out.append(team_to_out(team, gt, group, counts.get(team.id, 0)))
    return out


@router.post("", response_model=TeamOut, status_code=201)
async def add_team(payload: TeamCreate, admin: User = Depends(get_current_admin)) -> TeamOut:
    """Create a team. Team names must be unique within the tournament."""
    # Wire ownership guard
    tournament = await check_tournament_ownership(admin, payload.tournament_id)
    payload.crest_url = validate_media_url(payload.crest_url, tournament.id)
    payload.logo_url = validate_media_url(payload.logo_url, tournament.id)
    team = await create_team(payload, tournament_id=tournament.id)
    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    return team_to_out(team, gt, group, 0)


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: str, viewer: Optional[User] = Depends(get_optional_user)) -> TeamOut:
    team = await _team_or_404(team_id, viewer, public=True)
    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    player_count = await Player.find(Player.team_id == team.id).count()
    return team_to_out(team, gt, group, player_count)


@router.patch("/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: str, payload: TeamUpdate, admin: User = Depends(get_current_admin)
) -> TeamOut:
    """Update team name/color/logo, and/or (re)assign its group via group_id."""
    team = await _team_or_404(team_id)
    await check_tournament_ownership(admin, team.tournament_id)

    data = payload.model_dump(exclude_unset=True)
    group_id = data.pop("group_id", None)
    for field in ("crest_url", "logo_url"):
        if field in data:
            data[field] = validate_media_url(data[field], team.tournament_id)
    if group_id is not None:
        # Fail before any field is saved if the group belongs to another tournament.
        await assert_group_in_tournament(PydanticObjectId(group_id), team.tournament_id)

    if "name" in data:
        await rename_team_checked(team, data["name"])

    old_crest = team.crest
    for field, value in data.items():
        setattr(team, field, value)

    # Sync crest_url and logo_url
    if "crest_url" in data and "logo_url" not in data:
        team.logo_url = data["crest_url"]
    elif "logo_url" in data and "crest_url" not in data:
        team.crest_url = data["logo_url"]

    if data:
        await team.save()

    new_crest = team.crest
    if old_crest and new_crest != old_crest:
        await release_media(old_crest, team.tournament_id)

    if group_id is not None:
        await assign_team_group(team.id, PydanticObjectId(group_id))

    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    player_count = await Player.find(Player.team_id == team.id).count()
    return team_to_out(team, gt, group, player_count)


@router.delete("/{team_id}", status_code=204)
async def remove_team(team_id: str, admin: User = Depends(get_current_admin)) -> None:
    """Remove a team. Blocked if it already has players and/or scheduled matches."""
    team = await _team_or_404(team_id)
    await check_tournament_ownership(admin, team.tournament_id)
    await delete_team(team)
