import re

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError
from app.models import GroupTeam, Match, Player, Team
from app.schemas.team import TeamCreate
from app.services.groups import assert_group_in_tournament, assign_team_group
from app.services.media import release_media


def _name_pattern(name: str) -> re.Pattern:
    return re.compile(f"^{re.escape(name.strip())}$", re.IGNORECASE)


async def _assert_name_available(
    tournament_id: PydanticObjectId, name: str, exclude_id: PydanticObjectId | None = None
) -> None:
    existing = await Team.find_one(
        Team.tournament_id == tournament_id, Team.name == _name_pattern(name)
    )
    if existing is not None and existing.id != exclude_id:
        raise ConflictError(f"A team named '{name}' already exists in this tournament")


async def create_team(payload: TeamCreate, tournament_id: PydanticObjectId) -> Team:
    await _assert_name_available(tournament_id, payload.name)
    if payload.group_id:
        # Validate before inserting so a bad group never leaves a half-created team behind.
        await assert_group_in_tournament(PydanticObjectId(payload.group_id), tournament_id)

    crest_url = payload.crest_url or payload.logo_url
    team = Team(
        tournament_id=tournament_id,
        name=payload.name.strip(),
        color=payload.color,
        crest_url=crest_url,
        logo_url=crest_url,
    )
    try:
        await team.insert()
    except DuplicateKeyError as exc:
        raise ConflictError(f"A team named '{payload.name}' already exists in this tournament") from exc

    if payload.group_id:
        await assign_team_group(team.id, PydanticObjectId(payload.group_id))

    return team


async def rename_team_checked(team: Team, new_name: str) -> None:
    await _assert_name_available(team.tournament_id, new_name, exclude_id=team.id)


async def delete_team(team: Team) -> None:
    has_players = await Player.find(Player.team_id == team.id).count()
    has_matches = await Match.find(
        {"$or": [{"team1_id": team.id}, {"team2_id": team.id}]}
    ).count()
    if has_players or has_matches:
        raise ConflictError(
            "Cannot remove a team that already has players and/or scheduled matches"
        )
    old_crest = team.crest_url or team.logo_url
    await GroupTeam.find(GroupTeam.team_id == team.id).delete()
    await team.delete()
    if old_crest:
        await release_media(old_crest, team.tournament_id)
