"""Regression tests for the Performance & Scalability audit follow-up.

`compute_scores_and_winners()` replaces a per-match call to
`compute_score()` + `get_match_winner()` in the list-matches endpoint (up to
2 MongoDB round-trips per match, both independently re-fetching that match's
goal events) with a single batched query for the whole list. These tests
prove the batched result is identical to what the original per-match calls
would have produced, across every status/score combination the app cares
about, so the optimization can't silently change what the public API
returns.
"""

from app.models import Match, MatchEvent
from app.services.matches import compute_score, compute_scores_and_winners
from app.services.players import get_player_detail
from app.services.tournament_stage import get_match_winner


async def _goal(match, team_id, player):
    await MatchEvent(match_id=match.id, type="goal", team_id=team_id, player_id=player.id, minute=10).insert()


async def test_batched_scores_and_winners_match_the_per_match_functions_exactly(
    tournament, groups, teams, players
):
    # full_time, clear winner
    m1 = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="full_time",
    )
    await m1.insert()
    await _goal(m1, teams["Red Dragons"].id, players["Red Dragons"][3])
    await _goal(m1, teams["Red Dragons"].id, players["Red Dragons"][3])
    await _goal(m1, teams["Golden Hawks"].id, players["Golden Hawks"][3])

    # full_time, drawn, no override -> no winner
    m2 = Match(
        tournament_id=tournament.id, match_number=2, group_id=groups["A"].id, stage="group",
        team1_id=teams["Golden Hawks"].id, team2_id=teams["White Lions"].id, status="full_time",
    )
    await m2.insert()
    await _goal(m2, teams["Golden Hawks"].id, players["Golden Hawks"][3])
    await _goal(m2, teams["White Lions"].id, players["White Lions"][3])

    # full_time, drawn, WITH a manual override -> override wins
    m3 = Match(
        tournament_id=tournament.id, match_number=3, stage="semi", label="Semi-final 1",
        team1_id=teams["White Lions"].id, team2_id=teams["Black Panthers"].id, status="full_time",
        winner_override_id=teams["Black Panthers"].id,
    )
    await m3.insert()

    # live, not yet full_time -> no winner even though team1 is ahead
    m4 = Match(
        tournament_id=tournament.id, match_number=4, group_id=groups["B"].id, stage="group",
        team1_id=teams["Blue Whales"].id, team2_id=teams["Green Alligators"].id, status="live",
    )
    await m4.insert()
    await _goal(m4, teams["Blue Whales"].id, players["Blue Whales"][3])

    # upcoming knockout slot with no teams assigned yet
    m5 = Match(tournament_id=tournament.id, match_number=5, stage="final", label="Final", status="upcoming")
    await m5.insert()

    matches = [m1, m2, m3, m4, m5]
    batched = await compute_scores_and_winners(matches)

    for m in matches:
        expected_score = await compute_score(m)
        expected_winner = await get_match_winner(m) if m.status == "full_time" else None
        actual_score1, actual_score2, actual_winner = batched[m.id]
        assert (actual_score1, actual_score2) == expected_score, f"score mismatch for match {m.match_number}"
        assert actual_winner == expected_winner, f"winner mismatch for match {m.match_number}"

    # Spot-check the actual expected values, not just self-consistency against
    # the functions being replaced.
    assert batched[m1.id] == (2, 1, teams["Red Dragons"].id)
    assert batched[m2.id] == (1, 1, None)
    assert batched[m3.id] == (0, 0, teams["Black Panthers"].id)
    assert batched[m4.id] == (1, 0, None)
    assert batched[m5.id] == (0, 0, None)


async def test_batched_scores_and_winners_handles_an_empty_list(tournament):
    assert await compute_scores_and_winners([]) == {}


async def test_get_player_detail_history_and_goal_log_after_batching_events_per_match(
    tournament, groups, teams, players
):
    """get_player_detail() used to fetch each match's events twice (once via
    compute_score(), once via its own separate full-event fetch) — now fetches
    every event across all of the player's matches in one query and derives
    both the score and the player's personal stats from that. This proves the
    batched version still produces the exact same history/goal_log/result
    labels as before, across a drawn match and a won match with a goal,
    assist, and a card for the target player.
    """
    scorer = players["Red Dragons"][3]
    assist_provider = players["Red Dragons"][2]
    booked = players["Red Dragons"][1]

    drawn = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="full_time",
    )
    await drawn.insert()
    await MatchEvent(match_id=drawn.id, type="goal", team_id=teams["Red Dragons"].id, player_id=scorer.id, minute=10).insert()
    await MatchEvent(match_id=drawn.id, type="goal", team_id=teams["Golden Hawks"].id, player_id=players["Golden Hawks"][3].id, minute=20).insert()

    won = Match(
        tournament_id=tournament.id, match_number=2, group_id=groups["A"].id, stage="group",
        team1_id=teams["White Lions"].id, team2_id=teams["Red Dragons"].id, status="full_time",
    )
    await won.insert()
    await MatchEvent(
        match_id=won.id, type="goal", team_id=teams["Red Dragons"].id,
        player_id=scorer.id, assist_player_id=assist_provider.id, minute=30,
    ).insert()
    await MatchEvent(match_id=won.id, type="yellow", team_id=teams["Red Dragons"].id, player_id=booked.id, minute=40).insert()

    detail = await get_player_detail(scorer)

    assert [h.match_id for h in detail.history] == [str(drawn.id), str(won.id)]
    assert detail.history[0].result == "Drew"
    assert (detail.history[0].my_score, detail.history[0].opponent_score) == (1, 1)
    assert detail.history[0].goals == 1
    assert detail.history[1].result == "Won"
    assert (detail.history[1].my_score, detail.history[1].opponent_score) == (1, 0)
    assert detail.history[1].goals == 1
    assert len(detail.goal_log) == 2
    assert {g.match_id for g in detail.goal_log} == {str(drawn.id), str(won.id)}

    booked_detail = await get_player_detail(booked)
    assert booked_detail.history[1].yellow_cards == 1
    assert booked_detail.history[0].yellow_cards == 0

    assist_detail = await get_player_detail(assist_provider)
    assert assist_detail.history[1].assists == 1
