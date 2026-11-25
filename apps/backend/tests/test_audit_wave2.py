"""Regression tests for audit Wave 2 (docs/Audit.md: H1-H13)."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from beanie import PydanticObjectId

from app.core.errors import ConflictError
from app.core.security import create_access_token, hash_password
from app.core.websocket import manager
from app.models import (
    Group,
    GroupTeam,
    Match,
    MatchEvent,
    MatchLineup,
    Player,
    PlayerStatistics,
    Team,
    Tournament,
    TournamentConfig,
    TournamentStanding,
    User,
    UserRole,
)
from app.schemas.match_event import MatchEventCreate
from app.schemas.player import PlayerCreate
from app.services.groups import assign_team_group, random_draw
from app.services.lineups import set_lineup
from app.services.match_events import add_event, remove_event
from app.services.matches import (
    end_match,
    generate_final,
    generate_group_fixtures,
    reopen_match,
    seed_knockout_bracket,
    set_winner,
    start_match,
)
from app.services.players import create_player
from app.services.standings import recalculate_group_standings, sorted_group_standings
from app.services.tournament_stage import compute_knockout_pairings, refresh_tournament_stage

QUARTERS = dict(num_groups=2, teams_per_group=4, qualifiers_per_group=4, knockout_format="quarters_semis_final")


async def _tournament(slug="w2", **config) -> Tournament:
    t = Tournament(name=slug.title(), season="1", slug=slug, config=TournamentConfig(**config) if config else TournamentConfig())
    await t.insert()
    return t


async def _groups(t: Tournament, n: int) -> list[Group]:
    out = []
    for i in range(n):
        g = Group(tournament_id=t.id, name=chr(65 + i))
        await g.insert()
        out.append(g)
    return out


async def _team(t: Tournament, name: str, group: Group | None = None) -> Team:
    team = Team(tournament_id=t.id, name=name, color="#112233")
    await team.insert()
    if group is not None:
        await GroupTeam(tournament_id=t.id, group_id=group.id, team_id=team.id).insert()
    return team


async def _player(t: Tournament, team: Team, n: int = 1) -> Player:
    p = Player(tournament_id=t.id, team_id=team.id, name=f"{team.name} P{n}", number=n, dcl_id=f"X-{team.name}-{n}")
    await p.insert()
    return p


async def _standing(t, group, team, points, gd=0, gf=0):
    await TournamentStanding(
        tournament_id=t.id, group_id=group.id, team_id=team.id, points=points, goal_difference=gd, goals_for=gf
    ).insert()


async def _full_time_group_match(t, group, a, b, number) -> Match:
    m = Match(tournament_id=t.id, match_number=number, stage="group", group_id=group.id,
              team1_id=a.id, team2_id=b.id, status="full_time")
    await m.insert()
    return m


def _ev(team, player, type_="goal", minute=5) -> MatchEventCreate:
    return MatchEventCreate(type=type_, team_id=str(team.id), player_id=str(player.id), minute=minute)


async def _play(match: Match, team1_goals: int, team2_goals: int, scorers: dict) -> Match:
    """Starts, scores and ends a match through the real services."""
    match = await start_match(await Match.get(match.id))
    for _ in range(team1_goals):
        await add_event(match, _ev(await Team.get(match.team1_id), scorers[match.team1_id]), PydanticObjectId())
    for _ in range(team2_goals):
        await add_event(match, _ev(await Team.get(match.team2_id), scorers[match.team2_id]), PydanticObjectId())
    return await end_match(await Match.get(match.id))


async def _quarter_bracket():
    """8 teams, 2 groups of 4, all group matches done, quarter-finals seeded."""
    t = await _tournament("kobracket", **QUARTERS)
    ga, gb = await _groups(t, 2)
    teams, scorers, n = {}, {}, 0
    for g, prefix in ((ga, "A"), (gb, "B")):
        for i in range(1, 5):
            team = await _team(t, f"{prefix}{i}", g)
            teams[f"{prefix}{i}"] = team
            scorers[team.id] = await _player(t, team)
        names = [f"{prefix}{i}" for i in range(1, 5)]
        for a, b in ((0, 1), (2, 3)):
            n += 1
            await _full_time_group_match(t, g, teams[names[a]], teams[names[b]], n)
        await recalculate_group_standings(g.id)
    quarters = await seed_knockout_bracket(t.id)
    by_slot = {q.bracket_slot: q for q in quarters}
    return t, teams, scorers, by_slot


async def _slot(t, slot) -> Match:
    return await Match.find_one(Match.tournament_id == t.id, Match.bracket_slot == slot)


# --------------------------------------------------------------------------- H1-H3: websocket


async def _room_socket(room):
    sock = MagicMock()
    sock.accept = AsyncMock()
    sock.send_json = AsyncMock()
    await manager.connect(sock, tournament_id=room)
    return sock


async def test_h2_assign_teams_broadcast_stays_in_its_tournament_room(async_client, admin, auth_headers):
    t1, t2 = await _tournament("room-one"), await _tournament("room-two")
    a, b = await _team(t1, "A"), await _team(t1, "B")
    m = Match(tournament_id=t1.id, match_number=1, stage="extra")
    await m.insert()
    in_room = await _room_socket(str(t1.id))
    other_room = await _room_socket(str(t2.id))
    try:
        r = await async_client.put(
            f"/api/matches/{m.id}/teams", json={"team1_id": str(a.id), "team2_id": str(b.id)}, headers=auth_headers
        )
        assert r.status_code == 200
        assert in_room.send_json.call_count == 1
        assert in_room.send_json.call_args[0][0]["tournament_id"] == str(t1.id)
        assert other_room.send_json.call_count == 0
    finally:
        await manager.disconnect(in_room)
        await manager.disconnect(other_room)


# --------------------------------------------------------------------------- H4: bracket progression


async def test_h4_quarters_semis_final_progress_automatically_to_a_champion():
    t, teams, scorers, q = await _quarter_bracket()
    await _play(q["QF1"], 1, 0, scorers)
    await _play(q["QF2"], 0, 1, scorers)
    await _play(q["QF3"], 2, 1, scorers)
    await _play(q["QF4"], 0, 3, scorers)

    sf1, sf2 = await _slot(t, "SF1"), await _slot(t, "SF2")
    qf = {k: await _slot(t, k) for k in ("QF1", "QF2", "QF3", "QF4")}
    assert (sf1.team1_id, sf1.team2_id) == (qf["QF1"].team1_id, qf["QF2"].team2_id)
    assert (sf2.team1_id, sf2.team2_id) == (qf["QF3"].team1_id, qf["QF4"].team2_id)

    await _play(sf1, 1, 0, scorers)
    final = await _slot(t, "FINAL")
    assert final.team1_id == sf1.team1_id and final.team2_id is None  # one side fills as soon as it is known
    await _play(sf2, 0, 1, scorers)
    final = await _slot(t, "FINAL")
    assert (final.team1_id, final.team2_id) == (sf1.team1_id, sf2.team2_id)

    await _play(final, 1, 0, scorers)
    tournament = await Tournament.get(t.id)
    assert tournament.stage == "champions" and tournament.champion_team_id == final.team1_id


async def test_h4_reopening_a_quarter_withdraws_its_winner_from_the_semi():
    t, teams, scorers, q = await _quarter_bracket()
    await _play(q["QF1"], 1, 0, scorers)
    sf1 = await _slot(t, "SF1")
    assert sf1.team1_id is not None

    await reopen_match(await _slot(t, "QF1"))
    sf1 = await _slot(t, "SF1")
    assert sf1.team1_id is None


async def test_h4_a_changed_result_moves_the_new_winner_forward():
    t, teams, scorers, q = await _quarter_bracket()
    qf1 = await _play(q["QF1"], 1, 0, scorers)
    assert (await _slot(t, "SF1")).team1_id == qf1.team1_id

    # correct the score on the finished match: team2 scores twice -> team2 now wins
    for _ in range(2):
        await add_event(qf1, _ev(await Team.get(qf1.team2_id), scorers[qf1.team2_id]), PydanticObjectId())
    assert (await _slot(t, "SF1")).team1_id == qf1.team2_id

    # remove those goals again -> back to team1
    for event in await MatchEvent.find(MatchEvent.match_id == qf1.id, MatchEvent.team_id == qf1.team2_id).to_list():
        await remove_event(qf1, event.id)
    assert (await _slot(t, "SF1")).team1_id == qf1.team1_id


async def test_h4_a_level_score_withdraws_the_winner_until_one_is_set_and_override_clears_when_decided():
    t, teams, scorers, q = await _quarter_bracket()
    qf1 = await _play(q["QF1"], 1, 0, scorers)
    # equalise: now level and undecided
    await add_event(qf1, _ev(await Team.get(qf1.team2_id), scorers[qf1.team2_id]), PydanticObjectId())
    assert (await _slot(t, "SF1")).team1_id is None

    await set_winner(await Match.get(qf1.id), qf1.team2_id)
    assert (await _slot(t, "SF1")).team1_id == qf1.team2_id
    assert (await Match.get(qf1.id)).winner_override_id == qf1.team2_id

    # a later goal decides the match on the score: the stale manual override must go
    await add_event(qf1, _ev(await Team.get(qf1.team1_id), scorers[qf1.team1_id]), PydanticObjectId())
    refreshed = await Match.get(qf1.id)
    assert refreshed.winner_override_id is None
    assert (await _slot(t, "SF1")).team1_id == qf1.team1_id


async def test_h4_changes_are_blocked_once_the_next_round_match_has_started():
    t, teams, scorers, q = await _quarter_bracket()
    qf1 = await _play(q["QF1"], 1, 0, scorers)
    await _play(q["QF2"], 0, 1, scorers)
    await start_match(await _slot(t, "SF1"))

    with pytest.raises(ConflictError):
        await reopen_match(await Match.get(qf1.id))
    with pytest.raises(ConflictError):
        await add_event(qf1, _ev(await Team.get(qf1.team2_id), scorers[qf1.team2_id]), PydanticObjectId())
    event = await MatchEvent.find_one(MatchEvent.match_id == qf1.id)
    with pytest.raises(ConflictError):
        await remove_event(qf1, event.id)
    assert (await Match.get(qf1.id)).status == "full_time"  # untouched
    assert (await _slot(t, "SF1")).team1_id == qf1.team1_id


async def test_h4_semi_reopen_withdraws_final_slot_and_final_start_blocks_it():
    t, teams, scorers, q = await _quarter_bracket()
    for slot, goals in (("QF1", (1, 0)), ("QF2", (1, 0)), ("QF3", (1, 0)), ("QF4", (1, 0))):
        await _play(q[slot], *goals, scorers)
    sf1 = await _play(await _slot(t, "SF1"), 1, 0, scorers)
    assert (await _slot(t, "FINAL")).team1_id == sf1.team1_id

    await reopen_match(await Match.get(sf1.id))
    assert (await _slot(t, "FINAL")).team1_id is None

    # re-finish it with the other team ahead: it was reopened, so it is live again and can take events
    live_again = await Match.get(sf1.id)
    for _ in range(2):
        await add_event(live_again, _ev(await Team.get(sf1.team2_id), scorers[sf1.team2_id]), PydanticObjectId())
    sf1 = await end_match(await Match.get(sf1.id))
    assert (await _slot(t, "FINAL")).team1_id == sf1.team2_id
    sf2 = await _play(await _slot(t, "SF2"), 1, 0, scorers)
    await start_match(await _slot(t, "FINAL"))
    with pytest.raises(ConflictError):
        await reopen_match(await Match.get(sf2.id))


async def test_h4_generate_final_is_idempotent_and_requires_decided_semis():
    t, teams, scorers, q = await _quarter_bracket()
    with pytest.raises(ConflictError):
        await generate_final(t.id)
    for slot in ("QF1", "QF2", "QF3", "QF4"):
        await _play(q[slot], 1, 0, scorers)
    await _play(await _slot(t, "SF1"), 1, 0, scorers)
    await _play(await _slot(t, "SF2"), 1, 0, scorers)
    first = await generate_final(t.id)
    again = await generate_final(t.id)
    assert first.id == again.id and first.team1_id and first.team2_id


# --------------------------------------------------------------------------- H5: generalised seeding


async def test_h5_two_groups_keep_the_official_semi_final_pairing():
    t = await _tournament("legacy")
    ga, gb = await _groups(t, 2)
    a = [await _team(t, f"A{i}", ga) for i in (1, 2, 3)]
    b = [await _team(t, f"B{i}", gb) for i in (1, 2, 3)]
    for g, teams in ((ga, a), (gb, b)):
        for pts, team in zip((9, 6, 3), teams):
            await _standing(t, g, team, pts)
    pairs = await compute_knockout_pairings(t.id, "semis_final", 2)
    assert pairs == [(a[1].id, b[0].id), (b[1].id, a[0].id)]  # A2 v B1, B2 v A1


async def test_h5_four_single_qualifier_groups_now_seed_semis():
    t = await _tournament("fourgroups", num_groups=4, teams_per_group=2, qualifiers_per_group=1)
    winners = []
    for g, pts in zip(await _groups(t, 4), (9, 8, 7, 6)):
        team = await _team(t, f"W{g.name}", g)
        await _standing(t, g, team, pts)
        winners.append(team)
    pairs = await compute_knockout_pairings(t.id, "semis_final", 1)
    assert pairs == [(winners[0].id, winners[3].id), (winners[1].id, winners[2].id)]


async def test_h5_three_groups_quarters_pick_the_best_eight_of_nine():
    t = await _tournament("threegroups", num_groups=3, teams_per_group=3, qualifiers_per_group=3,
                          knockout_format="quarters_semis_final")
    rows = {}
    for g in await _groups(t, 3):
        for rank, pts in enumerate((9, 6, 3)):
            team = await _team(t, f"{g.name}{rank + 1}", g)
            # make the three third-placed teams distinguishable: C3 is the worst
            await _standing(t, g, team, pts - (1 if (g.name == "C" and rank == 2) else 0))
            rows[team.name] = team
    pairs = await compute_knockout_pairings(t.id, "quarters_semis_final", 3)
    used = {tid for pair in pairs for tid in pair}
    assert len(pairs) == 4 and len(used) == 8
    assert rows["C3"].id not in used  # the weakest third place misses the cut


async def test_h5_shortfalls_are_409_not_index_errors():
    t = await _tournament("short", num_groups=2, teams_per_group=4, qualifiers_per_group=4,
                          knockout_format="quarters_semis_final")
    ga, gb = await _groups(t, 2)
    for g in (ga, gb):
        for i in range(3):  # only 3 teams where 4 qualify
            team = await _team(t, f"{g.name}{i}", g)
            await _standing(t, g, team, 3 - i)
    with pytest.raises(ConflictError):
        await compute_knockout_pairings(t.id, "quarters_semis_final", 4)
    with pytest.raises(ConflictError):
        await compute_knockout_pairings(t.id, "quarters_semis_final", 2)  # pool of 4 < 8 needed


# --------------------------------------------------------------------------- H6 / H7: fixtures


async def _group_of_three(slug="fx"):
    t = await _tournament(slug)
    ga, gb = await _groups(t, 2)
    teams = {n: await _team(t, n, g) for g, names in ((ga, "ABC"), (gb, "DEF")) for n in names}
    scorers = {team.id: await _player(t, team) for team in teams.values()}
    return t, ga, gb, teams, scorers


async def test_h6_forced_regeneration_recomputes_standings_and_stats():
    t, ga, gb, teams, scorers = await _group_of_three("h6")
    matches = await generate_group_fixtures(ga.id, force=False)
    played = await _play(matches[0], 2, 0, scorers)
    winner = scorers[played.team1_id]
    assert (await PlayerStatistics.find_one(PlayerStatistics.player_id == winner.id)).goals == 2
    table = await sorted_group_standings(ga.id)
    assert table[0].points == 3

    await generate_group_fixtures(ga.id, force=True)

    assert not await PlayerStatistics.find(PlayerStatistics.player_id == winner.id, PlayerStatistics.goals > 0).count()
    table = await sorted_group_standings(ga.id)
    assert all(row.points == 0 and row.played == 0 for row in table)


async def test_h7_regeneration_keeps_other_matches_numbers_and_reuses_its_own():
    t, ga, gb, teams, scorers = await _group_of_three("h7")
    a_matches = await generate_group_fixtures(ga.id, force=False)
    b_matches = await generate_group_fixtures(gb.id, force=False)
    a_numbers = sorted(m.match_number for m in a_matches)
    b_numbers = sorted(m.match_number for m in b_matches)

    # an organizer renumbers a played group-B match and adds a friendly
    played = await _play(b_matches[0], 1, 0, scorers)
    played = await Match.get(played.id)
    played.match_number = 57
    await played.save()
    friendly = Match(tournament_id=t.id, match_number=40, stage="extra", team1_id=teams["A"].id, team2_id=teams["D"].id)
    await friendly.insert()

    regenerated = await generate_group_fixtures(ga.id, force=True)

    assert sorted(m.match_number for m in regenerated) == a_numbers  # same slots, no shuffle of others
    assert (await Match.get(played.id)).match_number == 57
    assert (await Match.get(friendly.id)).match_number == 40
    untouched = sorted(m.match_number for m in await Match.find(Match.group_id == gb.id).to_list())
    assert untouched == sorted([57] + [n for n in b_numbers if n != b_matches[0].match_number])


async def test_h6_force_is_refused_after_the_knockout_is_seeded():
    t, teams, scorers, q = await _quarter_bracket()
    group = await Group.find_one(Group.tournament_id == t.id, Group.name == "A")
    with pytest.raises(ConflictError):
        await generate_group_fixtures(group.id, force=True)


# --------------------------------------------------------------------------- H8 / H9: draw and moves


async def test_h8_draw_requires_exactly_groups_times_teams_per_group():
    t = await _tournament("draw")  # 2 groups x 3 = 6 teams
    for i in range(7):
        await _team(t, f"T{i}")
    with pytest.raises(ConflictError, match="exactly 6"):
        await random_draw(t.id)
    await Team.find(Team.name == "T6").delete()
    results = await random_draw(t.id)
    assert len(results) == 6
    sizes = sorted([await GroupTeam.find(GroupTeam.group_id == g.id).count() for g in await Group.find(Group.tournament_id == t.id).to_list()])
    assert sizes == [3, 3]
    # every drawn team has a standings row straight away
    assert await TournamentStanding.find(TournamentStanding.tournament_id == t.id).count() == 6


async def test_h8_redraw_needs_force_and_erases_fixtures_cleanly():
    t = await _tournament("redraw")
    for i in range(6):
        await _team(t, f"T{i}")
    await random_draw(t.id)
    for g in await Group.find(Group.tournament_id == t.id).to_list():
        await generate_group_fixtures(g.id, force=False)
    assert await Match.find(Match.tournament_id == t.id).count() == 6

    with pytest.raises(ConflictError, match="force"):
        await random_draw(t.id)
    assert await Match.find(Match.tournament_id == t.id).count() == 6  # nothing was touched

    await random_draw(t.id, force=True)
    assert await Match.find(Match.tournament_id == t.id).count() == 0
    assert await TournamentStanding.find(TournamentStanding.tournament_id == t.id).count() == 6


async def test_h8_draw_endpoint_force_flag(async_client, admin, auth_headers):
    t = await _tournament("drawapi")
    for i in range(6):
        await _team(t, f"T{i}")
    url = f"/api/groups/random-draw?tournament_id={t.id}"
    assert (await async_client.post(url, headers=auth_headers)).status_code == 200
    for g in await Group.find(Group.tournament_id == t.id).to_list():
        await generate_group_fixtures(g.id, force=False)
    assert (await async_client.post(url, headers=auth_headers)).status_code == 409
    assert (await async_client.post(url + "&force=true", headers=auth_headers)).status_code == 200


async def test_h9_moving_a_team_updates_both_standings_tables():
    t, ga, gb, teams, scorers = await _group_of_three("h9")
    await recalculate_group_standings(ga.id)
    await recalculate_group_standings(gb.id)  # tables exist, so lazy rebuilds will not fire

    await assign_team_group(teams["A"].id, gb.id)

    table_a = {r.team_id for r in await sorted_group_standings(ga.id)}
    table_b = {r.team_id for r in await sorted_group_standings(gb.id)}
    assert teams["A"].id in table_b and teams["A"].id not in table_a
    assert len(table_a) == 2 and len(table_b) == 4


# --------------------------------------------------------------------------- H10: league champion


async def _league(slug, groups_n):
    t = await _tournament(slug, num_groups=groups_n, teams_per_group=2, qualifiers_per_group=1, knockout_format="none")
    gs = await _groups(t, groups_n)
    out = []
    for g in gs:
        a, b = await _team(t, f"{g.name}1", g), await _team(t, f"{g.name}2", g)
        out.append((g, a, b))
    return t, out


async def test_h10_single_table_league_crowns_the_leader_and_ignores_cancelled_fixtures():
    t, [(g, a, b)] = await _league("league1", 1)
    scorers = {a.id: await _player(t, a), b.id: await _player(t, b)}
    m = Match(tournament_id=t.id, match_number=1, stage="group", group_id=g.id, team1_id=a.id, team2_id=b.id)
    cancelled = Match(tournament_id=t.id, match_number=2, stage="group", group_id=g.id, team1_id=b.id,
                      team2_id=a.id, status="cancelled")
    await m.insert()
    await cancelled.insert()
    await _play(m, 1, 0, scorers)
    tournament = await Tournament.get(t.id)
    assert tournament.stage == "champions" and tournament.champion_team_id == a.id


async def test_h10_multi_group_league_finishes_without_a_bogus_cross_group_champion():
    t, groups = await _league("league2", 2)
    scorers = {}
    for g, a, b in groups:
        scorers[a.id], scorers[b.id] = await _player(t, a), await _player(t, b)
        m = Match(tournament_id=t.id, match_number=len(scorers), stage="group", group_id=g.id, team1_id=a.id, team2_id=b.id)
        await m.insert()
        await _play(m, 1, 0, scorers)
    tournament = await Tournament.get(t.id)
    assert tournament.stage == "champions"
    assert tournament.champion_team_id is None


# --------------------------------------------------------------------------- H11: server clock


async def test_h11_match_responses_carry_the_server_clock(async_client, admin, auth_headers):
    from datetime import datetime, timezone

    t = await _tournament("clock")
    a, b = await _team(t, "A"), await _team(t, "B")
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id)
    await m.insert()
    before = datetime.now(timezone.utc)
    body = (await async_client.get(f"/api/matches/{m.id}")).json()
    after = datetime.now(timezone.utc)
    server_now = datetime.fromisoformat(body["server_now"].replace("Z", "+00:00"))
    assert before <= server_now <= after
    listed = (await async_client.get(f"/api/matches?tournament_id={t.id}")).json()
    assert listed[0]["server_now"]


# --------------------------------------------------------------------------- H12: events and lineups


async def test_h12_events_are_rejected_on_cancelled_matches(async_client, clean_db):
    org = User(username="o", password_hash=hash_password("x"), role=UserRole.ORGANIZER)
    await org.insert()
    t = await _tournament("cancelled")
    t.organizer_id = org.id
    await t.save()
    a, b = await _team(t, "A"), await _team(t, "B")
    p = await _player(t, a)
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id, status="cancelled")
    await m.insert()
    token, _ = create_access_token(str(org.id))
    r = await async_client.post(
        f"/api/matches/{m.id}/events",
        json={"type": "goal", "team_id": str(a.id), "player_id": str(p.id), "minute": 3},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 409
    assert await MatchEvent.find(MatchEvent.match_id == m.id).count() == 0


async def test_h12_lineup_replacement_never_empties_the_sheet_and_validates_first():
    t = await _tournament("lineup")
    a, b = await _team(t, "A"), await _team(t, "B")
    ps = [await _player(t, a, n) for n in (1, 2, 3)]
    stranger = await _player(t, await _team(t, "Z"), 1)
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id)
    await m.insert()

    first = await set_lineup(m, [str(ps[0].id), str(ps[1].id)])
    assert {e.player_id for e in first} == {ps[0].id, ps[1].id}
    original_row = await MatchLineup.find_one(MatchLineup.match_id == m.id, MatchLineup.player_id == ps[0].id)

    second = await set_lineup(m, [str(ps[1].id), str(ps[2].id)])
    assert {e.player_id for e in second} == {ps[1].id, ps[2].id}
    stored = await MatchLineup.find(MatchLineup.match_id == m.id).to_list()
    assert {e.player_id for e in stored} == {ps[1].id, ps[2].id}
    assert await MatchLineup.get(original_row.id) is None  # dropped player removed

    # an invalid request changes nothing at all
    from app.core.errors import ValidationAppError

    with pytest.raises(ValidationAppError):
        await set_lineup(m, [str(ps[0].id), str(stranger.id)])
    stored = await MatchLineup.find(MatchLineup.match_id == m.id).to_list()
    assert {e.player_id for e in stored} == {ps[1].id, ps[2].id}


# --------------------------------------------------------------------------- H13: player counters


async def test_h13_player_ids_count_per_tournament():
    t1, t2 = await _tournament("pc-one"), await _tournament("pc-two")
    team1, team2 = await _team(t1, "One"), await _team(t2, "Two")

    ids1 = [(await create_player(PlayerCreate(team_id=str(team1.id), name=f"P{n}", number=n))).dcl_id for n in (1, 2, 3)]
    first_of_t2 = (await create_player(PlayerCreate(team_id=str(team2.id), name="Q", number=1))).dcl_id

    assert ids1 == ["DCL-001", "DCL-002", "DCL-003"]
    assert first_of_t2 == "DCL-001"  # not DCL-004: another tournament's players do not count

    # deleting does not make the next id collide with a live one
    victim = await Player.find_one(Player.team_id == team1.id, Player.number == 1)
    await victim.delete()
    nxt = (await create_player(PlayerCreate(team_id=str(team1.id), name="P4", number=4))).dcl_id
    assert nxt == "DCL-004"
    assert len({p.dcl_id for p in await Player.find(Player.tournament_id == t1.id).to_list()}) == 3


async def test_h13_counter_catches_up_with_seeded_players():
    t = await _tournament("pc-seeded")
    team = await _team(t, "Seeded")
    for n in range(1, 6):  # imported players the counter never issued
        await Player(tournament_id=t.id, team_id=team.id, dcl_id=f"DCL-{n:03d}", name=f"S{n}", number=n).insert()
    created = await create_player(PlayerCreate(team_id=str(team.id), name="New", number=50))
    assert created.dcl_id == "DCL-006"


async def test_h13_migration_dedupes_ids_and_backfills_the_counter():
    from app.migrations import m0008_player_ids_per_tournament

    t = await _tournament("pc-migrate")
    team = await _team(t, "M")
    db = Player.get_pymongo_collection()
    await db.drop_index("tournament_id_1_dcl_id_1")  # legacy data pre-dates the unique index
    try:
        for n, dcl in ((1, "DCL-007"), (2, "DCL-007"), (3, "DCL-002")):
            await db.insert_one({"tournament_id": t.id, "team_id": team.id, "dcl_id": dcl, "name": f"P{n}",
                                 "number": n, "is_manager": False})
        await m0008_player_ids_per_tournament.up()
        ids = [p.dcl_id for p in await Player.find(Player.tournament_id == t.id).to_list()]
        assert len(set(ids)) == 3
        assert (await Tournament.get(t.id)).player_seq == 8  # 7 was the highest, the duplicate got 8
    finally:
        await Player.find(Player.tournament_id == t.id).delete()
        await Player.get_pymongo_collection().create_index(
            [("tournament_id", 1), ("dcl_id", 1)],
            unique=True,
            partialFilterExpression={"dcl_id": {"$type": "string"}, "tournament_id": {"$type": "objectId"}},
        )


async def test_refresh_tournament_stage_import_is_still_available():
    """tournament_stage keeps exporting refresh_tournament_stage for the services that call it."""
    assert callable(refresh_tournament_stage)


async def test_h13_startup_repairs_duplicate_ids_before_building_the_unique_index():
    """init_db used to build the new unique index first, which aborts boot on legacy duplicates."""
    from app.core.database import close_db, init_db

    t = await _tournament("pc-boot")
    team = await _team(t, "Boot")
    players = Player.get_pymongo_collection()
    await players.drop_index("tournament_id_1_dcl_id_1")
    for n in (1, 2):
        await players.insert_one({"tournament_id": t.id, "team_id": team.id, "dcl_id": "DCL-001", "name": f"P{n}",
                                  "number": n, "is_manager": False})

    await close_db()
    await init_db()  # must not raise DuplicateKeyError while creating the index

    ids = [p.dcl_id for p in await Player.find(Player.tournament_id == t.id).to_list()]
    assert len(set(ids)) == 2
    assert (await Tournament.get(t.id)).player_seq == 2
    with pytest.raises(Exception):  # the unique index is back in force
        await Player(tournament_id=t.id, team_id=team.id, dcl_id=ids[0], name="Dup", number=99).insert()
