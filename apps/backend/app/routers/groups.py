from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.deps import check_tournament_ownership, get_current_admin, get_optional_user
from app.models import Group, GroupTeam, Team, User
from app.schemas.group import GroupWithTeamsOut
from app.services.groups import random_draw
from app.services.serializers import group_to_out, team_to_out
from app.services.tournament_scope import resolve_tournament_id

router = APIRouter(prefix="/groups", tags=["groups"])


async def _groups_with_teams(
    tournament_id: Optional[str] = None,
    tournament_slug: Optional[str] = None,
    viewer: Optional[User] = None,
) -> list[GroupWithTeamsOut]:
    resolved_tid = await resolve_tournament_id(tournament_id, tournament_slug, viewer)
    groups = await Group.find(Group.tournament_id == resolved_tid).sort("name").to_list()
    group_teams = await GroupTeam.find(GroupTeam.tournament_id == resolved_tid).to_list()
    teams = {t.id: t for t in await Team.find(Team.tournament_id == resolved_tid).to_list()}

    out = []
    for group in groups:
        members = [gt for gt in group_teams if gt.group_id == group.id]
        team_outs = [
            team_to_out(teams[gt.team_id], gt, group)
            for gt in members
            if gt.team_id in teams
        ]
        out.append(GroupWithTeamsOut(**group_to_out(group).model_dump(), teams=team_outs))
    return out


@router.get("", response_model=list[GroupWithTeamsOut])
async def list_groups(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
    viewer: Optional[User] = Depends(get_optional_user),
) -> list[GroupWithTeamsOut]:
    return await _groups_with_teams(tournament_id, tournament_slug, viewer)


@router.post("/random-draw", response_model=list[GroupWithTeamsOut])
async def do_random_draw(
    tournament_id: str = Query(..., pattern=r"^[0-9a-fA-F]{24}$"),
    force: bool = Query(default=False),
    admin: User = Depends(get_current_admin),
) -> list[GroupWithTeamsOut]:
    """Shuffle all teams randomly into groups. If fixtures already exist, force=true erases them first."""
    tournament = await check_tournament_ownership(admin, tournament_id)
    await random_draw(tournament.id, force=force)
    return await _groups_with_teams(str(tournament.id), viewer=admin)

