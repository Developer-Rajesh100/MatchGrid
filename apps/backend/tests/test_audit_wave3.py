"""Regression tests for audit Wave 3 (docs/Audit.md: M1, M4, M5, M8, M9, L7, L8)."""

import io
from datetime import datetime, timezone

import pytest
from PIL import Image

from app.core.security import create_access_token, hash_password
from app.models import Group, GroupTeam, Match, Player, Team, Tournament, User, UserRole
from app.services.matches import cancel_match, start_match, uncancel_match
from app.services.tournament_stage import refresh_tournament_stage


def _h(user):
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


async def _user(name, role, **kw):
    u = User(username=name, password_hash=hash_password("pass12345"), role=role, is_active=True, **kw)
    await u.insert()
    return u


async def _cup(slug="w3", owner=None, **kw):
    t = Tournament(name=slug.title(), season="1", slug=slug, organizer_id=owner.id if owner else None, **kw)
    await t.insert()
    return t


async def _team(t, name):
    team = Team(tournament_id=t.id, name=name, color="#112233")
    await team.insert()
    return team


# --------------------------------------------------------------------------- M1


@pytest.mark.parametrize(
    "path",
    [
        "/api/matches",
        "/api/matches/upcoming",
        "/api/matches/live",
        "/api/matches/completed",
        "/api/matches/bracket",
        "/api/teams",
        "/api/groups",
        "/api/players",
        "/api/standings",
        "/api/statistics/leaderboards",
    ],
)
async def test_m1_public_lists_require_a_tournament(async_client, tournament, path):
    r = await async_client.get(path)
    assert r.status_code == 422
    assert "tournament_id or tournament_slug" in r.json()["detail"]
    # ...and work as soon as one is named, by id or by slug
    tournament.slug = "named-cup"
    await tournament.save()
    assert (await async_client.get(path, params={"tournament_id": str(tournament.id)})).status_code == 200
    assert (await async_client.get(path, params={"tournament_slug": "named-cup"})).status_code == 200


async def test_m1_unknown_tournament_is_404_and_the_singleton_read_is_gone(async_client, tournament):
    assert (await async_client.get("/api/matches", params={"tournament_slug": "nope"})).status_code == 404
    assert (await async_client.get("/api/matches", params={"tournament_id": "f" * 24})).status_code == 404
    assert (await async_client.get("/api/tournament")).status_code in (404, 405, 422)


async def test_m1_two_tournaments_never_bleed_into_each_other(async_client, clean_db):
    t1, t2 = await _cup("one"), await _cup("two")
    await _team(t1, "Only In One")
    await _team(t2, "Only In Two")
    names1 = [t["name"] for t in (await async_client.get("/api/teams", params={"tournament_slug": "one"})).json()]
    names2 = [t["name"] for t in (await async_client.get("/api/teams", params={"tournament_slug": "two"})).json()]
    assert names1 == ["Only In One"] and names2 == ["Only In Two"]


# --------------------------------------------------------------------------- M4


async def test_m4_status_is_a_lowercase_enum_and_legacy_values_normalize(clean_db):
    t = Tournament(name="Legacy", season="1", status="ACTIVE")
    assert t.status == "active"
    assert Tournament(name="x", season="1", status="").status == "active"
    assert Tournament(name="x", season="1", status="Draft").status == "draft"
    with pytest.raises(ValueError):
        Tournament(name="x", season="1", status="whenever")


async def test_m4_patching_an_invalid_status_is_rejected(async_client, clean_db):
    org = await _user("org", UserRole.ORGANIZER)
    t = await _cup("statuses", org)
    r = await async_client.patch(f"/api/organizer/tournaments/{t.id}", json={"status": "COMPLETEDISH"}, headers=_h(org))
    assert r.status_code == 422
    r = await async_client.patch(f"/api/organizer/tournaments/{t.id}", json={"status": "draft"}, headers=_h(org))
    assert r.status_code == 200 and r.json()["status"] == "draft"


async def test_m4_champion_completes_the_tournament_and_reopening_reactivates_it(clean_db):
    t = await _cup("lifecycle")
    final = Match(tournament_id=t.id, match_number=1, stage="final", bracket_slot="FINAL", status="full_time")
    team_a, team_b = await _team(t, "A"), await _team(t, "B")
    final.team1_id, final.team2_id, final.winner_override_id = team_a.id, team_b.id, team_a.id
    await final.insert()

    await refresh_tournament_stage(t.id)
    done = await Tournament.get(t.id)
    assert (done.stage, done.status) == ("champions", "completed")

    final.status = "live"
    await final.save()
    await refresh_tournament_stage(t.id)
    again = await Tournament.get(t.id)
    assert (again.stage, again.status) == ("final", "active")

    # a draft stays a draft: only the organizer moves it out
    again.status = "draft"
    await again.save()
    await refresh_tournament_stage(t.id)
    assert (await Tournament.get(t.id)).status == "draft"


async def test_m4_migration_normalizes_stored_statuses(clean_db):
    from app.core.config import get_settings
    from app.core.database import get_client
    from app.migrations import m0009_tournament_status_enum

    raw = get_client()[get_settings().mongo_db_name]["tournaments"]
    rows = [
        {"name": "a", "season": "1", "status": "ACTIVE", "stage": "group"},
        {"name": "b", "season": "1", "stage": "group"},
        {"name": "c", "season": "1", "status": "ACTIVE", "stage": "champions"},
        {"name": "d", "season": "1", "status": "draft", "stage": "group"},
    ]
    for row in rows:
        await raw.insert_one(row)
    await m0009_tournament_status_enum.up()
    got = {d["name"]: d["status"] async for d in raw.find({})}
    assert got == {"a": "active", "b": "active", "c": "completed", "d": "draft"}


# --------------------------------------------------------------------------- M5


async def test_m5_public_match_payloads_never_carry_scorer_ids(async_client, clean_db):
    org = await _user("org", UserRole.ORGANIZER)
    scorer = await _user("sc", UserRole.SCORER, created_by=org.id)
    t = await _cup("privacy", org)
    a, b = await _team(t, "A"), await _team(t, "B")
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id,
              assigned_scorer_ids=[scorer.id])
    await m.insert()

    listed = (await async_client.get("/api/matches", params={"tournament_id": str(t.id)})).json()
    detail = (await async_client.get(f"/api/matches/{m.id}")).json()
    assert "assigned_scorer_ids" not in listed[0] and "assigned_scorer_ids" not in detail
    assert str(scorer.id) not in (await async_client.get(f"/api/matches/live?tournament_id={t.id}")).text

    # a mutation response (start) is not a scorer-id channel either
    started = await async_client.post(f"/api/matches/{m.id}/start", headers=_h(scorer))
    assert started.status_code == 200 and "assigned_scorer_ids" not in started.json()


async def test_m5_staff_endpoints_still_show_assignments(async_client, clean_db):
    org, other = await _user("org", UserRole.ORGANIZER), await _user("other", UserRole.ORGANIZER)
    scorer = await _user("sc", UserRole.SCORER, created_by=org.id)
    t = await _cup("staff", org)
    m = Match(tournament_id=t.id, match_number=1, stage="extra", assigned_scorer_ids=[scorer.id])
    await m.insert()

    mine = await async_client.get(f"/api/organizer/tournaments/{t.id}/matches", headers=_h(org))
    assert mine.status_code == 200 and mine.json()[0]["assigned_scorer_ids"] == [str(scorer.id)]
    assert (await async_client.get(f"/api/organizer/tournaments/{t.id}/matches", headers=_h(other))).status_code == 403
    assert (await async_client.get(f"/api/organizer/tournaments/{t.id}/matches")).status_code == 401

    assert (await async_client.get("/api/scorer/matches", headers=_h(scorer))).json()[0]["assigned_scorer_ids"] == [str(scorer.id)]
    assigned = await async_client.post(
        f"/api/organizer/matches/{m.id}/scorers", json={"scorer_id": str(scorer.id)}, headers=_h(org)
    )
    assert assigned.status_code == 200 and assigned.json()["assigned_scorer_ids"] == [str(scorer.id)]


async def test_m5_public_tournament_directory_hides_login_usernames(async_client, clean_db):
    org = await _user("secret_login_name", UserRole.ORGANIZER, organization_name="Acme Football")
    await _cup("dir", org)
    solo = await _user("another_login", UserRole.ORGANIZER)  # no organization name
    await _cup("dir2", solo)
    res = await async_client.get("/api/tournaments/public")
    assert "secret_login_name" not in res.text and "another_login" not in res.text
    by_slug = {t["slug"]: t for t in res.json()}
    assert by_slug["dir"]["organizer_name"] == "Acme Football"
    assert by_slug["dir2"]["organizer_name"] is None


async def test_m5_tournament_detail_reports_live_matches(async_client, clean_db):
    t = await _cup("livecount")
    a, b = await _team(t, "A"), await _team(t, "B")
    await Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id, status="live").insert()
    assert (await async_client.get("/api/tournaments/slug/livecount")).json()["live_matches_count"] == 1
    assert (await async_client.get(f"/api/tournaments/{t.id}")).json()["live_matches_count"] == 1


# --------------------------------------------------------------------------- M8


def _png(size=64) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (size, size), (10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


async def _uploader(clean_db):
    from app.services.storage import get_storage_service

    org = await _user("uploader", UserRole.ORGANIZER)
    t = await _cup("uploads", org)
    storage = get_storage_service()
    saved = {n: getattr(storage.settings, n) for n in ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket_name", "r2_public_base_url")}
    storage.settings.r2_account_id = "acc"
    storage.settings.r2_access_key_id = "k"
    storage.settings.r2_secret_access_key = "s"
    storage.settings.r2_bucket_name = "b"
    storage.settings.r2_public_base_url = "https://cdn.test"
    from unittest.mock import MagicMock

    storage._s3_client = MagicMock()
    return org, t, storage, saved


async def test_m8_oversized_upload_is_rejected_while_streaming(async_client, clean_db):
    org, t, storage, saved = await _uploader(clean_db)
    try:
        from app.services.storage import MAX_FILE_SIZE

        huge = _png() + b"\0" * (MAX_FILE_SIZE + 10)
        r = await async_client.post(
            "/api/uploads/image",
            headers=_h(org),
            data={"tournament_id": str(t.id), "category": "crests"},
            files={"file": ("big.png", huge, "image/png")},
        )
        assert r.status_code == 413
        assert storage._s3_client.put_object.call_count == 0
    finally:
        for n, v in saved.items():
            setattr(storage.settings, n, v)
        storage._s3_client = None


async def test_m8_truncated_image_fails_the_integrity_check(async_client, clean_db):
    org, t, storage, saved = await _uploader(clean_db)
    try:
        good = _png(128)
        r = await async_client.post(
            "/api/uploads/image",
            headers=_h(org),
            data={"tournament_id": str(t.id), "category": "crests"},
            files={"file": ("cut.png", good[: len(good) // 2], "image/png")},
        )
        assert r.status_code == 422
        assert storage._s3_client.put_object.call_count == 0
        ok = await async_client.post(
            "/api/uploads/image",
            headers=_h(org),
            data={"tournament_id": str(t.id), "category": "crests"},
            files={"file": ("ok.png", good, "image/png")},
        )
        assert ok.status_code == 201
    finally:
        for n, v in saved.items():
            setattr(storage.settings, n, v)
        storage._s3_client = None


async def test_m8_hsts_is_sent_in_production_only(async_client, monkeypatch):
    import app.main as main_module

    monkeypatch.setattr(main_module, "is_production", False)
    assert "strict-transport-security" not in (await async_client.get("/health")).headers
    monkeypatch.setattr(main_module, "is_production", True)
    assert "max-age" in (await async_client.get("/health")).headers["strict-transport-security"]


# --------------------------------------------------------------------------- M9


async def test_m9_team_listing_counts_players_in_one_pass(async_client, clean_db):
    t1, t2 = await _cup("count-one"), await _cup("count-two")
    g = Group(tournament_id=t1.id, name="A")
    await g.insert()
    big, small, empty = await _team(t1, "Big"), await _team(t1, "Small"), await _team(t1, "Empty")
    foreign = await _team(t2, "Foreign")
    for team, n in ((big, 3), (small, 1), (foreign, 5)):
        for i in range(n):
            await Player(tournament_id=team.tournament_id, team_id=team.id, name=f"P{i}", number=i, dcl_id=f"{team.name}-{i}").insert()
    await GroupTeam(tournament_id=t1.id, group_id=g.id, team_id=big.id).insert()

    rows = {r["name"]: r for r in (await async_client.get("/api/teams", params={"tournament_id": str(t1.id)})).json()}
    assert {n: r["player_count"] for n, r in rows.items()} == {"Big": 3, "Small": 1, "Empty": 0}
    assert rows["Big"]["group_name"] == "A" and rows["Small"]["group_name"] is None


async def test_m9_match_detail_lists_only_its_own_teams_players(async_client, clean_db):
    t = await _cup("detail")
    a, b, c = await _team(t, "A"), await _team(t, "B"), await _team(t, "C")
    pa = Player(tournament_id=t.id, team_id=a.id, name="Alice", number=1, dcl_id="D1")
    await pa.insert()
    await Player(tournament_id=t.id, team_id=c.id, name="Carol", number=1, dcl_id="D2").insert()
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id, status="live")
    await m.insert()
    org = await _user("o", UserRole.SUPER_ADMIN)
    ev = await async_client.post(
        f"/api/matches/{m.id}/events",
        json={"type": "goal", "team_id": str(a.id), "player_id": str(pa.id), "minute": 4},
        headers=_h(org),
    )
    assert ev.status_code == 201 and ev.json()["player_name"] == "Alice"
    detail = (await async_client.get(f"/api/matches/{m.id}")).json()
    assert detail["events"][0]["player_name"] == "Alice"
    assert (await async_client.get(f"/api/matches/{m.id}/events")).json()[0]["player_name"] == "Alice"


# --------------------------------------------------------------------------- L7 / L8


async def test_l7_unknown_username_still_costs_a_password_hash(monkeypatch):
    from app.services import auth as auth_service

    calls = []
    real = auth_service.verify_password

    def spy(password, hashed):
        calls.append(hashed)
        return real(password, hashed)

    monkeypatch.setattr(auth_service, "verify_password", spy)
    assert await auth_service.authenticate_admin("ghost-user", "whatever-password") is None
    assert len(calls) == 1 and calls[0]  # a real hash was verified even though nobody has that name

    await User(username="slept", password_hash=hash_password("right-pass-1"), role=UserRole.SCORER, is_active=False).insert()
    calls.clear()
    assert await auth_service.authenticate_admin("slept", "right-pass-1") is None  # inactive: refused...
    assert len(calls) == 1  # ...but not before doing the same work


async def test_l8_reset_timer_on_a_match_that_is_not_live_is_a_409(async_client, clean_db):
    admin = await _user("root", UserRole.SUPER_ADMIN)
    t = await _cup("timer")
    a, b = await _team(t, "A"), await _team(t, "B")
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id)
    await m.insert()
    r = await async_client.post(f"/api/matches/{m.id}/reset-timer", headers=_h(admin))
    assert r.status_code == 409
    await start_match(await Match.get(m.id))
    assert (await async_client.post(f"/api/matches/{m.id}/reset-timer", headers=_h(admin))).status_code == 200


async def test_l8_cancel_and_uncancel_touch_updated_at(clean_db):
    t = await _cup("stamps")
    a, b = await _team(t, "A"), await _team(t, "B")
    old = datetime(2020, 1, 1, tzinfo=timezone.utc)
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=a.id, team2_id=b.id, updated_at=old)
    await m.insert()
    cancelled = await cancel_match(await Match.get(m.id))
    assert cancelled.updated_at > old
    cancelled.updated_at = old
    await cancelled.save()
    assert (await uncancel_match(await Match.get(m.id))).updated_at > old
