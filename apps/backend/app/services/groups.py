import random

from beanie import PydanticObjectId

from app.core.errors import NotFoundError
from app.models import Group, GroupTeam, Team, TournamentStanding


async def assign_team_group(team_id: PydanticObjectId, group_id: PydanticObjectId) -> GroupTeam:
    """Reassigns a team to a group.

    Also deletes that team's TournamentStanding row for its PREVIOUS group,
    if any. Found during the Timer/Half-Time audit as the root cause of a
    live data-corruption bug: recalculate_group_standings() only ever
    upserts a row for each team CURRENTLY in a group — it has no reason to
    touch a team that just left, so a stale row (goals/points computed
    under the old group membership) was left behind forever, and kept
    showing up in that old group's public standings table alongside the
    real current members. Reassignment is the one moment that actually
    knows "this team no longer belongs here," so it's the right place to
    clean up — recalculate_group_standings() also defensively prunes any
    leftover mismatched row as a second line of defense.
    """
    team = await Team.get(team_id)
    if team is None:
        raise NotFoundError("Team not found")
    group = await Group.get(group_id)
    if group is None:
        raise NotFoundError("Group not found")

    existing = await GroupTeam.find_one(GroupTeam.team_id == team_id)
    if existing is not None:
        previous_group_id = existing.group_id
        existing.group_id = group_id
        await existing.save()
        if previous_group_id != group_id:
            await TournamentStanding.find(
                TournamentStanding.team_id == team_id, TournamentStanding.group_id == previous_group_id
            ).delete()
        return existing

    group_team = GroupTeam(tournament_id=team.tournament_id, group_id=group_id, team_id=team_id)
    await group_team.insert()
    return group_team


async def random_draw(tournament_id: PydanticObjectId) -> list[GroupTeam]:
    teams = await Team.find(Team.tournament_id == tournament_id).to_list()
    groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    if len(groups) < 2:
        raise NotFoundError("Groups not found for this tournament")

    shuffled = teams[:]
    random.shuffle(shuffled)
    half = len(shuffled) // 2

    results: list[GroupTeam] = []
    for index, team in enumerate(shuffled):
        group = groups[0] if index < half else groups[1]
        results.append(await assign_team_group(team.id, group.id))
    return results
