"""Malformed input must produce 4xx client errors, never a 500."""

import pytest

BAD_ID = "not-an-object-id"


@pytest.mark.parametrize(
    "path",
    [
        f"/api/teams/{BAD_ID}",
        f"/api/players/{BAD_ID}",
        f"/api/matches/{BAD_ID}",
        f"/api/matches/{BAD_ID}/events",
        f"/api/standings/{BAD_ID}",
        f"/api/players?team_id={BAD_ID}",
        f"/api/matches?team_id={BAD_ID}",
    ],
)
async def test_malformed_object_id_is_a_422_not_a_500(async_client, tournament, path):
    r = await async_client.get(path)
    assert r.status_code == 422


@pytest.mark.parametrize("color", ["red", "<script>", "#12345", "#gggggg", ""])
async def test_team_color_must_be_hex(async_client, tournament, auth_headers, color):
    r = await async_client.post("/api/teams", json={"name": "T", "color": color, "tournament_id": str(tournament.id)}, headers=auth_headers)
    assert r.status_code == 422


async def test_team_color_accepts_hex(async_client, tournament, auth_headers):
    r = await async_client.post("/api/teams", json={"name": "T", "color": "#a1B2c3", "tournament_id": str(tournament.id)}, headers=auth_headers)
    assert r.status_code == 201


@pytest.mark.parametrize(
    "body",
    [{"date": "2026-13-45"}, {"date": "10/10/2026"}, {"time": "25:99"}, {"time": "6pm"}, {"venue": "x" * 201}],
)
async def test_match_schedule_rejects_malformed_values(async_client, tournament, groups, teams, auth_headers, body):
    from app.models import Match

    m = Match(tournament_id=tournament.id, match_number=1, stage="group", group_id=groups["A"].id)
    await m.insert()
    r = await async_client.patch(f"/api/matches/{m.id}", json=body, headers=auth_headers)
    assert r.status_code == 422


async def test_match_schedule_accepts_valid_and_clears(async_client, tournament, groups, auth_headers):
    from app.models import Match

    m = Match(tournament_id=tournament.id, match_number=1, stage="group", group_id=groups["A"].id)
    await m.insert()
    r = await async_client.patch(
        f"/api/matches/{m.id}", json={"date": "2026-10-10", "time": "09:30"}, headers=auth_headers
    )
    assert r.status_code == 200 and r.json()["date"] == "2026-10-10"
    r = await async_client.patch(f"/api/matches/{m.id}", json={"date": None, "time": None}, headers=auth_headers)
    assert r.status_code == 200 and r.json()["date"] is None
