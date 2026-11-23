import re

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError, NotFoundError
from app.models import GroupTeam, Match, Player, Team, Tournament
from app.schemas.team import TeamCreate
from app.services.groups import assign_team_group


def _name_pattern(name: str) -> re.Pattern:
    return re.compile(f"^{re.escape(name.strip())}$", re.IGNORECASE)


async def _assert_name_available(name: str, exclude_id: PydanticObjectId | None = None) -> None:
    existing = await Team.find_one(Team.name == _name_pattern(name))
    if existing is not None and existing.id != exclude_id:
        raise ConflictError(f"A team named '{name}' already exists")


async def create_team(payload: TeamCreate) -> Team:
    await _assert_name_available(payload.name)

    tournament = await Tournament.find_one()
    if tournament is None:
        raise NotFoundError("Tournament has not been created yet — run migrations first")

    team = Team(
        tournament_id=tournament.id,
        name=payload.name.strip(),
        color=payload.color,
        logo_url=payload.logo_url,
    )
    try:
        await team.insert()
    except DuplicateKeyError as exc:
        raise ConflictError(f"A team named '{payload.name}' already exists") from exc

    if payload.group_id:
        await assign_team_group(team.id, PydanticObjectId(payload.group_id))

    return team


async def rename_team_checked(team: Team, new_name: str) -> None:
    await _assert_name_available(new_name, exclude_id=team.id)


async def delete_team(team: Team) -> None:
    has_players = await Player.find(Player.team_id == team.id).count()
    has_matches = await Match.find(
        {"$or": [{"team1_id": team.id}, {"team2_id": team.id}]}
    ).count()
    if has_players or has_matches:
        raise ConflictError(
            "Cannot remove a team that already has players and/or scheduled matches"
        )
    await GroupTeam.find(GroupTeam.team_id == team.id).delete()
    await team.delete()
