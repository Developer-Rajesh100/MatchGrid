"""Match event validation tests: wrong-team player, self-assist, minute
range, POTM replace-not-accumulate — per implementation.txt Phase 8.2."""

import pytest

from app.core.errors import ConflictError, ValidationAppError
from app.models import Match, MatchEvent
from app.schemas.match_event import MatchEventCreate
from app.services.match_events import add_event, remove_event


async def _live_match(tournament, groups, teams) -> Match:
    m = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="live",
    )
    await m.insert()
    return m


async def test_cannot_add_event_to_an_upcoming_match(tournament, groups, teams, players, admin):
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="upcoming",
    )
    await match.insert()
    scorer = players["Red Dragons"][3]
    payload = MatchEventCreate(type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id), minute=10)
    with pytest.raises(ConflictError):
        await add_event(match, payload, admin.id)


async def test_team_must_be_one_of_the_two_in_the_match(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    outside_scorer = players["White Lions"][3]
    payload = MatchEventCreate(
        type="goal", team_id=str(teams["White Lions"].id), player_id=str(outside_scorer.id), minute=10
    )
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_player_must_belong_to_the_selected_team(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    wrong_team_player = players["Golden Hawks"][3]  # not on Red Dragons
    payload = MatchEventCreate(
        type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(wrong_team_player.id), minute=10
    )
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_player_cannot_assist_their_own_goal(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    scorer = players["Red Dragons"][3]
    payload = MatchEventCreate(
        type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id),
        assist_player_id=str(scorer.id), minute=10,
    )
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_assist_must_be_from_the_same_team(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    scorer = players["Red Dragons"][3]
    outside_assist = players["Golden Hawks"][2]
    payload = MatchEventCreate(
        type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id),
        assist_player_id=str(outside_assist.id), minute=10,
    )
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_only_goals_can_have_an_assist(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    booked = players["Red Dragons"][1]
    other = players["Red Dragons"][2]
    payload = MatchEventCreate(
        type="yellow", team_id=str(teams["Red Dragons"].id), player_id=str(booked.id),
        assist_player_id=str(other.id), minute=10,
    )
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_minute_is_required_for_goal_yellow_red(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    scorer = players["Red Dragons"][3]
    payload = MatchEventCreate(type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id))
    with pytest.raises(ValidationAppError):
        await add_event(match, payload, admin.id)


async def test_minute_out_of_range_rejected_by_schema():
    with pytest.raises(Exception):
        MatchEventCreate(type="goal", team_id="x", player_id="y", minute=500)


async def test_potm_does_not_require_a_minute(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    star = players["Red Dragons"][0]
    payload = MatchEventCreate(type="potm", team_id=str(teams["Red Dragons"].id), player_id=str(star.id))
    event = await add_event(match, payload, admin.id)
    assert event.minute is None


async def test_second_potm_replaces_the_first_not_accumulates(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    first_star = players["Red Dragons"][0]
    second_star = players["Red Dragons"][1]

    await add_event(
        match, MatchEventCreate(type="potm", team_id=str(teams["Red Dragons"].id), player_id=str(first_star.id)),
        admin.id,
    )
    await add_event(
        match, MatchEventCreate(type="potm", team_id=str(teams["Red Dragons"].id), player_id=str(second_star.id)),
        admin.id,
    )

    potm_events = await MatchEvent.find(MatchEvent.match_id == match.id, MatchEvent.type == "potm").to_list()
    assert len(potm_events) == 1
    assert potm_events[0].player_id == second_star.id


async def test_valid_goal_with_assist_is_recorded(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    scorer = players["Red Dragons"][3]
    assist = players["Red Dragons"][2]
    event = await add_event(
        match,
        MatchEventCreate(
            type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id),
            assist_player_id=str(assist.id), minute=23,
        ),
        admin.id,
    )
    assert event.player_id == scorer.id
    assert event.assist_player_id == assist.id
    assert event.minute == 23
    assert event.created_by == admin.id


async def test_remove_event_requires_it_belong_to_the_match(tournament, groups, teams, players, admin):
    match = await _live_match(tournament, groups, teams)
    other_match = Match(
        tournament_id=tournament.id, match_number=2, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["White Lions"].id, status="live",
    )
    await other_match.insert()
    scorer = players["Red Dragons"][3]
    event = await add_event(
        other_match,
        MatchEventCreate(type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id), minute=5),
        admin.id,
    )
    from app.core.errors import NotFoundError

    with pytest.raises(NotFoundError):
        await remove_event(match, event.id)  # event belongs to other_match, not match
