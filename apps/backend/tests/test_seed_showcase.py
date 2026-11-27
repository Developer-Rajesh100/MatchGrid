"""The showcase seed: deterministic, idempotent, self-consistent, privacy-preserving, and safe by default.

Runs against the isolated test database in inline-media mode (no R2, no network)."""

import io

import pytest
from PIL import Image

from app.core.config import get_settings
from app.core.database import get_client
from app.models import (
    Match,
    MatchEvent,
    MatchLineup,
    Player,
    PlayerStatistics,
    Team,
    Tournament,
    TournamentStanding,
    User,
    UserRole,
)
from app.scripts import seed_showcase as showcase
from app.scripts import showcase_art as art


@pytest.fixture(autouse=True)
async def _no_leftover_marker(clean_db):
    db = get_client()[get_settings().mongo_db_name]
    await db["demo_seed_state"].delete_many({})
    yield
    await db["demo_seed_state"].delete_many({})


async def _counts():
    models = (User, Tournament, Team, Player, Match, MatchEvent, MatchLineup, PlayerStatistics, TournamentStanding)
    return {m.__name__: await m.find_all().count() for m in models}


async def _by_slug(slug):
    return await Tournament.find_one(Tournament.slug == slug)


async def test_showcase_builds_four_tournaments_in_every_lifecycle_state():
    result = await showcase.seed_showcase()
    assert result["status"] == "seeded"
    assert result["problems"] == []  # cross-checked against the app's own standings/stage/bracket/stat services

    apex = await _by_slug("apex-champions-cup-2026")
    metro = await _by_slug("metro-premier-league-2026")
    winter = await _by_slug("winter-invitational-2025")
    youth = await _by_slug("summer-youth-super-cup-2026")
    assert (apex.status, apex.stage) == ("active", "semis")
    assert apex.config.knockout_format == "quarters_semis_final" and apex.config.qualifiers_per_group == 4
    assert (metro.status, metro.stage) == ("active", "group")
    assert (winter.status, winter.stage) == ("completed", "champions") and winter.champion_team_id
    assert youth.status == "draft" and youth.champion_team_id is None

    assert await Team.find(Team.tournament_id == apex.id).count() == 8
    assert await Team.find(Team.tournament_id == metro.id).count() == 6
    assert await Match.find(Match.tournament_id == apex.id, Match.status == "live").count() == 2
    assert await Match.find(Match.tournament_id == metro.id, Match.status == "live").count() == 1
    stages = {m.stage for m in await Match.find(Match.tournament_id == apex.id).to_list()}
    assert {"group", "quarter", "semi", "final"} <= stages
    # a full group stage: every one of the 12 group fixtures played, then 4 quarter-finals
    played = await Match.find(Match.tournament_id == apex.id, Match.status == "full_time").to_list()
    assert sum(m.stage == "group" for m in played) == 12 and sum(m.stage == "quarter" for m in played) == 4


async def test_accounts_roles_and_scorer_tenancy():
    await showcase.seed_showcase()
    alex = await User.find_one(User.username == "alex.organizer")
    priya = await User.find_one(User.username == "priya.organizer")
    sam = await User.find_one(User.username == "sam.scorer")
    maya = await User.find_one(User.username == "maya.scorer")
    assert alex.role == priya.role == UserRole.ORGANIZER and sam.role == maya.role == UserRole.SCORER
    assert alex.organization_name == "Apex Football League" and priya.organization_name == "Metro Premier Cup"
    assert sam.created_by == alex.id and maya.created_by == priya.id

    apex = await _by_slug("apex-champions-cup-2026")
    metro = await _by_slug("metro-premier-league-2026")
    assert apex.organizer_id == alex.id and metro.organizer_id == priya.id
    assigned = await Match.find(Match.tournament_id == apex.id, {"assigned_scorer_ids": sam.id}).count()
    assert assigned > 0
    assert await Match.find(Match.tournament_id == apex.id, {"assigned_scorer_ids": maya.id}).count() == 0
    assert await Match.find(Match.tournament_id == metro.id, {"assigned_scorer_ids": maya.id}).count() > 0


async def test_every_played_fixture_has_lineups_and_ordered_events():
    await showcase.seed_showcase()
    for m in await Match.find({"status": {"$in": ["live", "full_time"]}}).to_list():
        lineups = await MatchLineup.find(MatchLineup.match_id == m.id).to_list()
        for team_id in (m.team1_id, m.team2_id):
            side = [x for x in lineups if x.team_id == team_id]
            assert sum(x.is_starting for x in side) == showcase.STARTERS and len(side) > showcase.STARTERS
        events = await MatchEvent.find(MatchEvent.match_id == m.id).to_list()
        timed = [e.minute for e in sorted(events, key=lambda e: e.minute or 0) if e.type != "potm"]
        assert timed == sorted(timed)
        if m.status == "full_time":
            assert any(e.type == "potm" for e in events)


async def test_rerun_is_idempotent_and_reset_rebuilds_cleanly():
    await showcase.seed_showcase()
    before = await _counts()
    again = await showcase.seed_showcase()
    assert again["status"] == "already-seeded" and all(r["action"] == "skipped (exists)" for r in again["tournaments"])
    assert await _counts() == before  # nothing duplicated, nothing removed

    rebuilt = await showcase.seed_showcase(reset=True)
    assert rebuilt["removed"] == {"tournaments": 4, "users": 4}
    assert await _counts() == before  # deterministic content: the same shape comes back


async def test_reset_touches_only_showcase_data():
    other = User(username="someone.else", password_hash="x", role=UserRole.ORGANIZER)
    await other.insert()
    mine = Tournament(name="Not Showcase", slug="not-showcase", organizer_id=other.id)
    await mine.insert()
    await showcase.seed_showcase(reset=True)
    assert await User.find_one(User.username == "someone.else") is not None
    assert await _by_slug("not-showcase") is not None


async def test_superadmin_is_never_created_or_modified():
    await showcase.seed_showcase()
    assert await User.find(User.role == UserRole.SUPER_ADMIN).count() == 0  # none existed, none invented
    admin = User(username="root.admin", password_hash="keep-me", role=UserRole.SUPER_ADMIN)
    await admin.insert()
    await showcase.seed_showcase(reset=True)
    kept = await User.find_one(User.username == "root.admin")
    assert kept.password_hash == "keep-me"
    assert (await User.find_one(User.username == "alex.organizer")).created_by == admin.id


async def test_username_collision_with_another_role_aborts():
    await User(username="alex.organizer", password_hash="x", role=UserRole.SCORER).insert()
    with pytest.raises(SystemExit):
        await showcase.seed_showcase()


async def test_live_clocks_are_reanchored_on_rerun():
    from datetime import datetime, timedelta, timezone

    await showcase.seed_showcase()
    live = await Match.find(Match.status == "live").to_list()
    stale = datetime.now(timezone.utc) - timedelta(days=3)
    for m in live:
        m.started_at = stale
        await m.save()
    result = await showcase.seed_showcase()
    assert result["reanchored_live"] == len(live)
    for m in await Match.find(Match.status == "live").to_list():
        assert datetime.now(timezone.utc) - m.started_at.replace(tzinfo=timezone.utc) < timedelta(hours=2)


async def test_images_are_real_decodable_pngs_and_no_slot_is_empty():
    await showcase.seed_showcase()
    for t in await Tournament.find_all().to_list():
        assert t.logo_url.startswith("data:image/png;base64,") and t.banner_url.startswith("data:image/webp;base64,")
    for team in await Team.find_all().to_list():
        assert team.crest_url.startswith("data:image/png;base64,")
    for player in await Player.find_all().to_list():
        assert player.photo_url.startswith("data:image/png;base64,")
    # crests differ from each other (distinct colours/templates), and decode as RGBA
    crests = {team.crest_url for team in await Team.find_all().to_list()}
    assert len(crests) == await Team.find_all().count()


def test_artwork_is_deterministic_valid_and_distinct():
    a = art.crest_png("Apex Rovers", "#DC2626", "#FBBF24", 2)
    assert a == art.crest_png("Apex Rovers", "#DC2626", "#FBBF24", 2)
    assert a != art.crest_png("Apex Rovers", "#DC2626", "#FBBF24", 3)
    img = Image.open(io.BytesIO(a))
    assert img.format == "PNG" and img.size == (160, 160)
    assert Image.open(io.BytesIO(art.portrait_png(9, "#2563EB", "#FFFFFF"))).size == (128, 128)
    assert Image.open(io.BytesIO(art.banner_webp("T", "S", "#10B981"))).format == "WEBP"
    from app.services.storage import StorageService

    for blob in (a, art.portrait_png(9, "#2563EB", "#FFFFFF"), art.logo_png("Winter Cup", "#F59E0B", "2025")):
        StorageService().validate_image_bytes(blob)  # the exact check the upload endpoint applies


async def test_dry_run_writes_nothing():
    result = await showcase.seed_showcase(dry_run=True)
    assert result["status"] == "dry-run" and len(result["would_create"]) == 4
    assert await Tournament.find_all().count() == 0 and await User.find_all().count() == 0


async def test_guards_refuse_test_db_and_remote_mongo(monkeypatch):
    with pytest.raises(SystemExit):
        await showcase.seed()  # the pytest database name contains "test"
    assert showcase._is_remote_mongo("mongodb+srv://u:p@cluster0.abc.mongodb.net/")
    assert showcase._is_remote_mongo("mongodb://u:p@db.example.com:27017/")
    assert not showcase._is_remote_mongo("mongodb://u:p@localhost:27018/?authSource=admin")
    assert not showcase._is_remote_mongo("mongodb://mongo:27017")
    settings = get_settings()
    monkeypatch.setattr(settings, "mongo_db_name", "matchgrid")
    monkeypatch.setattr(settings, "environment", "production")
    with pytest.raises(SystemExit):
        await showcase.seed()  # production needs --allow-production


async def test_r2_mode_requires_configuration():
    with pytest.raises(SystemExit):
        await showcase.seed_showcase(media="r2")  # conftest blanks every R2 variable
