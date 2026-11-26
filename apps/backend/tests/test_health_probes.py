"""Public health probes expose liveness only; document counts are superadmin data."""


async def test_health_is_a_bare_ok(async_client):
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_public_db_probe_reports_status_and_ping_but_no_counts(async_client):
    response = await async_client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "connected"
    assert isinstance(body["ping_ms"], (int, float))
    assert "collections" not in body
    assert set(body) == {"status", "ping_ms"}


async def test_db_stats_requires_a_superadmin(async_client, auth_headers):
    assert (await async_client.get("/api/superadmin/db-stats")).status_code == 401
    ok = await async_client.get("/api/superadmin/db-stats", headers=auth_headers)
    assert ok.status_code == 200
    collections = ok.json()["collections"]
    assert collections["users"] >= 1 and "matches" in collections


async def test_db_stats_refuses_an_organizer(async_client, clean_db):
    from app.core.security import create_access_token, hash_password
    from app.models import User, UserRole

    org = User(username="org_health", password_hash=hash_password("Pw-long-enough-1"), role=UserRole.ORGANIZER, is_active=True)
    await org.insert()
    token, _ = create_access_token(str(org.id))
    response = await async_client.get("/api/superadmin/db-stats", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
