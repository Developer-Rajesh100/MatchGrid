from beanie import PydanticObjectId
from fastapi import APIRouter, Depends

from app.core.deps import get_current_admin
from app.core.errors import NotFoundError
from app.models import Admin, Group, GroupTeam, Player, Team
from app.schemas.team import TeamCreate, TeamOut, TeamUpdate
from app.services.groups import assign_team_group
from app.services.serializers import team_to_out
from app.services.teams import create_team, delete_team, rename_team_checked
from app.services.tournament_scope import get_active_tournament_id

router = APIRouter(prefix="/teams", tags=["teams"])


async def _team_or_404(team_id: str) -> Team:
    team = await Team.get(PydanticObjectId(team_id))
    if team is None:
        raise NotFoundError("Team not found")
    return team


@router.get("", response_model=list[TeamOut])
async def list_teams() -> list[TeamOut]:
    tournament_id = await get_active_tournament_id()
    teams = await Team.find(Team.tournament_id == tournament_id).to_list()
    group_teams = {gt.team_id: gt for gt in await GroupTeam.find_all().to_list()}
    groups = {g.id: g for g in await Group.find_all().to_list()}

    out = []
    for team in teams:
        gt = group_teams.get(team.id)
        group = groups.get(gt.group_id) if gt else None
        player_count = await Player.find(Player.team_id == team.id).count()
        out.append(team_to_out(team, gt, group, player_count))
    return out


@router.post("", response_model=TeamOut, status_code=201)
async def add_team(payload: TeamCreate, _admin: Admin = Depends(get_current_admin)) -> TeamOut:
    """Create a team. Team names must be unique (case-insensitive)."""
    team = await create_team(payload)
    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    return team_to_out(team, gt, group, 0)


@router.get("/{team_id}", response_model=TeamOut)
async def get_team(team_id: str) -> TeamOut:
    team = await _team_or_404(team_id)
    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    player_count = await Player.find(Player.team_id == team.id).count()
    return team_to_out(team, gt, group, player_count)


@router.patch("/{team_id}", response_model=TeamOut)
async def update_team(
    team_id: str, payload: TeamUpdate, _admin: Admin = Depends(get_current_admin)
) -> TeamOut:
    """Update team name/color/logo, and/or (re)assign its group via group_id."""
    team = await _team_or_404(team_id)
    data = payload.model_dump(exclude_unset=True)
    group_id = data.pop("group_id", None)

    if "name" in data:
        await rename_team_checked(team, data["name"])

    for field, value in data.items():
        setattr(team, field, value)
    if data:
        await team.save()

    if group_id is not None:
        await assign_team_group(team.id, PydanticObjectId(group_id))

    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    group = await Group.get(gt.group_id) if gt else None
    player_count = await Player.find(Player.team_id == team.id).count()
    return team_to_out(team, gt, group, player_count)


@router.delete("/{team_id}", status_code=204)
async def remove_team(team_id: str, _admin: Admin = Depends(get_current_admin)) -> None:
    """Remove a team. Blocked if it already has players and/or scheduled matches."""
    team = await _team_or_404(team_id)
    await delete_team(team)
