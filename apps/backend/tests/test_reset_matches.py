"""app.scripts.reset_matches: resets only the named matches, never others."""

import json

from app.models import Match, MatchEvent, PlayerStatistics, Tournament, TournamentStanding
from app.schemas.match_event import MatchEventCreate
from app.scripts.reset_matches import reset_matches
from app.services.match_events import add_event
from app.services.matches import end_match, start_match


async def _play(match, scorer, admin_id, goals=0):
    await start_match(match)
    for i in range(goals):
        await add_event(
            match,
            MatchEventCreate(type="goal", team_id=str(scorer.team_id), player_id=str(scorer.id), minute=5 + i),
            admin_id,
        )
    await end_match(match)


async def _setup(tournament, groups, teams, players, admin):
    def mk(n, a, b, **kw):
        return Match(
            tournament_id=tournament.id, match_number=n, stage="group", group_id=groups["A"].id,
            team1_id=teams[a].id, team2_id=teams[b].id, date="2026-10-10", **kw,
        )

    m1 = mk(1, "Red Dragons", "Golden Hawks", time="08:00")
    m2 = mk(2, "White Lions", "Red Dragons", time="09:00", venue="Court A")
    m3 = mk(3, "Golden Hawks", "White Lions", time="10:00")
    m4 = mk(4, "Red Dragons", "White Lions", time="11:00")  # must stay completely untouched
    for m in (m1, m2, m3, m4):
        await m.insert()
    await _play(m1, players["Red Dragons"][3], admin.id, 0)
    await _play(m2, players["White Lions"][3], admin.id, 1)
    await _play(m4, players["Red Dragons"][3], admin.id, 2)
    return m1, m2, m3, m4


async def test_dry_run_changes_nothing(tournament, groups, teams, players, admin):
    await _setup(tournament, groups, teams, players, admin)
    log = await reset_matches([1, 2], [1, 2, 3], apply=False, backup_file=None)
    assert any("DRY RUN" in line for line in log)
    assert (await Match.find_one(Match.match_number == 2)).status == "full_time"
    assert await MatchEvent.find_all().count() == 3


async def test_apply_resets_only_named_matches(tournament, groups, teams, players, admin, tmp_path):
    m1, m2, m3, m4 = await _setup(tournament, groups, teams, players, admin)
    before_m4 = (await Match.get(m4.id)).model_dump()
    backup = tmp_path / "backup.json"

    await reset_matches([1, 2], [1, 2, 3], apply=True, backup_file=backup)

    for number in (1, 2):
        m = await Match.find_one(Match.match_number == number)
        assert (m.status, m.started_at, m.ended_at, m.elapsed_seconds, m.is_half_time, m.time) == (
            "upcoming", None, None, None, False, None,
        )
    assert (await Match.find_one(Match.match_number == 3)).time is None
    assert (await Match.find_one(Match.match_number == 2)).venue == "Court A"  # other fields kept
    assert (await Match.find_one(Match.match_number == 2)).team1_id == teams["White Lions"].id

    # match 2's goal is gone, match 4's two goals remain, and so do its stats
    events = await MatchEvent.find_all().to_list()
    assert len(events) == 2 and all(e.match_id == m4.id for e in events)
    assert await PlayerStatistics.find_one(PlayerStatistics.player_id == players["White Lions"][3].id) is None
    assert (await PlayerStatistics.find_one(PlayerStatistics.player_id == players["Red Dragons"][3].id)).goals == 2

    # match 4 completely untouched
    assert (await Match.get(m4.id)).model_dump() == before_m4
    # standings now only reflect match 4 (Red Dragons 2-0 White Lions)
    rows = {r.team_id: r for r in await TournamentStanding.find_all().to_list()}
    assert rows[teams["Red Dragons"].id].played == 1 and rows[teams["Red Dragons"].id].points == 3
    assert rows[teams["Golden Hawks"].id].played == 0
    assert (await Tournament.find_one()).stage == "group"

    data = json.loads(backup.read_text())
    assert {m["match_number"] for m in data["matches"]} == {1, 2, 3}
    assert len(data["match_events"]) == 1


async def test_refuses_live_match(tournament, groups, teams, players, admin):
    m1, *_ = await _setup(tournament, groups, teams, players, admin)
    live = await Match.get(m1.id)
    live.status = "live"
    await live.save()
    try:
        await reset_matches([1], [], apply=True, backup_file=None)
        raised = False
    except SystemExit:
        raised = True
    assert raised
