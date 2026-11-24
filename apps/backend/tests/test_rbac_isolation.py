import pytest
from app.core.security import create_access_token, hash_password
from app.models import Match, Team, Tournament, User, UserRole


def _headers_for(user: User) -> dict[str, str]:
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_anonymous_cannot_access_protected_routes(async_client):
    assert (await async_client.get("/api/superadmin/users")).status_code == 401
    assert (await async_client.get("/api/organizer/tournaments")).status_code == 401
    assert (await async_client.get("/api/scorer/matches")).status_code == 401


@pytest.mark.asyncio
async def test_superadmin_management_and_stats(async_client, admin, auth_headers):
    # List users
    res = await async_client.get("/api/superadmin/users", headers=auth_headers)
    assert res.status_code == 200
    users = res.json()
    assert any(u["username"] == "testadmin" for u in users)

    # Create an organizer
    res = await async_client.post(
        "/api/superadmin/organizers",
        json={
            "username": "organizer_one",
            "password": "password123",
            "email": "org1@example.com",
            "organization_name": "Org One",
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    org1_data = res.json()
    assert org1_data["role"] == "ORGANIZER"
    assert org1_data["organization_name"] == "Org One"

    # Platform stats
    res = await async_client.get("/api/superadmin/stats", headers=auth_headers)
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_organizers"] >= 1


@pytest.mark.asyncio
async def test_organizer_cannot_access_superadmin_routes(async_client, clean_db):
    org_user = User(
        username="org_user",
        password_hash=hash_password("password123"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org_user.insert()
    headers = _headers_for(org_user)

    res = await async_client.get("/api/superadmin/users", headers=headers)
    assert res.status_code == 403

    res = await async_client.post(
        "/api/superadmin/organizers",
        json={"username": "illegal", "password": "password123"},
        headers=headers,
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_organizer_tenant_isolation(async_client, clean_db):
    org1 = User(
        username="org_alpha",
        password_hash=hash_password("pass12345"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org1.insert()
    h1 = _headers_for(org1)

    org2 = User(
        username="org_beta",
        password_hash=hash_password("pass12345"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org2.insert()
    h2 = _headers_for(org2)

    # Org 1 creates Tournament 1
    res1 = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "Tournament Alpha", "season": "2026", "slug": "tourn-alpha"},
        headers=h1,
    )
    assert res1.status_code == 201
    t1_id = res1.json()["id"]

    # Org 2 creates Tournament 2
    res2 = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "Tournament Beta", "season": "2026", "slug": "tourn-beta"},
        headers=h2,
    )
    assert res2.status_code == 201
    t2_id = res2.json()["id"]

    # Org 1 lists only their tournaments
    res = await async_client.get("/api/organizer/tournaments", headers=h1)
    assert res.status_code == 200
    my_tournaments = res.json()
    assert len(my_tournaments) == 1
    assert my_tournaments[0]["id"] == t1_id

    # Org 2 lists only their tournaments
    res = await async_client.get("/api/organizer/tournaments", headers=h2)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["id"] == t2_id


@pytest.mark.asyncio
async def test_scorer_delegation_and_scoping(async_client, clean_db):
    org = User(
        username="org_boss",
        password_hash=hash_password("pass12345"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org.insert()
    org_headers = _headers_for(org)

    # Create tournament
    t = Tournament(name="Scorer Test Cup", season="2026", organizer_id=org.id, slug="scorer-cup")
    await t.insert()

    # Create 2 teams
    team1 = Team(tournament_id=t.id, name="Team Red", color="#ff0000")
    await team1.insert()
    team2 = Team(tournament_id=t.id, name="Team Blue", color="#0000ff")
    await team2.insert()

    # Create 2 matches
    m1 = Match(
        tournament_id=t.id,
        match_number=1,
        stage="extra",
        team1_id=team1.id,
        team2_id=team2.id,
        status="upcoming",
    )
    await m1.insert()
    m2 = Match(
        tournament_id=t.id,
        match_number=2,
        stage="extra",
        team1_id=team1.id,
        team2_id=team2.id,
        status="upcoming",
    )
    await m2.insert()

    # Org creates a scorer
    res = await async_client.post(
        "/api/organizer/scorers",
        json={"username": "match_scorer", "password": "scorerpass123"},
        headers=org_headers,
    )
    assert res.status_code == 201
    scorer_id = res.json()["id"]

    # Org assigns scorer to match 1 only
    res = await async_client.post(
        f"/api/organizer/matches/{m1.id}/scorers",
        json={"scorer_id": scorer_id},
        headers=org_headers,
    )
    assert res.status_code == 200
    assert scorer_id in res.json()["assigned_scorer_ids"]

    # Scorer logs in
    login_res = await async_client.post(
        "/api/auth/login",
        json={"username": "match_scorer", "password": "scorerpass123"},
    )
    assert login_res.status_code == 200
    scorer_token = login_res.json()["access_token"]
    scorer_headers = {"Authorization": f"Bearer {scorer_token}"}

    # Scorer checks assigned matches
    res = await async_client.get("/api/scorer/matches", headers=scorer_headers)
    assert res.status_code == 200
    assigned = res.json()
    assert len(assigned) == 1
    assert assigned[0]["id"] == str(m1.id)

    # Scorer can operate match 1
    res = await async_client.post(f"/api/matches/{m1.id}/start", headers=scorer_headers)
    assert res.status_code == 200, f"Got {res.status_code}: {res.text}"
    assert res.json()["status"] == "live"

    # Scorer is blocked with 403 on unassigned match 2
    res = await async_client.post(f"/api/matches/{m2.id}/start", headers=scorer_headers)
    assert res.status_code == 403

    # Scorer is blocked from organizer routes
    res = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "Forbidden", "season": "2026"},
        headers=scorer_headers,
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_user_deactivation_lock_and_self_deactivation(async_client, admin, auth_headers):
    # Create an organizer to deactivate
    res = await async_client.post(
        "/api/superadmin/organizers",
        json={"username": "to_be_deactivated", "password": "password123"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    target_id = res.json()["id"]

    # Deactivate the organizer
    res = await async_client.patch(
        f"/api/superadmin/users/{target_id}/status",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Deactivated user cannot login
    res = await async_client.post(
        "/api/auth/login",
        json={"username": "to_be_deactivated", "password": "password123"},
    )
    assert res.status_code == 401

    # Superadmin cannot deactivate themselves
    res = await async_client.patch(
        f"/api/superadmin/users/{admin.id}/status",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert res.status_code == 400
