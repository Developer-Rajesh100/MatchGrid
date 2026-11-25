"""Admin-created extra matches: POST /api/matches, edit, delete, and isolation
from standings / tournament stage / player statistics."""

import pytest_asyncio

from app.models import Match, PlayerStatistics


def _body(a, b, **kw):
    return {
        "team1_id": str(a.id), "team2_id": str(b.id), "tournament_id": str(a.tournament_id),
        "date": "2026-11-01", "time": "15:00", **kw,
    }


@pytest_asyncio.fixture
async def base_matches(tournament, groups, teams):
    m = Match(
        tournament_id=tournament.id, match_number=1, stage="group", group_id=groups["A"].id,
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, date="2026-11-01",
    )
    await m.insert()
    return m


async def test_requires_admin(async_client, teams):
    r = await async_client.post("/api/matches", json=_body(teams["Red Dragons"], teams["Blue Whales"]))
    assert r.status_code == 401
    r = await async_client.delete(f"/api/matches/{'0' * 24}")
    assert r.status_code == 401


async def test_create_saves_and_is_listed_publicly(async_client, auth_headers, teams, base_matches, tournament):
    r = await async_client.post(
        "/api/matches",
        json=_body(teams["Red Dragons"], teams["Blue Whales"], venue="Main Arena", label="Charity Cup"),
        headers=auth_headers,
    )
    assert r.status_code == 201
    out = r.json()
    assert out["stage"] == "extra" and out["status"] == "upcoming"
    assert out["match_number"] == 2  # after the existing match, which is untouched
    assert (out["team1_name"], out["team2_name"], out["venue"], out["label"]) == (
        "Red Dragons", "Blue Whales", "Main Arena", "Charity Cup",
    )
    listed = (await async_client.get("/api/matches", params={"tournament_id": str(tournament.id)})).json()
    assert [m["match_number"] for m in listed] == [1, 2]
    assert (await Match.find_one(Match.match_number == 1)).stage == "group"


async def test_default_label(async_client, auth_headers, teams):
    r = await async_client.post("/api/matches", json=_body(teams["Red Dragons"], teams["Blue Whales"]), headers=auth_headers)
    assert r.json()["label"] == "Friendly"


async def test_validation(async_client, auth_headers, teams):
    a, b = teams["Red Dragons"], teams["Blue Whales"]
    cases = [
        ({**_body(a, b), "date": "2026-02-30"}, 422),
        ({**_body(a, b), "date": "nope"}, 422),
        ({**_body(a, b), "time": "25:00"}, 422),
        ({**_body(a, b), "duration_minutes": 0}, 422),
        ({**_body(a, b), "venue": "x" * 201}, 422),
        ({**_body(a, b), "team1_id": "bad"}, 422),
        ({k: v for k, v in _body(a, b).items() if k != "date"}, 422),
        (_body(a, a), 409),
        ({**_body(a, b), "team2_id": "0" * 24}, 404),
    ]
    for body, code in cases:
        r = await async_client.post("/api/matches", json=body, headers=auth_headers)
        assert r.status_code == code, (body, r.json())


async def test_rejects_duplicate_and_team_clash(async_client, auth_headers, teams):
    a, b, c = teams["Red Dragons"], teams["Blue Whales"], teams["White Lions"]
    assert (await async_client.post("/api/matches", json=_body(a, b), headers=auth_headers)).status_code == 201
    # same pair, same date/time (in either order) -> duplicate
    assert (await async_client.post("/api/matches", json=_body(b, a), headers=auth_headers)).status_code == 409
    # a team can't play two matches at the same date+time
    assert (await async_client.post("/api/matches", json=_body(a, c), headers=auth_headers)).status_code == 409
    # different time is fine
    assert (await async_client.post("/api/matches", json=_body(a, c, time="18:00"), headers=auth_headers)).status_code == 201


async def test_edit_and_conflict_on_edit(async_client, auth_headers, teams):
    a, b, c = teams["Red Dragons"], teams["Blue Whales"], teams["White Lions"]
    m1 = (await async_client.post("/api/matches", json=_body(a, b), headers=auth_headers)).json()
    m2 = (await async_client.post("/api/matches", json=_body(a, c, time="18:00"), headers=auth_headers)).json()
    r = await async_client.patch(
        f"/api/matches/{m1['id']}", json={"venue": "Court 2", "label": "Renamed"}, headers=auth_headers
    )
    assert r.status_code == 200 and r.json()["venue"] == "Court 2" and r.json()["label"] == "Renamed"
    # moving m2 onto m1's slot for team a is rejected
    r = await async_client.patch(f"/api/matches/{m2['id']}", json={"time": "15:00"}, headers=auth_headers)
    assert r.status_code == 409
    # reassigning teams
    r = await async_client.put(
        f"/api/matches/{m1['id']}/teams",
        json={"team1_id": str(teams["Golden Hawks"].id), "team2_id": str(b.id)},
        headers=auth_headers,
    )
    assert r.status_code == 200 and r.json()["team1_name"] == "Golden Hawks"


async def test_group_match_label_cannot_be_changed(async_client, auth_headers, base_matches):
    r = await async_client.patch(f"/api/matches/{base_matches.id}", json={"label": "Hacked"}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["label"] is None


async def test_delete_unplayed_matches(async_client, auth_headers, teams, base_matches, tournament):
    m = (await async_client.post("/api/matches", json=_body(teams["Red Dragons"], teams["Blue Whales"]), headers=auth_headers)).json()
    # extra match deletes cleanly
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 204
    assert (await async_client.get(f"/api/matches/{m['id']}")).status_code == 404
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 404
    # an unplayed group-stage match can be deleted too; other matches are untouched
    other = Match(
        tournament_id=tournament.id, match_number=5, stage="group", group_id=base_matches.group_id,
        team1_id=teams["White Lions"].id, team2_id=teams["Golden Hawks"].id,
    )
    await other.insert()
    assert (await async_client.delete(f"/api/matches/{base_matches.id}", headers=auth_headers)).status_code == 204
    assert await Match.get(base_matches.id) is None
    assert await Match.get(other.id) is not None


async def test_cancelled_match_can_be_deleted(async_client, auth_headers, base_matches):
    assert (await async_client.post(f"/api/matches/{base_matches.id}/cancel", headers=auth_headers)).status_code == 200
    assert (await async_client.delete(f"/api/matches/{base_matches.id}", headers=auth_headers)).status_code == 204


async def _play(async_client, auth_headers, match, team, scorer, finish=True):
    mid = str(match.id)
    assert (await async_client.post(f"/api/matches/{mid}/start", headers=auth_headers)).status_code == 200
    ev = await async_client.post(
        f"/api/matches/{mid}/events",
        json={"type": "goal", "team_id": str(team.id), "player_id": str(scorer.id), "minute": 5},
        headers=auth_headers,
    )
    assert ev.status_code == 201
    if finish:
        assert (await async_client.post(f"/api/matches/{mid}/end", headers=auth_headers)).status_code == 200


async def test_completed_group_match_can_be_deleted_and_everything_recomputes(
    async_client, auth_headers, teams, players, groups, tournament, base_matches
):
    from app.models import MatchEvent, TournamentStanding

    other = Match(
        tournament_id=tournament.id, match_number=2, stage="group", group_id=groups["A"].id,
        team1_id=teams["Red Dragons"].id, team2_id=teams["White Lions"].id,
    )
    await other.insert()
    scorer = players["Red Dragons"][3]
    await _play(async_client, auth_headers, base_matches, teams["Red Dragons"], scorer)
    await _play(async_client, auth_headers, other, teams["Red Dragons"], scorer)
    assert (await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)).goals == 2

    r = await async_client.delete(f"/api/matches/{base_matches.id}", headers=auth_headers)
    assert r.status_code == 204
    assert await Match.get(base_matches.id) is None
    events = await MatchEvent.find_all().to_list()
    assert len(events) == 1 and events[0].match_id == other.id
    assert (await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)).goals == 1
    rows = {x.team_id: x for x in await TournamentStanding.find(TournamentStanding.group_id == groups["A"].id).to_list()}
    assert rows[teams["Red Dragons"].id].played == 1 and rows[teams["Red Dragons"].id].points == 3
    assert rows[teams["Golden Hawks"].id].played == 0  # the deleted match no longer counts
    assert await Match.get(other.id) is not None  # other matches untouched


async def test_live_match_can_be_deleted(async_client, auth_headers, teams, players, base_matches):
    await _play(async_client, auth_headers, base_matches, teams["Red Dragons"], players["Red Dragons"][3], finish=False)
    assert (await async_client.delete(f"/api/matches/{base_matches.id}", headers=auth_headers)).status_code == 204
    assert await Match.get(base_matches.id) is None
    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == players["Red Dragons"][3].id)
    assert stats is None or stats.goals == 0


async def test_deleted_knockout_slots_are_recreated_by_generation(
    async_client, auth_headers, teams, groups, tournament
):
    semis = []
    for n, label in ((7, "Semi-final 1"), (8, "Semi-final 2")):
        m = Match(tournament_id=tournament.id, match_number=n, stage="semi", label=label)
        await m.insert()
        semis.append(m)
    final = Match(tournament_id=tournament.id, match_number=9, stage="final", label="Final")
    await final.insert()
    # every knockout slot can be deleted...
    for m in (*semis, final):
        assert (await async_client.delete(f"/api/matches/{m.id}", headers=auth_headers)).status_code == 204
    assert await Match.find(Match.stage != "group").count() == 0
    # ...and group play still completes, then semi-finals are regenerated with the slots back
    for name_a, name_b, n in (("Red Dragons", "Golden Hawks", 1), ("Black Panthers", "Blue Whales", 2)):
        gm = Match(
            tournament_id=tournament.id, match_number=n, stage="group",
            group_id=groups["A" if n == 1 else "B"].id,
            team1_id=teams[name_a].id, team2_id=teams[name_b].id, status="full_time",
        )
        await gm.insert()
    r = await async_client.post(f"/api/matches/generate-semis?tournament_id={tournament.id}", headers=auth_headers)
    assert r.status_code == 200, r.json()
    got = [(m["label"], m["match_number"]) for m in r.json()]
    assert [lbl for lbl, _ in got] == ["Semi-final 1", "Semi-final 2"]
    assert all(m["team1_name"] and m["team2_name"] for m in r.json())


async def test_played_extra_match_is_isolated_from_tournament_data_and_deletable(
    async_client, auth_headers, teams, players, groups, base_matches, tournament
):
    from app.models import Tournament

    a, b = teams["Red Dragons"], teams["Blue Whales"]
    m = (await async_client.post("/api/matches", json=_body(a, b), headers=auth_headers)).json()
    assert (await async_client.post(f"/api/matches/{m['id']}/start", headers=auth_headers)).status_code == 200
    scorer = players["Red Dragons"][3]
    ev = await async_client.post(
        f"/api/matches/{m['id']}/events",
        json={"type": "goal", "team_id": str(a.id), "player_id": str(scorer.id), "minute": 5},
        headers=auth_headers,
    )
    assert ev.status_code == 201
    assert (await async_client.post(f"/api/matches/{m['id']}/end", headers=auth_headers)).status_code == 200
    assert (await async_client.get(f"/api/matches/{m['id']}")).json()["score1"] == 1
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 204
    assert await PlayerStatistics.find_one(PlayerStatistics.player_id == players["Red Dragons"][3].id) is None

    # tournament data unaffected: no stats row counts the friendly goal, no standings, stage unchanged
    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)
    assert stats is None or stats.goals == 0
    board = (await async_client.get("/api/statistics/leaderboards", params={"tournament_id": str(tournament.id)})).json()
    assert board["top_scorers"] == []
    assert all(r["played"] == 0 for g in (await async_client.get("/api/standings", params={"tournament_id": str(tournament.id)})).json() for r in g["standings"])
    assert (await Tournament.find_one()).stage == "group"
    detail = (await async_client.get(f"/api/players/{scorer.id}")).json()
    assert detail["history"] == [] and detail["stats"]["goals"] == 0


async def test_startup_seed_runs_once_so_deleted_fixtures_do_not_come_back(tournament):
    """After the first seed, a deleted fixture must not be re-created by later startups."""
    import app.core.bootstrap as bootstrap
    from app.core.config import get_settings
    from app.core.database import get_client

    state = get_client()[get_settings().mongo_db_name]["startup_state"]
    await state.delete_many({})
    calls = []

    async def fake_seed():
        calls.append(1)

    original, bootstrap._seed = bootstrap._seed, fake_seed
    try:
        await bootstrap.run_startup_tasks()
        await bootstrap.run_startup_tasks()
        assert len(calls) == 1
    finally:
        bootstrap._seed = original
        await state.delete_many({})


async def test_admin_can_renumber_a_match(async_client, auth_headers, base_matches, tournament, teams, groups):
    other = Match(
        tournament_id=tournament.id, match_number=2, stage="group", group_id=groups["A"].id,
        team1_id=teams["White Lions"].id, team2_id=teams["Golden Hawks"].id,
    )
    await other.insert()
    r = await async_client.patch(f"/api/matches/{base_matches.id}", json={"match_number": 20}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["match_number"] == 20
    assert [m["match_number"] for m in (await async_client.get("/api/matches", params={"tournament_id": str(tournament.id)})).json()] == [2, 20]  # ordering follows
    # the freed number can be reused
    r = await async_client.patch(f"/api/matches/{other.id}", json={"match_number": 1}, headers=auth_headers)
    assert r.status_code == 200
    # a number in use by another match is rejected and nothing changes
    r = await async_client.patch(f"/api/matches/{other.id}", json={"match_number": 20}, headers=auth_headers)
    assert r.status_code == 409
    assert (await Match.get(other.id)).match_number == 1


async def test_match_number_validation_and_unchanged_number_is_fine(async_client, auth_headers, base_matches):
    url = f"/api/matches/{base_matches.id}"
    for bad in (0, -3, 1000, "x", 1.5):
        assert (await async_client.patch(url, json={"match_number": bad}, headers=auth_headers)).status_code == 422
    # sending the match's own number alongside other edits is fine
    r = await async_client.patch(url, json={"match_number": 1, "venue": "Court 1"}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["venue"] == "Court 1" and r.json()["match_number"] == 1
    assert (await async_client.patch(url, json={"match_number": 5})).status_code == 401  # admin only


def _group_body(group, a, b, **kw):
    return {"stage": "group", "group_id": str(group.id), "team1_id": str(a.id), "team2_id": str(b.id),
            "tournament_id": str(a.tournament_id), "date": "2026-10-10", **kw}


async def test_create_real_group_fixture_with_chosen_number(async_client, auth_headers, teams, groups, tournament):
    r = await async_client.post(
        "/api/matches",
        json=_group_body(groups["B"], teams["Black Panthers"], teams["Green Alligators"], match_number=1, label="ignored"),
        headers=auth_headers,
    )
    assert r.status_code == 201, r.json()
    out = r.json()
    assert (out["stage"], out["group_name"], out["match_number"], out["label"], out["status"]) == ("group", "B", 1, None, "upcoming")
    # it is a real fixture: listed under its group, filterable by stage, no time set
    assert [m["match_number"] for m in (await async_client.get(f"/api/matches?stage=group&tournament_id={tournament.id}")).json()] == [1]
    assert out["time"] is None


async def test_group_fixture_without_number_gets_next_free_one(async_client, auth_headers, teams, groups, base_matches):
    r = await async_client.post(
        "/api/matches", json=_group_body(groups["A"], teams["White Lions"], teams["Red Dragons"]), headers=auth_headers
    )
    assert r.status_code == 201 and r.json()["match_number"] == 2


async def test_group_fixture_rules(async_client, auth_headers, teams, groups, base_matches):
    a = groups["A"]
    cases = [
        (_group_body(a, teams["Red Dragons"], teams["Blue Whales"]), 409),                 # team from the other group
        ({**_group_body(a, teams["White Lions"], teams["Red Dragons"]), "group_id": None}, 409),  # group required
        (_group_body(a, teams["Red Dragons"], teams["Golden Hawks"]), 409),                # pairing already exists (base match)
        (_group_body(a, teams["White Lions"], teams["Red Dragons"], match_number=1), 409), # number taken
        ({**_group_body(a, teams["White Lions"], teams["Red Dragons"]), "group_id": "0" * 24}, 404),
        (_group_body(a, teams["White Lions"], teams["Red Dragons"], match_number=0), 422),
        (_group_body(a, teams["White Lions"], teams["Red Dragons"], match_number=1000), 422),
    ]
    for body, code in cases:
        r = await async_client.post("/api/matches", json=body, headers=auth_headers)
        assert r.status_code == code, (body, r.status_code, r.json())


async def test_created_group_fixture_counts_in_standings_unlike_extra(
    async_client, auth_headers, teams, players, groups, tournament
):
    from app.models import TournamentStanding

    fx = (await async_client.post(
        "/api/matches", json=_group_body(groups["A"], teams["Red Dragons"], teams["Golden Hawks"]), headers=auth_headers
    )).json()
    scorer = players["Red Dragons"][3]
    await _play(async_client, auth_headers, await Match.get(fx["id"]), teams["Red Dragons"], scorer)
    rows = {r.team_id: r for r in await TournamentStanding.find(TournamentStanding.group_id == groups["A"].id).to_list()}
    assert rows[teams["Red Dragons"].id].points == 3 and rows[teams["Red Dragons"].id].played == 1
    assert (await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)).goals == 1


async def test_most_appearances_hides_players_with_zero(async_client, tournament, teams, players):
    stats = PlayerStatistics(
        tournament_id=tournament.id, player_id=players["Red Dragons"][0].id, team_id=teams["Red Dragons"].id
    )
    await stats.insert()
    board = (await async_client.get("/api/statistics/leaderboards", params={"tournament_id": str(tournament.id)})).json()
    assert board["most_appearances"] == []
