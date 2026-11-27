"""Shared pytest fixtures for the backend test suite.

Runs against a disposable database (MONGO_DB_NAME overridden to
matchgrid_test below) — never the dev/real database. Every test gets a
clean set of collections via the autouse `clean_db` fixture. Builder
fixtures (tournament/groups/teams/players/admin) create just enough real
data for the test that needs them, using the actual Beanie models — not
mocks — so these are integration-style tests against a real (test) MongoDB.
"""

import os

os.environ["MONGO_DB_NAME"] = "matchgrid_test"
# Never talk to a real R2 bucket from tests: individual tests opt in with a mocked client.
for _name in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_BASE_URL"):
    os.environ[_name] = ""

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
get_settings.cache_clear()
from app.core.database import close_db, get_client, init_db
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import (
    DOCUMENT_MODELS,
    Group,
    GroupTeam,
    Player,
    Team,
    Tournament,
    User,
    UserRole,
)


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Initializes Beanie against the test database and wipes every
    collection before each test, so tests never see another test's data.

    Resets the global Motor client first: pytest-asyncio gives each test
    function its own event loop by default, but Motor's client binds to
    whichever loop was active when it was created — reusing the module-level
    client across tests (each with a new loop) raises "attached to a
    different loop" errors, so a fresh client is created every test instead.
    """
    await close_db()
    await init_db()
    login_rate_limiter.reset()
    settings = get_settings()
    db = get_client()[settings.mongo_db_name]
    for model in DOCUMENT_MODELS:
        await db[model.Settings.name].delete_many({})
    await db["schema_migrations"].delete_many({})
    yield


@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def tournament(clean_db) -> Tournament:
    t = Tournament(name="Test Tournament", season="T")
    await t.insert()
    return t


@pytest_asyncio.fixture
async def groups(tournament) -> dict[str, Group]:
    a = Group(tournament_id=tournament.id, name="A")
    await a.insert()
    b = Group(tournament_id=tournament.id, name="B")
    await b.insert()
    return {"A": a, "B": b}


async def _make_team(tournament: Tournament, group: Group, name: str, color: str) -> Team:
    team = Team(tournament_id=tournament.id, name=name, color=color)
    await team.insert()
    await GroupTeam(tournament_id=tournament.id, group_id=group.id, team_id=team.id).insert()
    return team


async def _make_player(team: Team, dcl_id: str, name: str, number: int) -> Player:
    player = Player(
        tournament_id=team.tournament_id, team_id=team.id, dcl_id=dcl_id, name=name, number=number
    )
    await player.insert()
    return player


@pytest_asyncio.fixture
async def teams(tournament, groups) -> dict[str, Team]:
    """3 teams in group A, 3 in group B — mirrors the real tournament shape."""
    return {
        "Red Dragons": await _make_team(tournament, groups["A"], "Red Dragons", "#d0483f"),
        "Golden Hawks": await _make_team(tournament, groups["A"], "Golden Hawks", "#d9a71b"),
        "White Lions": await _make_team(tournament, groups["A"], "White Lions", "#c9cdd0"),
        "Black Panthers": await _make_team(tournament, groups["B"], "Black Panthers", "#565b66"),
        "Blue Whales": await _make_team(tournament, groups["B"], "Blue Whales", "#3d8fd6"),
        "Green Alligators": await _make_team(tournament, groups["B"], "Green Alligators", "#3f9958"),
    }


@pytest_asyncio.fixture
async def players(teams) -> dict[str, list[Player]]:
    """A handful of players per team — enough to exercise goals/assists/cards."""
    out: dict[str, list[Player]] = {}
    n = 1
    for team_name, team in teams.items():
        squad = []
        for i, pname in enumerate(["Keeper", "Defender", "Midfielder", "Striker"]):
            squad.append(await _make_player(team, f"DCL-{n:03d}", f"{team_name} {pname}", i + 1))
            n += 1
        out[team_name] = squad
    return out


@pytest_asyncio.fixture
async def admin(clean_db) -> User:
    u = User(
        username="testadmin",
        password_hash=hash_password("testpass123"),
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    await u.insert()
    return u


@pytest_asyncio.fixture
def admin_token(admin) -> str:
    token, _ = create_access_token(str(admin.id))
    return token


@pytest_asyncio.fixture
def auth_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}
