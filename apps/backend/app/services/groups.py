import random

from beanie import PydanticObjectId

from typing import Optional

from app.core.errors import ConflictError, NotFoundError
from app.models import Group, GroupTeam, Match, Team, Tournament, TournamentStanding
from app.services.standings import recalculate_group_standings


async def assert_group_in_tournament(group_id: PydanticObjectId, tournament_id: PydanticObjectId) -> Group:
    """A team may only join a group of its own tournament. Reports 404 (not 403) so a
    foreign group's existence is not revealed."""
    group = await Group.get(group_id)
    if group is None or group.tournament_id != tournament_id:
        raise NotFoundError("Group not found in this tournament")
    return group


async def assign_team_group(
    team_id: PydanticObjectId, group_id: PydanticObjectId, recalc: bool = True
) -> GroupTeam:
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
    await assert_group_in_tournament(group_id, team.tournament_id)

    existing = await GroupTeam.find_one(GroupTeam.team_id == team_id)
    if existing is not None:
        previous_group_id = existing.group_id
        existing.group_id = group_id
        await existing.save()
        if previous_group_id != group_id:
            await TournamentStanding.find(
                TournamentStanding.team_id == team_id, TournamentStanding.group_id == previous_group_id
            ).delete()
        if recalc:
            # Both tables change: the new group gains a row, the old group's table is rebuilt
            # without the team, so neither shows a missing or phantom team.
            await recalculate_group_standings(group_id)
            if previous_group_id != group_id:
                await recalculate_group_standings(previous_group_id)
        return existing

    group_team = GroupTeam(tournament_id=team.tournament_id, group_id=group_id, team_id=team_id)
    await group_team.insert()
    if recalc:
        await recalculate_group_standings(group_id)
    return group_team


async def random_draw(
    tournament_id: PydanticObjectId, num_groups: Optional[int] = None, force: bool = False
) -> list[GroupTeam]:
    """Shuffles all teams in the tournament and distributes them evenly across N groups.

    Requires exactly num_groups x teams_per_group teams so every group can get a full fixture
    list. Redrawing after fixtures exist needs force=True, which erases those fixtures (and
    everything derived from them) first; standings are rebuilt for every group afterwards.
    """
    from app.services.matches import _knockout_is_seeded, purge_matches

    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        raise NotFoundError("Tournament not found")

    n = num_groups or tournament.config.num_groups
    teams = await Team.find(Team.tournament_id == tournament_id).to_list()
    if len(teams) < n:
        raise ConflictError(f"At least {n} teams are required to draw into {n} groups")
    expected = n * tournament.config.teams_per_group
    if num_groups is None and len(teams) != expected:
        raise ConflictError(
            f"The draw needs exactly {expected} teams ({n} groups x {tournament.config.teams_per_group}) "
            f"but this tournament has {len(teams)} — add or remove teams, or change the tournament settings"
        )

    group_matches = await Match.find(Match.tournament_id == tournament_id, Match.stage == "group").to_list()
    if group_matches:
        if not force:
            raise ConflictError(
                "Group fixtures already exist — a redraw would orphan them. Pass force=true to erase "
                "the fixtures and redraw"
            )
        if await _knockout_is_seeded(tournament_id):
            raise ConflictError("The knockout stage is already seeded — delete it before redrawing the groups")
        await purge_matches(group_matches)

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
        results.append(await assign_team_group(team.id, group.id, recalc=False))

    # Standings of every group (including ones left empty or beyond N) are rebuilt once.
    for group in await Group.find(Group.tournament_id == tournament_id).to_list():
        await TournamentStanding.find(TournamentStanding.group_id == group.id).delete()
        await recalculate_group_standings(group.id)
    return results
