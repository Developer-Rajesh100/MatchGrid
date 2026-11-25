import pytest
from httpx import AsyncClient

from app.core.security import create_access_token, hash_password
from app.models import Group, Match, Player, Team, Tournament, User, UserRole


@pytest.mark.asyncio
async def test_list_public_tournaments_aggregation_and_counts(async_client: AsyncClient):
    """Verifies that GET /api/tournaments/public returns summary cards with aggregated counts,

    organizer details, and champion crests.
    """
    # 1. Setup Organizer
    org = User(
        username="org_public",
        password_hash=hash_password("Pass123!"),
        role=UserRole.ORGANIZER,
        organization_name="UEFA Operations",
        is_active=True,
    )
    await org.insert()

    # 2. Setup Tournaments
    t1 = Tournament(
        name="Champions League 2026",
        season="2026",
        slug="ucl-2026",
        organizer_id=org.id,
        status="ACTIVE",
        format_description="32 teams, 8 groups",
        logo_url="https://r2.cdn/ucl-logo.png",
    )
    await t1.insert()

    # Teams for T1
    team1 = Team(name="Real Madrid", tournament_id=t1.id, color="#FFFFFF", crest_url="https://r2.cdn/real.png")
    await team1.insert()
    team2 = Team(name="Bayern Munich", tournament_id=t1.id, color="#DC052D", logo_url="https://r2.cdn/bayern.png")
    await team2.insert()

    # Matches for T1: 1 Live, 1 Scheduled
    m1 = Match(
        tournament_id=t1.id,
        match_number=1,
        team1_id=team1.id,
        team2_id=team2.id,
        stage="group",
        status="live",
    )
    await m1.insert()
    m2 = Match(
        tournament_id=t1.id,
        match_number=2,
        team1_id=team1.id,
        team2_id=team2.id,
        stage="group",
        status="upcoming",
    )
    await m2.insert()

    # 3. Setup Completed Tournament with Champion
    t2 = Tournament(
        name="Super Cup 2025",
        season="2025",
        slug="usc-2025",
        organizer_id=org.id,
        status="COMPLETED",
        format_description="Single match knockout",
        champion_team_id=team1.id,
    )
    await t2.insert()

    # Fetch /api/tournaments/public
    res = await async_client.get("/api/tournaments/public")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 2

    # Find UCL-2026 summary
    ucl = next((x for x in data if x["slug"] == "ucl-2026"), None)
    assert ucl is not None
    assert ucl["name"] == "Champions League 2026"
    assert ucl["season"] == "2026"
    assert ucl["logo_url"] == "https://r2.cdn/ucl-logo.png"
    assert ucl["organizer_name"] == "UEFA Operations"  # organization name, never the login username
    assert "org_public" not in res.text
    assert ucl["organization_name"] == "UEFA Operations"
    assert ucl["teams_count"] == 2
    assert ucl["matches_count"] == 2
    assert ucl["live_matches_count"] == 1
    assert ucl["status"] == "active"

    # Find USC-2025 summary
    usc = next((x for x in data if x["slug"] == "usc-2025"), None)
    assert usc is not None
    assert usc["status"] == "completed"
    assert usc["champion_team_id"] == str(team1.id)
    assert usc["champion_team_name"] == "Real Madrid"
    assert usc["champion_crest_url"] == "https://r2.cdn/real.png"

    # Also verify alias /api/tournaments and /api/tournament/public
    res_alias1 = await async_client.get("/api/tournaments")
    assert res_alias1.status_code == 200
    res_alias2 = await async_client.get("/api/tournament/public")
    assert res_alias2.status_code == 200


@pytest.mark.asyncio
async def test_get_tournament_by_slug_and_id(async_client: AsyncClient):
    """Verifies fetching tournament by slug or ID with 404 handling."""
    t = Tournament(
        name="La Liga 2026",
        season="2026",
        slug="laliga-2026",
        status="ACTIVE",
    )
    await t.insert()

    # 1. Fetch by slug
    res_slug = await async_client.get("/api/tournaments/slug/laliga-2026")
    assert res_slug.status_code == 200
    assert res_slug.json()["id"] == str(t.id)
    assert res_slug.json()["name"] == "La Liga 2026"

    # 2. Fetch by ID
    res_id = await async_client.get(f"/api/tournaments/{t.id}")
    assert res_id.status_code == 200
    assert res_id.json()["slug"] == "laliga-2026"

    # 3. Unknown slug -> 404
    res_404_slug = await async_client.get("/api/tournaments/slug/non-existent-slug-xyz")
    assert res_404_slug.status_code == 404

    # 4. Unknown id -> 404
    res_404_id = await async_client.get("/api/tournaments/666666666666666666666666")
    assert res_404_id.status_code == 404

    # 5. Invalid id -> 404
    res_invalid = await async_client.get("/api/tournaments/not-an-oid")
    assert res_invalid.status_code == 404


@pytest.mark.asyncio
async def test_public_scoped_queries_matches_standings_teams(async_client: AsyncClient):
    """Verifies that public matches, standings, and teams endpoints filter strictly by tournament_slug or tournament_id."""
    # Tournament A
    t_a = Tournament(name="Cup A", season="2026", slug="cup-a")
    await t_a.insert()
    team_a1 = Team(name="Team A1", tournament_id=t_a.id, color="#111111", crest_url="https://r2.cdn/a1.png")
    await team_a1.insert()
    team_a2 = Team(name="Team A2", tournament_id=t_a.id, color="#222222")
    await team_a2.insert()
    group_a = Group(name="Group A", tournament_id=t_a.id)
    await group_a.insert()
    match_a = Match(
        tournament_id=t_a.id,
        match_number=10,
        team1_id=team_a1.id,
        team2_id=team_a2.id,
        group_id=group_a.id,
        stage="group",
    )
    await match_a.insert()

    # Tournament B
    t_b = Tournament(name="Cup B", season="2026", slug="cup-b")
    await t_b.insert()
    team_b1 = Team(name="Team B1", tournament_id=t_b.id, color="#333333")
    await team_b1.insert()
    team_b2 = Team(name="Team B2", tournament_id=t_b.id, color="#444444")
    await team_b2.insert()
    group_b = Group(name="Group B", tournament_id=t_b.id)
    await group_b.insert()
    match_b = Match(
        tournament_id=t_b.id,
        match_number=20,
        team1_id=team_b1.id,
        team2_id=team_b2.id,
        group_id=group_b.id,
        stage="group",
    )
    await match_b.insert()

    # 1. Matches scoped by slug
    res_matches_a = await async_client.get("/api/matches?tournament_slug=cup-a")
    assert res_matches_a.status_code == 200
    data_m_a = res_matches_a.json()
    assert len(data_m_a) == 1
    assert data_m_a[0]["id"] == str(match_a.id)

    res_matches_b = await async_client.get(f"/api/matches?tournament_id={t_b.id}")
    assert res_matches_b.status_code == 200
    data_m_b = res_matches_b.json()
    assert len(data_m_b) == 1
    assert data_m_b[0]["id"] == str(match_b.id)

    # 2. Teams scoped by slug
    res_teams_a = await async_client.get("/api/teams?tournament_slug=cup-a")
    assert res_teams_a.status_code == 200
    names_a = [tm["name"] for tm in res_teams_a.json()]
    assert "Team A1" in names_a
    assert "Team B1" not in names_a

    res_teams_b = await async_client.get(f"/api/teams?tournament_id={t_b.id}")
    assert res_teams_b.status_code == 200
    names_b = [tm["name"] for tm in res_teams_b.json()]
    assert "Team B1" in names_b
    assert "Team A1" not in names_b

    # 3. Standings scoped by slug
    res_standings_a = await async_client.get("/api/standings?tournament_slug=cup-a")
    assert res_standings_a.status_code == 200
    standings_a = res_standings_a.json()
    assert len(standings_a) == 1
    assert standings_a[0]["group_name"] == "Group A"
