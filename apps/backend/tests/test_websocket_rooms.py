import pytest
from unittest.mock import AsyncMock, MagicMock
from beanie import PydanticObjectId
from httpx import AsyncClient

from app.core.security import create_access_token, hash_password
from app.core.websocket import ConnectionManager
from app.models import (
    Match,
    MatchEvent,
    MatchLineup,
    Player,
    Team,
    Tournament,
    User,
    UserRole,
)


@pytest.mark.asyncio
async def test_connection_manager_room_partitioning_and_isolation():
    manager = ConnectionManager()

    # Mock WebSockets
    ws_t1 = MagicMock()
    ws_t1.accept = AsyncMock()
    ws_t1.send_json = AsyncMock()

    ws_t2 = MagicMock()
    ws_t2.accept = AsyncMock()
    ws_t2.send_json = AsyncMock()

    ws_global = MagicMock()
    ws_global.accept = AsyncMock()
    ws_global.send_json = AsyncMock()

    # Connect to respective rooms
    await manager.connect(ws_t1, tournament_id="tourney_1")
    await manager.connect(ws_t2, tournament_id="tourney_2")
    await manager.connect(ws_global, tournament_id=None)

    assert manager.active_count == 3
    assert manager.room_count("tourney_1") == 1
    assert manager.room_count("tourney_2") == 1
    assert manager.room_count("global") == 1

    # Broadcast to tourney_1
    msg1 = {"type": "match_status_changed", "match_id": "m1"}
    await manager.broadcast_to_tournament("tourney_1", msg1)

    # Only the room receives it: neither the other tournament nor the global/hub room (audit H1)
    assert ws_t1.send_json.call_count == 1
    assert ws_global.send_json.call_count == 0
    assert ws_t2.send_json.call_count == 0

    assert ws_t1.send_json.call_args[0][0]["tournament_id"] == "tourney_1"

    # Broadcast to tourney_2
    msg2 = {"type": "match_event_added", "match_id": "m2"}
    await manager.broadcast_to_tournament("tourney_2", msg2)

    # ws_t2 receives msg2; ws_t1 must not; the hub only gets what is explicitly mirrored to it
    assert ws_t1.send_json.call_count == 1  # Unchanged
    assert ws_t2.send_json.call_count == 1  # Received msg2
    assert ws_global.send_json.call_count == 0

    await manager.broadcast_to_tournament("tourney_2", {"type": "match_status_changed"}, include_global=True)
    assert ws_global.send_json.call_count == 1
    assert ws_t1.send_json.call_count == 1

    # Disconnect ws_t1
    await manager.disconnect(ws_t1)
    assert manager.active_count == 2
    assert manager.room_count("tourney_1") == 0


@pytest.mark.asyncio
async def test_connection_manager_dynamic_subscribe_and_unsubscribe():
    manager = ConnectionManager()

    ws = MagicMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()

    # Connect with global room
    await manager.connect(ws, tournament_id=None)
    assert manager.room_count("global") == 1
    assert manager.room_count("tourney_abc") == 0

    # Dynamically subscribe to tourney_abc
    await manager.subscribe_room(ws, "tourney_abc")
    assert manager.room_count("tourney_abc") == 1

    # Unsubscribe from tourney_abc
    await manager.unsubscribe_room(ws, "tourney_abc")
    assert manager.room_count("tourney_abc") == 0

    # Disconnect
    await manager.disconnect(ws)
    assert manager.active_count == 0


@pytest.mark.asyncio
async def test_websocket_endpoint_ping_and_subscription_protocol(async_client: AsyncClient):
    # Tests the /ws/live endpoint via TestClient/httpx WebSocket if supported or tests ConnectionManager handler
    manager = ConnectionManager()
    ws_broken = MagicMock()
    ws_broken.accept = AsyncMock()
    ws_broken.send_json = AsyncMock(side_effect=RuntimeError("Broken pipe"))

    await manager.connect(ws_broken, tournament_id="tourney_fail")
    assert manager.room_count("tourney_fail") == 1

    # Broadcaster should catch error and safely prune the broken socket
    await manager.broadcast_to_tournament("tourney_fail", {"type": "test"})
    assert manager.room_count("tourney_fail") == 0
    assert manager.active_count == 0


@pytest.mark.asyncio
async def test_scorer_assigned_matches_filtering_and_enrichment(async_client: AsyncClient):
    # Setup test tournaments and users
    organizer = User(
        username="org_owner",
        password_hash=hash_password("Pass123!"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await organizer.insert()

    t1 = Tournament(name="Champions League", season="2026", slug="ucl", organizer_id=organizer.id)
    await t1.insert()

    t2 = Tournament(name="Europa League", season="2026", slug="uel", organizer_id=organizer.id)
    await t2.insert()

    scorer1 = User(
        username="scorer_one",
        password_hash=hash_password("Pass123!"),
        role=UserRole.SCORER,
        is_active=True,
    )
    await scorer1.insert()

    scorer2 = User(
        username="scorer_two",
        password_hash=hash_password("Pass123!"),
        role=UserRole.SCORER,
        is_active=True,
    )
    await scorer2.insert()

    # Teams with crests
    team1 = Team(name="Real Madrid", tournament_id=t1.id, color="#FFFFFF", crest_url="https://r2.cdn/real.png")
    await team1.insert()
    team2 = Team(name="Bayern Munich", tournament_id=t1.id, color="#DC052D", logo_url="https://r2.cdn/bayern.png")
    await team2.insert()

    # Match 1 in T1 assigned to scorer1
    m1 = Match(
        tournament_id=t1.id,
        match_number=101,
        team1_id=team1.id,
        team2_id=team2.id,
        stage="extra",
        assigned_scorer_ids=[scorer1.id],
    )
    await m1.insert()

    # Match 2 in T2 assigned to scorer2
    m2 = Match(
        tournament_id=t2.id,
        match_number=102,
        team1_id=team1.id,
        team2_id=team2.id,
        stage="extra",
        assigned_scorer_ids=[scorer2.id],
    )
    await m2.insert()

    # 1. Scorer 1 fetches /api/scorer/matches -> only gets m1 with enriched crests and tournament details
    token1, _ = create_access_token(str(scorer1.id))
    res1 = await async_client.get("/api/scorer/matches", headers={"Authorization": f"Bearer {token1}"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1) == 1
    assert data1[0]["id"] == str(m1.id)
    assert data1[0]["team1_crest_url"] == "https://r2.cdn/real.png"
    assert data1[0]["team2_crest_url"] == "https://r2.cdn/bayern.png"
    assert data1[0]["tournament_name"] == "Champions League"
    assert data1[0]["tournament_slug"] == "ucl"

    # 2. Scorer 2 fetches /api/scorer/matches -> only gets m2
    token2, _ = create_access_token(str(scorer2.id))
    res2 = await async_client.get("/api/scorer/matches", headers={"Authorization": f"Bearer {token2}"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2) == 1
    assert data2[0]["id"] == str(m2.id)
    assert data2[0]["tournament_name"] == "Europa League"
    assert data2[0]["tournament_slug"] == "uel"

    # 3. Unauthenticated -> 401
    res_unauth = await async_client.get("/api/scorer/matches")
    assert res_unauth.status_code == 401


@pytest.mark.asyncio
async def test_strict_live_match_mutation_lock_matrix_403_forbidden(async_client: AsyncClient):
    """Verifies that an unassigned SCORER receives 403 Forbidden across all 12 live mutation endpoints."""
    # Setup
    org = User(username="org_test", password_hash=hash_password("P!"), role=UserRole.ORGANIZER, is_active=True)
    await org.insert()
    foreign_org = User(username="org_foreign", password_hash=hash_password("P!"), role=UserRole.ORGANIZER, is_active=True)
    await foreign_org.insert()

    t = Tournament(name="Test Cup", season="2026", organizer_id=org.id)
    await t.insert()

    scorer_assigned = User(username="scorer_ok", password_hash=hash_password("P!"), role=UserRole.SCORER, is_active=True)
    await scorer_assigned.insert()
    scorer_unassigned = User(username="scorer_blocked", password_hash=hash_password("P!"), role=UserRole.SCORER, is_active=True)
    await scorer_unassigned.insert()

    team_a = Team(name="Team A", tournament_id=t.id, color="#111111")
    await team_a.insert()
    team_b = Team(name="Team B", tournament_id=t.id, color="#222222")
    await team_b.insert()

    player_a = Player(team_id=team_a.id, name="Striker", number=9, dcl_id="P-01")
    await player_a.insert()

    match = Match(
        tournament_id=t.id,
        match_number=201,
        team1_id=team_a.id,
        team2_id=team_b.id,
        stage="extra",
        status="live",
        assigned_scorer_ids=[scorer_assigned.id],
    )
    await match.insert()

    event = MatchEvent(
        match_id=match.id,
        team_id=team_a.id,
        player_id=player_a.id,
        type="goal",
        minute=10,
    )
    await event.insert()

    token_blocked, _ = create_access_token(str(scorer_unassigned.id))
    headers_blocked = {"Authorization": f"Bearer {token_blocked}"}

    mid = str(match.id)
    eid = str(event.id)

    # 1. POST /{id}/start
    r1 = await async_client.post(f"/api/matches/{mid}/start", headers=headers_blocked)
    assert r1.status_code == 403
    assert "not assigned" in r1.json()["detail"].lower()

    # 2. POST /{id}/end
    r2 = await async_client.post(f"/api/matches/{mid}/end", headers=headers_blocked)
    assert r2.status_code == 403

    # 3. POST /{id}/reopen
    r3 = await async_client.post(f"/api/matches/{mid}/reopen", headers=headers_blocked)
    assert r3.status_code == 403

    # 4. POST /{id}/half-time
    r4 = await async_client.post(f"/api/matches/{mid}/half-time", headers=headers_blocked, json={"elapsed_seconds": 1200})
    assert r4.status_code == 403

    # 5. POST /{id}/resume
    r5 = await async_client.post(f"/api/matches/{mid}/resume", headers=headers_blocked)
    assert r5.status_code == 403

    # 6. POST /{id}/reset-timer
    r6 = await async_client.post(f"/api/matches/{mid}/reset-timer", headers=headers_blocked)
    assert r6.status_code == 403

    # 7. POST /{id}/cancel
    r7 = await async_client.post(f"/api/matches/{mid}/cancel", headers=headers_blocked)
    assert r7.status_code == 403

    # 8. POST /{id}/uncancel
    r8 = await async_client.post(f"/api/matches/{mid}/uncancel", headers=headers_blocked)
    assert r8.status_code == 403

    # 9. POST /{id}/winner
    r9 = await async_client.post(f"/api/matches/{mid}/winner", headers=headers_blocked, json={"team_id": str(team_a.id)})
    assert r9.status_code == 403

    # 10. POST /{id}/events
    r10 = await async_client.post(
        f"/api/matches/{mid}/events",
        headers=headers_blocked,
        json={"team_id": str(team_a.id), "player_id": str(player_a.id), "type": "goal", "minute": 15},
    )
    assert r10.status_code == 403

    # 11. DELETE /{id}/events/{event_id}
    r11 = await async_client.delete(f"/api/matches/{mid}/events/{eid}", headers=headers_blocked)
    assert r11.status_code == 403

    # 12. PUT /{id}/lineup
    r12 = await async_client.put(f"/api/matches/{mid}/lineup", headers=headers_blocked, json={"player_ids": [str(player_a.id)]})
    assert r12.status_code == 403

    # 13. Foreign Organizer also receives 403 Forbidden ("You do not own this tournament")
    token_foreign_org, _ = create_access_token(str(foreign_org.id))
    r_foreign = await async_client.post(f"/api/matches/{mid}/half-time", headers={"Authorization": f"Bearer {token_foreign_org}"})
    assert r_foreign.status_code == 403
    assert "not own this tournament" in r_foreign.json()["detail"].lower()

    # 14. Assigned Scorer is authorized
    token_ok, _ = create_access_token(str(scorer_assigned.id))
    r_ok = await async_client.post(
        f"/api/matches/{mid}/half-time",
        headers={"Authorization": f"Bearer {token_ok}"},
        json={"elapsed_seconds": 1500},
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["is_half_time"] is True


@pytest.mark.asyncio
async def test_broadcast_helper_mirrors_only_status_changes_to_the_hub():
    from app.core import websocket as ws_module

    manager = ConnectionManager()
    room, hub = MagicMock(), MagicMock()
    for sock in (room, hub):
        sock.accept = AsyncMock()
        sock.send_json = AsyncMock()
    await manager.connect(room, tournament_id="t1")
    await manager.connect(hub, tournament_id=None)

    await manager.broadcast({"type": "match_event_added", "tournament_id": "t1"})
    assert room.send_json.call_count == 1 and hub.send_json.call_count == 0

    await manager.broadcast({"type": "match_status_changed", "tournament_id": "t1"})
    assert room.send_json.call_count == 2 and hub.send_json.call_count == 1
    assert "match_status_changed" in ws_module.HUB_MESSAGE_TYPES


@pytest.mark.asyncio
async def test_broadcast_is_concurrent_and_a_stalled_client_is_dropped(monkeypatch):
    import asyncio
    import time

    from app.core import websocket as ws_module

    monkeypatch.setattr(ws_module, "SEND_TIMEOUT_SECONDS", 0.2)
    manager = ConnectionManager()

    async def stall(_msg):
        await asyncio.sleep(5)

    slow = MagicMock()
    slow.accept = AsyncMock()
    slow.send_json = stall
    fast = MagicMock()
    fast.accept = AsyncMock()
    fast.send_json = AsyncMock()
    await manager.connect(slow, tournament_id="t1")
    await manager.connect(fast, tournament_id="t1")

    started = time.monotonic()
    await manager.broadcast_to_tournament("t1", {"type": "x"})
    assert time.monotonic() - started < 1.0  # bounded by the timeout, not by the stalled client
    assert fast.send_json.call_count == 1
    assert manager.room_count("t1") == 1  # the stalled client was dropped


@pytest.mark.asyncio
async def test_a_client_cannot_join_unbounded_rooms():
    from app.core.websocket import MAX_ROOMS_PER_CLIENT

    manager = ConnectionManager()
    sock = MagicMock()
    sock.accept = AsyncMock()
    await manager.connect(sock, tournament_id=None)
    for i in range(MAX_ROOMS_PER_CLIENT + 10):
        await manager.subscribe_room(sock, f"room{i}")
    assert len(manager._client_rooms[sock]) == MAX_ROOMS_PER_CLIENT


def test_websocket_endpoint_rejects_malformed_room_ids():
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import app

    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/live?tournament_id=not-an-object-id"):
            pass


# ---- Phase 7: handshake Origin check -----------------------------------------------------------

def _ws_settings(monkeypatch, **overrides):
    from app.core.config import Settings
    import app.routers.websocket as ws_router

    defaults = dict(environment="production", cors_origins="https://app.example.com,https://www.example.com")
    defaults.update(overrides)
    monkeypatch.setattr(ws_router, "get_settings", lambda: Settings(**defaults))


def test_origin_check_is_off_outside_production(monkeypatch):
    from app.routers.websocket import origin_allowed

    _ws_settings(monkeypatch, environment="development")
    assert origin_allowed("https://evil.example.net") is True


def test_origin_check_in_production(monkeypatch):
    from app.routers.websocket import origin_allowed

    _ws_settings(monkeypatch)
    assert origin_allowed("https://app.example.com") is True
    assert origin_allowed("https://www.example.com/") is True  # trailing slash tolerated
    assert origin_allowed("https://evil.example.net") is False
    assert origin_allowed("http://app.example.com") is False  # scheme matters
    assert origin_allowed("https://app.example.com.evil.net") is False  # no prefix tricks
    assert origin_allowed("null") is False
    assert origin_allowed(None) is True  # not a browser (probes, scripts): cannot be driven by another site


def test_websocket_handshake_from_a_foreign_origin_is_refused_in_production(monkeypatch):
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import app

    _ws_settings(monkeypatch)
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/live", headers={"origin": "https://evil.example.net"}):
            pass
    with client.websocket_connect("/ws/live", headers={"origin": "https://app.example.com"}) as ok:
        ok.send_text("ping")
        assert ok.receive_text() == "pong"

