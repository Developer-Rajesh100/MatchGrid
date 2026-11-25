"""The single-admin auth boundary, tested at the HTTP layer (through
get_current_admin, not by calling services directly) — every mutating
route rejects missing/invalid tokens; every read route works with none.
Per implementation.txt Phase 8.2 and reference/plan.txt Section 8."""

import pytest

DUMMY_ID = "0" * 24  # syntactically valid ObjectId-shaped string; auth must
# reject the request before any DB lookup happens, so a real match/team/etc
# never needs to exist for these tests.

# (method, path, json body) for every mutating endpoint in the API.
MUTATING_ENDPOINTS = [
    ("PATCH", f"/api/organizer/tournaments/{DUMMY_ID}", {"name": "X"}),
    ("PATCH", f"/api/organizer/tournaments/{DUMMY_ID}/config", {"points_win": 2}),
    ("POST", "/api/teams", {"name": "X", "color": "#fff", "tournament_id": DUMMY_ID}),
    ("PATCH", f"/api/teams/{DUMMY_ID}", {"name": "X"}),
    ("DELETE", f"/api/teams/{DUMMY_ID}", None),
    ("POST", f"/api/groups/random-draw?tournament_id={DUMMY_ID}", None),
    ("POST", "/api/players", {"team_id": DUMMY_ID, "name": "X", "number": 1}),
    ("PATCH", f"/api/players/{DUMMY_ID}", {"name": "X"}),
    ("DELETE", f"/api/players/{DUMMY_ID}", None),
    ("PATCH", f"/api/matches/{DUMMY_ID}", {"venue": "X"}),
    ("POST", f"/api/matches/{DUMMY_ID}/start", None),
    ("POST", f"/api/matches/{DUMMY_ID}/end", None),
    ("POST", f"/api/matches/{DUMMY_ID}/reopen", None),
    ("POST", f"/api/matches/{DUMMY_ID}/half-time", None),
    ("POST", f"/api/matches/{DUMMY_ID}/resume", None),
    ("POST", f"/api/matches/{DUMMY_ID}/reset-timer", None),
    ("POST", f"/api/matches/{DUMMY_ID}/cancel", None),
    ("POST", f"/api/matches/{DUMMY_ID}/uncancel", None),
    ("POST", f"/api/matches/{DUMMY_ID}/winner", {"team_id": DUMMY_ID}),
    ("POST", "/api/matches/generate-group-fixtures", {"group_id": DUMMY_ID}),
    ("POST", f"/api/matches/generate-semis?tournament_id={DUMMY_ID}", None),
    ("POST", f"/api/matches/generate-final?tournament_id={DUMMY_ID}", None),
    ("POST", f"/api/matches/{DUMMY_ID}/events", {"type": "goal", "team_id": DUMMY_ID, "player_id": DUMMY_ID, "minute": 1}),
    ("DELETE", f"/api/matches/{DUMMY_ID}/events/{DUMMY_ID}", None),
    ("PUT", f"/api/matches/{DUMMY_ID}/lineup", {"player_ids": []}),
]

# (method, path) for every public GET endpoint — must never require auth.
PUBLIC_GET_ENDPOINTS = [
    ("GET", "/api/teams"),
    ("GET", f"/api/teams/{DUMMY_ID}"),
    ("GET", "/api/groups"),
    ("GET", "/api/players"),
    ("GET", f"/api/players/{DUMMY_ID}"),
    ("GET", "/api/matches"),
    ("GET", "/api/matches/upcoming"),
    ("GET", "/api/matches/live"),
    ("GET", "/api/matches/completed"),
    ("GET", f"/api/matches/{DUMMY_ID}"),
    ("GET", f"/api/matches/{DUMMY_ID}/events"),
    ("GET", f"/api/matches/{DUMMY_ID}/lineup"),
    ("GET", "/api/standings"),
    ("GET", f"/api/standings/{DUMMY_ID}"),
    ("GET", "/api/statistics/leaderboards"),
    ("GET", "/health"),
    ("GET", "/health/db"),
]


@pytest.mark.parametrize("method,path,body", MUTATING_ENDPOINTS)
async def test_mutating_endpoint_rejects_missing_token(async_client, method, path, body):
    response = await async_client.request(method, path, json=body)
    assert response.status_code == 401, f"{method} {path} did not reject a missing token"


@pytest.mark.parametrize("method,path,body", MUTATING_ENDPOINTS)
async def test_mutating_endpoint_rejects_garbage_token(async_client, method, path, body):
    headers = {"Authorization": "Bearer not-a-real-token"}
    response = await async_client.request(method, path, json=body, headers=headers)
    assert response.status_code == 401, f"{method} {path} did not reject a garbage token"


async def test_mutating_endpoint_rejects_token_for_a_deleted_admin(async_client, admin, admin_token):
    await admin.delete()
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = await async_client.post("/api/matches/generate-semis", headers=headers)
    assert response.status_code == 401


@pytest.mark.parametrize("method,path", PUBLIC_GET_ENDPOINTS)
async def test_public_get_endpoint_never_requires_auth(async_client, method, path):
    response = await async_client.request(method, path)
    # Not "== 200": with an empty test DB and a dummy id, several of these
    # correctly 404. The only thing under test here is that the absence of
    # a token is never itself the reason for failure.
    assert response.status_code != 401, f"{method} {path} incorrectly required auth"


async def test_login_rejects_wrong_password(async_client, admin):
    response = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "wrong-password"}
    )
    assert response.status_code == 401


async def test_login_succeeds_with_correct_credentials(async_client, admin):
    response = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body and body["token_type"] == "bearer"


async def test_me_requires_auth_but_get_endpoints_generally_dont(async_client, auth_headers):
    """GET /auth/me is the one deliberate exception to 'every GET is
    public' — it's the 'who am I' endpoint and must require a valid token."""
    unauthenticated = await async_client.get("/api/auth/me")
    assert unauthenticated.status_code == 401

    authenticated = await async_client.get("/api/auth/me", headers=auth_headers)
    assert authenticated.status_code == 200


async def test_valid_token_is_accepted_on_a_real_mutating_action(async_client, auth_headers, tournament):
    """Positive-path sanity check alongside all the negative-path tests
    above — a genuinely valid token must not be rejected."""
    response = await async_client.get(f"/api/tournaments/{tournament.id}", headers=auth_headers)
    assert response.status_code == 200
    response = await async_client.patch(
        f"/api/organizer/tournaments/{tournament.id}", json={"name": "Renamed"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
