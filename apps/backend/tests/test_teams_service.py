"""Coverage for app/services/teams.py — create/rename/delete team logic had
zero automated test coverage before this (confirmed via `pytest --cov`
during the Timer/Half-Time audit's Test Coverage follow-up), despite being
real admin-facing business logic with non-trivial guard conditions (name
uniqueness, "can't delete a team that already has players/matches").
"""

import pytest

from app.core.errors import ConflictError
from app.models import GroupTeam, Match, Player, Team
from app.schemas.team import TeamCreate
from app.services.teams import create_team, delete_team, rename_team_checked


async def test_create_team_succeeds_and_assigns_group_when_given(tournament, groups):
    payload = TeamCreate(name="Silver Eagles", color="#c0c0c0", group_id=str(groups["A"].id), tournament_id=str(tournament.id))
    team = await create_team(payload, tournament.id)

    assert team.name == "Silver Eagles"
    assert team.tournament_id == tournament.id
    gt = await GroupTeam.find_one(GroupTeam.team_id == team.id)
    assert gt is not None
    assert gt.group_id == groups["A"].id


async def test_create_team_without_group_id_creates_ungrouped_team(tournament):
    payload = TeamCreate(name="Free Agents FC", color="#123456", tournament_id=str(tournament.id))
    team = await create_team(payload, tournament.id)

    assert team.id is not None
    assert await GroupTeam.find_one(GroupTeam.team_id == team.id) is None


async def test_create_team_rejects_a_duplicate_name_case_insensitively(tournament, teams):
    payload = TeamCreate(name="red dragons", color="#000000", tournament_id=str(tournament.id))  # existing team, different case
    with pytest.raises(ConflictError):
        await create_team(payload, tournament.id)


async def test_create_team_strips_whitespace_from_the_name(tournament):
    payload = TeamCreate(name="  Padded Name FC  ", color="#111111", tournament_id=str(tournament.id))
    team = await create_team(payload, tournament.id)
    assert team.name == "Padded Name FC"


async def test_rename_team_checked_allows_a_unique_new_name(tournament, teams):
    team = teams["Red Dragons"]
    await rename_team_checked(team, "Crimson Dragons")  # should not raise


async def test_rename_team_checked_allows_keeping_its_own_current_name(tournament, teams):
    team = teams["Red Dragons"]
    await rename_team_checked(team, "Red Dragons")  # renaming to itself must not conflict with itself


async def test_rename_team_checked_rejects_a_name_already_used_by_another_team(tournament, teams):
    team = teams["Red Dragons"]
    with pytest.raises(ConflictError):
        await rename_team_checked(team, "Golden Hawks")


async def test_delete_team_succeeds_when_it_has_no_players_or_matches(tournament, groups):
    team = await create_team(
        TeamCreate(name="Empty Squad FC", color="#222222", group_id=str(groups["A"].id), tournament_id=str(tournament.id)),
        tournament.id,
    )
    await delete_team(team)

    assert await Team.get(team.id) is None
    assert await GroupTeam.find_one(GroupTeam.team_id == team.id) is None


async def test_delete_team_is_blocked_when_it_has_players(tournament, teams, players):
    team = teams["Red Dragons"]
    assert await Player.find(Player.team_id == team.id).count() > 0
    with pytest.raises(ConflictError):
        await delete_team(team)
    assert await Team.get(team.id) is not None  # not deleted


async def test_delete_team_is_blocked_when_it_has_scheduled_matches(tournament, groups, teams):
    team = teams["Red Dragons"]
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=team.id, team2_id=teams["Golden Hawks"].id, status="upcoming",
    )
    await match.insert()

    with pytest.raises(ConflictError):
        await delete_team(team)
    assert await Team.get(team.id) is not None
