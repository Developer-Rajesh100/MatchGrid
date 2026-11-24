import random

from beanie import PydanticObjectId

from typing import Optional

from app.core.errors import ConflictError, NotFoundError
from app.models import Group, GroupTeam, Team, Tournament, TournamentStanding


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


async def random_draw(
    tournament_id: PydanticObjectId, num_groups: Optional[int] = None
) -> list[GroupTeam]:
    """Shuffles all teams in the tournament and distributes them evenly across N groups.

    Dynamically provisions groups 'Group A', 'Group B', ..., 'Group N' if not already present.
    """
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        raise NotFoundError("Tournament not found")

    n = num_groups or (tournament.config.num_groups if getattr(tournament, "config", None) else 2)
    teams = await Team.find(Team.tournament_id == tournament_id).to_list()
    if len(teams) < n:
        raise ConflictError(f"At least {n} teams are required to draw into {n} groups")

    # Ensure exactly N groups exist for this tournament: Group A, Group B, ...
    existing_groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    target_names = [chr(65 + i) for i in range(n)]

    groups_by_name = {g.name: g for g in existing_groups}
    final_groups: list[Group] = []
    for name in target_names:
        if name in groups_by_name:
            final_groups.append(groups_by_name[name])
        else:
            new_group = Group(tournament_id=tournament_id, name=name)
            await new_group.insert()
            final_groups.append(new_group)

    shuffled = teams[:]
    random.shuffle(shuffled)

    results: list[GroupTeam] = []
    for index, team in enumerate(shuffled):
        group = final_groups[index % n]
        results.append(await assign_team_group(team.id, group.id))
    return results
