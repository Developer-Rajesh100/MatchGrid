"""The realistic demo seed: idempotent, reset-able, self-consistent, and kept away from real data.

Runs against the isolated test database (never the dev one) with a small tournament count."""

import pytest

from app.core.config import get_settings
from app.core.database import get_client
from app.models import (
    Group,
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
from app.scripts import seed_realistic_demo as demo


@pytest.fixture(autouse=True)
async def _no_leftover_marker(clean_db):
    db = get_client()[get_settings().mongo_db_name]
    await db["demo_seed_state"].delete_many({})
    yield
    await db["demo_seed_state"].delete_many({})


async def _counts():
    return {m.__name__: await m.find_all().count() for m in (User, Tournament, Team, Player, Group, Match, MatchEvent, MatchLineup, PlayerStatistics, TournamentStanding)}


async def test_seed_builds_a_consistent_busy_platform():
    result = await demo.seed_demo(total=10)
    assert result["status"] == "seeded"
    assert result["problems"] == []  # verified against the app's own standings/stage/bracket/stat services

    kinds = result["tournaments"]
    assert sum(kinds.values()) == 10 and all(kinds[k] >= 1 for k in kinds)

    tournaments = await Tournament.find_all().to_list()
    assert {t.status for t in tournaments} == {"completed", "active", "draft"}
    completed = [t for t in tournaments if t.status == "completed"]
    assert completed and all(t.champion_team_id and t.stage == "champions" for t in completed)
    assert {t.stage for t in tournaments if t.status == "active"} >= {"group"}
    assert all(t.slug and t.logo_url.startswith("data:image/svg+xml") for t in tournaments)  # never an R2 URL

    users = await User.find_all().to_list()
    assert sum(u.role == UserRole.ORGANIZER for u in users) == 8
    assert sum(u.role == UserRole.SCORER for u in users) == 20
    assert sum(u.role == UserRole.SUPER_ADMIN for u in users) == 1

    matches = await Match.find_all().to_list()
    by_status = {s: [m for m in matches if m.status == s] for s in ("live", "full_time", "upcoming", "cancelled")}
    assert all(by_status.values()), {k: len(v) for k, v in by_status.items()}
    assert any(m.is_half_time for m in by_status["live"]) and any(not m.is_half_time for m in by_status["live"])
    assert all(m.started_at is not None for m in by_status["live"])
    assert all(m.started_at and m.ended_at and m.ended_at > m.started_at for m in by_status["full_time"])
    assert any(m.stage == "extra" for m in matches)

    # every played or live match has a lineup; every finished one has a player of the match
    for m in by_status["live"] + by_status["full_time"]:
        assert await MatchLineup.find(MatchLineup.match_id == m.id).count() > 0
    for m in by_status["full_time"]:
        assert await MatchEvent.find(MatchEvent.match_id == m.id, MatchEvent.type == "potm").count() == 1
        assert await MatchEvent.find(MatchEvent.match_id == m.id, MatchEvent.minute > 2 * 40).count() == 0
    # shootout deciders: a level knockout match records who went through
    level_knockouts = [m for m in by_status["full_time"] if m.winner_override_id]
    for m in level_knockouts:
        assert m.stage in ("quarter", "semi", "final")

    # squads: one manager per team, unique shirt numbers, per-tournament codes
    for team in await Team.find_all().to_list():
        squad = await Player.find(Player.team_id == team.id).to_list()
        assert sum(p.is_manager for p in squad) == 1
        assert len({p.number for p in squad}) == len(squad)
    for t in tournaments:
        players = await Player.find(Player.tournament_id == t.id).to_list()
        assert len({p.player_code for p in players}) == len(players) == t.player_seq

    # materialized views exist for every group, and leaderboards have data
    assert await TournamentStanding.find_all().count() >= await Group.find_all().count()
    assert await PlayerStatistics.find(PlayerStatistics.goals > 0).count() > 0

    # scorers actually have matches to work on
    assigned = {sid for m in matches for sid in m.assigned_scorer_ids}
    assert len(assigned) >= 10


async def test_seed_is_idempotent_and_reset_rebuilds_without_touching_real_data():
    real_org = User(username="real_organizer", password_hash="x", role=UserRole.ORGANIZER)
    await real_org.insert()
    real = Tournament(name="Real Cup", season="1", slug="real-cup", organizer_id=real_org.id)
    await real.insert()
    real_team = Team(tournament_id=real.id, name="Real FC", color="#112233")
    await real_team.insert()

    first = await demo.seed_demo(total=6)
    assert first["status"] == "seeded"
    after_first = await _counts()

    again = await demo.seed_demo(total=6)
    assert again["status"] == "already-seeded"
    assert await _counts() == after_first  # nothing duplicated

    rebuilt = await demo.seed_demo(total=6, reset=True)
    assert rebuilt["status"] == "seeded" and rebuilt["removed"]["tournaments"] == 6
    assert await _counts() == after_first  # same deterministic structure
    assert rebuilt["problems"] == []

    # real data survived the reset and the seed
    assert await Tournament.get(real.id) is not None
    assert await Team.get(real_team.id) is not None
    assert await User.get(real_org.id) is not None
    assert await Tournament.find(Tournament.slug == "real-cup").count() == 1


async def test_seed_reuses_an_existing_super_admin_and_avoids_slug_clashes():
    from app.core.security import hash_password

    root = User(username="root", password_hash=hash_password("x"), role=UserRole.SUPER_ADMIN)
    await root.insert()
    await Tournament(name="Squatter", season="1", slug="premier-autumn-cup-2025").insert()
    result = await demo.seed_demo(total=4)
    assert result["superadmin"] == "root" and result["superadmin_created_by_seed"] is False
    assert await User.find(User.role == UserRole.SUPER_ADMIN).count() == 1
    slugs = [t.slug for t in await Tournament.find_all().to_list()]
    assert len(slugs) == len(set(slugs))


def test_seed_cli_refuses_the_test_database_and_production(monkeypatch):
    import asyncio

    with pytest.raises(SystemExit, match="test database"):
        asyncio.run(demo.seed(total=3))
    monkeypatch.setattr(get_settings(), "environment", "production")
    with pytest.raises(SystemExit, match="production"):
        asyncio.run(demo.seed(total=3, allow_test_db=True))
