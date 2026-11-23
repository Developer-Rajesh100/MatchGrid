"""Standings/statistics recalculation correctness — reproduces the exact
scenario hand-verified against the live API in Part 3/5 (Red Dragons 2-1
Golden Hawks, with a specific scorer/assist/card/POTM), per implementation.txt
Phase 8.2. Also covers the standings tiebreak order and tournament-stage
progression."""

from app.models import Match, MatchEvent, TournamentStanding
from app.schemas.match_event import MatchEventCreate
from app.services.groups import assign_team_group
from app.services.lineups import set_lineup
from app.services.match_events import add_event
from app.services.matches import end_match
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings, sorted_group_standings
from app.services.tournament_stage import get_match_winner, refresh_tournament_stage


async def _play_match(tournament, groups, teams, players, admin) -> tuple[Match, dict]:
    """Red Dragons 2-1 Golden Hawks — same fixture as the dev seed script's
    simulated match, with known expected outputs. Goes through the real
    add_event()/set_lineup() service calls (not raw inserts), so this
    exercises the exact same path _after_mutation() uses in production —
    including the player-stats recalculation triggered from there."""
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="live",
    )
    await match.insert()

    scorer = players["Red Dragons"][3]  # FWD
    assist = players["Red Dragons"][2]  # MID
    opp_scorer = players["Golden Hawks"][3]  # FWD
    booked = players["Golden Hawks"][1]  # DEF

    lineup_ids = [str(p.id) for p in players["Red Dragons"] + players["Golden Hawks"]]
    await set_lineup(match, lineup_ids)

    await add_event(
        match,
        MatchEventCreate(
            type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id),
            assist_player_id=str(assist.id), minute=23,
        ),
        admin.id,
    )
    await add_event(
        match,
        MatchEventCreate(type="goal", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id), minute=61),
        admin.id,
    )
    await add_event(
        match,
        MatchEventCreate(type="goal", team_id=str(teams["Golden Hawks"].id), player_id=str(opp_scorer.id), minute=75),
        admin.id,
    )
    await add_event(
        match,
        MatchEventCreate(type="yellow", team_id=str(teams["Golden Hawks"].id), player_id=str(booked.id), minute=40),
        admin.id,
    )
    await add_event(
        match,
        MatchEventCreate(type="potm", team_id=str(teams["Red Dragons"].id), player_id=str(scorer.id)),
        admin.id,
    )

    await end_match(match)  # live -> full_time, triggers standings recalculation

    return match, {"scorer": scorer, "assist": assist, "opp_scorer": opp_scorer, "booked": booked}


async def test_standings_reflect_a_completed_group_match(tournament, groups, teams, players, admin):
    match, _ = await _play_match(tournament, groups, teams, players, admin)

    rows = {r.team_id: r for r in await sorted_group_standings(groups["A"].id)}
    dragons = rows[teams["Red Dragons"].id]
    hawks = rows[teams["Golden Hawks"].id]
    lions = rows[teams["White Lions"].id]  # never played

    assert (dragons.played, dragons.won, dragons.drawn, dragons.lost) == (1, 1, 0, 0)
    assert (dragons.goals_for, dragons.goals_against, dragons.goal_difference, dragons.points) == (2, 1, 1, 3)

    assert (hawks.played, hawks.won, hawks.drawn, hawks.lost) == (1, 0, 0, 1)
    assert (hawks.goals_for, hawks.goals_against, hawks.goal_difference, hawks.points) == (1, 2, -1, 0)

    assert (lions.played, lions.points) == (0, 0)


async def test_never_played_group_still_returns_all_zero_rows(tournament, groups, teams):
    """A group with zero completed matches must still return one row per
    assigned team (all zero), not an empty list — regression test for the
    bug found and fixed during Part 3 testing."""
    rows = await sorted_group_standings(groups["B"].id)
    assert len(rows) == 3
    assert all(r.played == 0 and r.points == 0 for r in rows)


async def test_standings_sort_order_is_points_then_gd_then_gf_then_name(tournament, groups, teams):
    """Construct a tie scenario and confirm the exact tiebreak order used
    throughout the project: Points desc, GD desc, GF desc, name asc."""
    a, b, c = teams["Red Dragons"], teams["Golden Hawks"], teams["White Lions"]

    async def make_row(team_id, played, won, drawn, lost, gf, ga):
        from app.models import TournamentStanding

        await TournamentStanding(
            tournament_id=tournament.id, group_id=groups["A"].id, team_id=team_id,
            played=played, won=won, drawn=drawn, lost=lost, goals_for=gf, goals_against=ga,
            goal_difference=gf - ga, points=won * 3 + drawn,
        ).insert()

    # Golden Hawks and White Lions tied on points+GD; White Lions has more GF.
    await make_row(a.id, 1, 1, 0, 0, 3, 0)  # Pts 3
    await make_row(b.id, 1, 0, 1, 0, 1, 1)  # Pts 1, GD 0, GF 1
    await make_row(c.id, 1, 0, 1, 0, 2, 2)  # Pts 1, GD 0, GF 2 -> ranks above Golden Hawks

    rows = await sorted_group_standings(groups["A"].id)
    assert [r.team_id for r in rows] == [a.id, c.id, b.id]


async def test_player_statistics_match_the_events_recorded(tournament, groups, teams, players, admin):
    match, people = await _play_match(tournament, groups, teams, players, admin)

    from app.models import PlayerStatistics

    scorer_stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == people["scorer"].id)
    assert (scorer_stats.appearances, scorer_stats.goals, scorer_stats.assists) == (1, 2, 0)
    assert (scorer_stats.yellow_cards, scorer_stats.red_cards, scorer_stats.potm_awards) == (0, 0, 1)

    assist_stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == people["assist"].id)
    assert (assist_stats.goals, assist_stats.assists) == (0, 1)

    booked_stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == people["booked"].id)
    assert booked_stats.yellow_cards == 1

    # A player who was in the lineup but had no events still gets an
    # appearance and all-zero stats, not a missing row.
    bench_player = players["Red Dragons"][1]
    bench_stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == bench_player.id)
    assert bench_stats is not None
    assert (bench_stats.appearances, bench_stats.goals) == (1, 0)


async def test_appearance_requires_a_real_lineup_entry_not_just_team_membership(
    tournament, groups, teams, players
):
    """Regression test for the exact gap Part 2 closed: a player who is on
    the roster but was never added to the match lineup must NOT be counted
    as having appeared."""
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="live",
    )
    await match.insert()
    # No MatchLineup entries created at all.
    scorer = players["Red Dragons"][3]
    await MatchEvent(match_id=match.id, type="goal", team_id=teams["Red Dragons"].id, player_id=scorer.id, minute=10).insert()
    await end_match(match)
    await recalculate_player_statistics(scorer.id)

    from app.models import PlayerStatistics

    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)
    assert stats.goals == 1
    assert stats.appearances == 0  # scored, but never recorded as having played


async def test_tournament_stage_progresses_through_champions(tournament, groups, teams, players):
    """group -> semis -> final -> champions, mirroring the prototype's
    tournamentStage() derivation."""
    t = await refresh_tournament_stage(tournament.id)
    assert t.stage == "group"

    semi1 = Match(
        tournament_id=tournament.id, match_number=7, stage="semi", label="Semi-final 1",
        team1_id=teams["Red Dragons"].id, status="upcoming",
    )
    await semi1.insert()
    t = await refresh_tournament_stage(tournament.id)
    assert t.stage == "semis"

    final = Match(
        tournament_id=tournament.id, match_number=9, stage="final", label="Final",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Black Panthers"].id, status="upcoming",
    )
    await final.insert()
    t = await refresh_tournament_stage(tournament.id)
    assert t.stage == "final"

    final.status = "full_time"
    await final.save()
    scorer = players["Red Dragons"][3]
    await MatchEvent(match_id=final.id, type="goal", team_id=teams["Red Dragons"].id, player_id=scorer.id, minute=10).insert()
    t = await refresh_tournament_stage(tournament.id)
    assert t.stage == "champions"
    assert t.champion_team_id == teams["Red Dragons"].id


async def test_get_match_winner_falls_back_to_override_on_a_tie(tournament, teams, players):
    match = Match(
        tournament_id=tournament.id, match_number=9, stage="final", label="Final",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Black Panthers"].id, status="full_time",
        winner_override_id=teams["Black Panthers"].id,
    )
    await match.insert()
    # No goal events at all -> 0-0 tie -> falls back to the manual override.
    winner = await get_match_winner(match)
    assert winner == teams["Black Panthers"].id


# ---- reassigning a team's group must not leave a stale standings row ----
# Regression tests for a real, live data-corruption bug found during the
# Timer/Half-Time audit: a team reassigned to a new group kept showing up
# in its OLD group's public standings table forever, because nothing ever
# deleted the old row. See services/groups.py::assign_team_group's docstring.


async def test_reassigning_a_teams_group_deletes_its_old_standing_row(tournament, groups, teams):
    await recalculate_group_standings(groups["A"].id)  # materialize baseline rows for group A
    red_dragons = teams["Red Dragons"]
    assert await TournamentStanding.find_one(
        TournamentStanding.team_id == red_dragons.id, TournamentStanding.group_id == groups["A"].id
    ) is not None

    await assign_team_group(red_dragons.id, groups["B"].id)

    assert await TournamentStanding.find_one(
        TournamentStanding.team_id == red_dragons.id, TournamentStanding.group_id == groups["A"].id
    ) is None
    old_group_a_rows = await sorted_group_standings(groups["A"].id)
    assert red_dragons.id not in {r.team_id for r in old_group_a_rows}


async def test_recalculate_group_standings_prunes_a_row_left_by_an_older_code_path(
    tournament, groups, teams
):
    """Defense-in-depth: even a row that somehow exists without having gone
    through assign_team_group (e.g. data from before this fix shipped) gets
    cleaned up the next time that group's standings are recalculated."""
    stray = TournamentStanding(
        tournament_id=tournament.id, group_id=groups["A"].id, team_id=teams["Black Panthers"].id,
        played=2, won=1, drawn=1, points=4,
    )
    await stray.insert()  # Black Panthers is a Group B team, not Group A

    await recalculate_group_standings(groups["A"].id)

    rows = await sorted_group_standings(groups["A"].id)
    assert teams["Black Panthers"].id not in {r.team_id for r in rows}
    assert len(rows) == 3  # exactly Group A's real 3 members, no phantom row
