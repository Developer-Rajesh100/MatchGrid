"""Manual match team assignment: PUT /api/matches/{id}/teams."""

import pytest_asyncio

from app.models import Match


@pytest_asyncio.fixture
async def semis(tournament, groups):
    out = []
    for n in (7, 8):
        m = Match(tournament_id=tournament.id, match_number=n, stage="semi", label=f"Semi-final {n - 6}")
        await m.insert()
        out.append(m)
    return out


def _body(a, b):
    return {"team1_id": str(a.id), "team2_id": str(b.id)}


async def test_requires_admin(async_client, semis, teams):
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams", json=_body(teams["Red Dragons"], teams["Blue Whales"])
    )
    assert r.status_code == 401


async def test_assign_saves_and_is_publicly_visible(async_client, auth_headers, semis, teams):
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json=_body(teams["Red Dragons"], teams["Blue Whales"]),
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["team1_name"] == "Red Dragons"
    assert r.json()["team2_name"] == "Blue Whales"

    listed = (await async_client.get("/api/matches?stage=semi")).json()
    assert [(m["team1_name"], m["team2_name"]) for m in listed] == [
        ("Red Dragons", "Blue Whales"),
        (None, None),
    ]


async def test_can_reassign_while_upcoming(async_client, auth_headers, semis, teams):
    url = f"/api/matches/{semis[0].id}/teams"
    await async_client.put(url, json=_body(teams["Red Dragons"], teams["Blue Whales"]), headers=auth_headers)
    r = await async_client.put(url, json=_body(teams["Golden Hawks"], teams["Red Dragons"]), headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["team1_name"] == "Golden Hawks"


async def test_rejects_same_team_twice(async_client, auth_headers, semis, teams):
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json=_body(teams["Red Dragons"], teams["Red Dragons"]),
        headers=auth_headers,
    )
    assert r.status_code == 409


async def test_rejects_team_already_in_other_semi(async_client, auth_headers, semis, teams):
    await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json=_body(teams["Red Dragons"], teams["Blue Whales"]),
        headers=auth_headers,
    )
    r = await async_client.put(
        f"/api/matches/{semis[1].id}/teams",
        json=_body(teams["Blue Whales"], teams["Golden Hawks"]),
        headers=auth_headers,
    )
    assert r.status_code == 409


async def test_rejects_unknown_team_and_malformed_id(async_client, auth_headers, semis, teams):
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json={"team1_id": "0" * 24, "team2_id": str(teams["Red Dragons"].id)},
        headers=auth_headers,
    )
    assert r.status_code == 404
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json={"team1_id": "nope", "team2_id": str(teams["Red Dragons"].id)},
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_rejects_non_upcoming_and_keeps_result(async_client, auth_headers, semis, teams):
    semis[0].status = "live"
    await semis[0].save()
    r = await async_client.put(
        f"/api/matches/{semis[0].id}/teams",
        json=_body(teams["Red Dragons"], teams["Blue Whales"]),
        headers=auth_headers,
    )
    assert r.status_code == 409
    assert (await Match.get(semis[0].id)).team1_id is None


async def _group_match(tournament, groups, teams):
    m = Match(
        tournament_id=tournament.id, match_number=1, stage="group", group_id=groups["A"].id,
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id,
    )
    await m.insert()
    return m


async def test_group_match_accepts_only_group_teams(async_client, auth_headers, teams, tournament, groups):
    m = await _group_match(tournament, groups, teams)
    url = f"/api/matches/{m.id}/teams"
    ok = await async_client.put(url, json=_body(teams["Golden Hawks"], teams["White Lions"]), headers=auth_headers)
    assert ok.status_code == 200
    assert ok.json()["team1_name"] == "Golden Hawks" and ok.json()["team2_name"] == "White Lions"
    bad = await async_client.put(url, json=_body(teams["Red Dragons"], teams["Blue Whales"]), headers=auth_headers)
    assert bad.status_code == 409


async def test_group_match_team_change_clears_stale_lineup(
    async_client, auth_headers, teams, players, tournament, groups
):
    from app.models import MatchLineup

    m = await _group_match(tournament, groups, teams)
    p = players["Red Dragons"][0]
    await MatchLineup(match_id=m.id, team_id=teams["Red Dragons"].id, player_id=p.id).insert()
    r = await async_client.put(
        f"/api/matches/{m.id}/teams",
        json=_body(teams["Golden Hawks"], teams["White Lions"]),
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert await MatchLineup.find(MatchLineup.match_id == m.id).count() == 0


async def test_completed_group_match_is_protected(async_client, auth_headers, teams, tournament, groups):
    m = await _group_match(tournament, groups, teams)
    m.status = "full_time"
    await m.save()
    r = await async_client.put(
        f"/api/matches/{m.id}/teams",
        json=_body(teams["Golden Hawks"], teams["White Lions"]),
        headers=auth_headers,
    )
    assert r.status_code == 409
    saved = await Match.get(m.id)
    assert saved.team1_id == teams["Red Dragons"].id


async def test_final_accepts_any_two_distinct_teams(async_client, auth_headers, teams, tournament):
    f = Match(tournament_id=tournament.id, match_number=9, stage="final", label="Final")
    await f.insert()
    r = await async_client.put(
        f"/api/matches/{f.id}/teams",
        json=_body(teams["Red Dragons"], teams["Blue Whales"]),
        headers=auth_headers,
    )
    assert r.status_code == 200
