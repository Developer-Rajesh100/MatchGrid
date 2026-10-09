"""Admin-created extra matches: POST /api/matches, edit, delete, and isolation
from standings / tournament stage / player statistics."""

import pytest_asyncio

from app.models import Match, PlayerStatistics


def _body(a, b, **kw):
    return {"team1_id": str(a.id), "team2_id": str(b.id), "date": "2026-11-01", "time": "15:00", **kw}


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


async def test_create_saves_and_is_listed_publicly(async_client, auth_headers, teams, base_matches):
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
    listed = (await async_client.get("/api/matches")).json()
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


async def test_delete_extra_only(async_client, auth_headers, teams, base_matches):
    m = (await async_client.post("/api/matches", json=_body(teams["Red Dragons"], teams["Blue Whales"]), headers=auth_headers)).json()
    # protected: tournament matches
    assert (await async_client.delete(f"/api/matches/{base_matches.id}", headers=auth_headers)).status_code == 409
    assert await Match.get(base_matches.id) is not None
    # extra match deletes cleanly
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 204
    assert (await async_client.get(f"/api/matches/{m['id']}")).status_code == 404
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 404


async def test_played_extra_match_cannot_be_deleted_and_is_isolated(
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
    assert (await async_client.delete(f"/api/matches/{m['id']}", headers=auth_headers)).status_code == 409

    # tournament data unaffected: no stats row counts the friendly goal, no standings, stage unchanged
    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == scorer.id)
    assert stats is None or stats.goals == 0
    board = (await async_client.get("/api/statistics/leaderboards")).json()
    assert board["top_scorers"] == []
    assert all(r["played"] == 0 for g in (await async_client.get("/api/standings")).json() for r in g["standings"])
    assert (await Tournament.find_one()).stage == "group"
    detail = (await async_client.get(f"/api/players/{scorer.id}")).json()
    assert detail["history"] == [] and detail["stats"]["goals"] == 0
