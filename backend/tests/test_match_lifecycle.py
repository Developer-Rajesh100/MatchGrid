"""Match status-machine tests: legal/illegal transitions for every action
in app/services/matches.py, per implementation.txt Phase 8.2."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.errors import ConflictError
from app.models import Match
from app.services.matches import (
    cancel_match,
    end_match,
    pause_half_time,
    reopen_match,
    reset_timer,
    resume_match,
    set_winner,
    start_match,
    uncancel_match,
)


async def _group_match(tournament, groups, teams, status="upcoming") -> Match:
    m = Match(
        tournament_id=tournament.id,
        match_number=1,
        group_id=groups["A"].id,
        stage="group",
        team1_id=teams["Red Dragons"].id,
        team2_id=teams["Golden Hawks"].id,
        status=status,
    )
    await m.insert()
    return m


async def _knockout_match(tournament, teams, status="upcoming") -> Match:
    m = Match(
        tournament_id=tournament.id,
        match_number=9,
        stage="final",
        label="Final",
        team1_id=teams["Red Dragons"].id,
        team2_id=teams["Black Panthers"].id,
        status=status,
    )
    await m.insert()
    return m


# ---- start_match ----


async def test_start_match_succeeds_when_upcoming_with_both_teams(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    result = await start_match(match)
    assert result.status == "live"


async def test_start_match_fails_without_both_teams(tournament, groups, teams):
    match = Match(
        tournament_id=tournament.id, match_number=7, stage="semi", label="Semi-final 1",
        team1_id=teams["Red Dragons"].id, status="upcoming",  # team2 missing
    )
    await match.insert()
    with pytest.raises(ConflictError):
        await start_match(match)


async def test_start_match_fails_if_already_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    with pytest.raises(ConflictError):
        await start_match(match)


async def test_start_match_fails_if_already_completed(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="full_time")
    with pytest.raises(ConflictError):
        await start_match(match)


async def test_start_match_fails_if_cancelled(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="cancelled")
    with pytest.raises(ConflictError):
        await start_match(match)


# ---- end_match ----


async def test_end_match_succeeds_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    result = await end_match(match)
    assert result.status == "full_time"


async def test_end_match_fails_when_upcoming(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    with pytest.raises(ConflictError):
        await end_match(match)


async def test_end_match_fails_when_already_completed(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="full_time")
    with pytest.raises(ConflictError):
        await end_match(match)


# ---- reopen_match ----


async def test_reopen_match_succeeds_when_completed(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="full_time")
    result = await reopen_match(match)
    assert result.status == "live"


async def test_reopen_match_fails_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    with pytest.raises(ConflictError):
        await reopen_match(match)


async def test_reopen_match_fails_when_upcoming(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    with pytest.raises(ConflictError):
        await reopen_match(match)


# ---- cancel_match / uncancel_match ----


async def test_cancel_match_succeeds_when_upcoming(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    result = await cancel_match(match)
    assert result.status == "cancelled"


async def test_cancel_match_fails_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    with pytest.raises(ConflictError):
        await cancel_match(match)


async def test_cancel_match_fails_when_completed(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="full_time")
    with pytest.raises(ConflictError):
        await cancel_match(match)


async def test_uncancel_match_succeeds_when_cancelled(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="cancelled")
    result = await uncancel_match(match)
    assert result.status == "upcoming"


async def test_uncancel_match_fails_when_not_cancelled(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    with pytest.raises(ConflictError):
        await uncancel_match(match)


# ---- set_winner ----


async def test_set_winner_fails_for_group_stage_match(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="full_time")
    with pytest.raises(ConflictError):
        await set_winner(match, teams["Red Dragons"].id)


async def test_set_winner_fails_if_not_completed(tournament, teams):
    match = await _knockout_match(tournament, teams, status="live")
    with pytest.raises(ConflictError):
        await set_winner(match, teams["Red Dragons"].id)


async def test_set_winner_fails_for_team_not_in_match(tournament, groups, teams):
    match = await _knockout_match(tournament, teams, status="full_time")
    with pytest.raises(ConflictError):
        await set_winner(match, teams["Golden Hawks"].id)  # not in this match


async def test_set_winner_fails_if_score_already_decides_it(tournament, teams, players):
    """A knockout match with a decisive (non-tied) score doesn't need — and
    rejects — a manual override; the score already determines the winner."""
    from app.models import MatchEvent

    match = await _knockout_match(tournament, teams, status="full_time")
    scorer = players["Red Dragons"][0]
    await MatchEvent(
        match_id=match.id, type="goal", team_id=teams["Red Dragons"].id,
        player_id=scorer.id, minute=10,
    ).insert()
    with pytest.raises(ConflictError):
        await set_winner(match, teams["Black Panthers"].id)


async def test_set_winner_succeeds_for_tied_knockout_match(tournament, teams):
    match = await _knockout_match(tournament, teams, status="full_time")
    result = await set_winner(match, teams["Black Panthers"].id)
    assert result.winner_override_id == teams["Black Panthers"].id


# ---- half-time & resume ----


async def test_pause_half_time_succeeds_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    result = await pause_half_time(match, elapsed_seconds=1200)
    assert result.is_half_time is True
    assert result.elapsed_seconds == 1200


async def test_pause_half_time_fails_when_not_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    with pytest.raises(ConflictError):
        await pause_half_time(match)


async def test_resume_match_succeeds_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    await pause_half_time(match, elapsed_seconds=1200)
    resumed = await resume_match(match)
    assert resumed.is_half_time is False
    assert resumed.started_at is not None


async def test_resume_match_fails_when_not_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    with pytest.raises(ConflictError):
        await resume_match(match)


async def test_pause_half_time_without_elapsed_seconds_computes_from_started_at(
    tournament, groups, teams
):
    """Regression test for a real crash found during the Timer/Half-Time
    audit: pymongo returns started_at as a NAIVE datetime after a real DB
    round-trip (even though it's always written as UTC-aware), which used
    to raise `TypeError: can't subtract offset-naive and offset-aware
    datetimes` here. Reloading the match (not reusing the in-memory object
    start_match just returned) is essential to actually exercise the bug —
    an object that never left the process still has its original aware
    datetime and would not have caught this."""
    match = await _group_match(tournament, groups, teams, status="live")
    match.started_at = datetime.now(timezone.utc) - timedelta(seconds=600)
    await match.save()

    reloaded = await Match.get(match.id)
    result = await pause_half_time(reloaded, elapsed_seconds=None)

    assert result.is_half_time is True
    assert result.elapsed_seconds is not None and result.elapsed_seconds >= 600


async def test_pause_half_time_with_negative_elapsed_falls_back_to_computed(
    tournament, groups, teams
):
    match = await _group_match(tournament, groups, teams, status="live")
    reloaded = await Match.get(match.id)
    result = await pause_half_time(reloaded, elapsed_seconds=-5)
    assert result.is_half_time is True
    assert result.elapsed_seconds is not None and result.elapsed_seconds >= 0


# ---- reset timer ----


async def test_reset_timer_succeeds_when_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="live")
    await pause_half_time(match, elapsed_seconds=1200)
    result = await reset_timer(match)
    assert result.elapsed_seconds == 0
    assert result.started_at is not None


async def test_reset_timer_is_a_noop_when_not_live(tournament, groups, teams):
    match = await _group_match(tournament, groups, teams, status="upcoming")
    result = await reset_timer(match)
    assert result.status == "upcoming"
    assert result.started_at is None


# ---- end_match after a half-time pause ----


async def test_end_match_after_half_time_uses_the_paused_elapsed_time(tournament, groups, teams):
    """A match ended right after a half-time pause should record ended_at as
    started_at + the paused elapsed time, not "now" — the clock was paused,
    so wall-clock time elapsed since the pause shouldn't count."""
    match = await _group_match(tournament, groups, teams, status="live")
    match.started_at = datetime.now(timezone.utc) - timedelta(seconds=2000)
    await match.save()
    await pause_half_time(match, elapsed_seconds=1200)

    result = await end_match(match)

    assert result.status == "full_time"
    assert result.ended_at is not None
    actual_duration = (result.ended_at - result.started_at).total_seconds()
    assert abs(actual_duration - 1200) < 2  # allow a tiny scheduling margin

