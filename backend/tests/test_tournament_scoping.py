"""Regression tests for the M-4 / ARCH-1 tournament-scoping fix.

Reproduces the exact class of bug behind the Timer/Half-Time audit's C-2
finding (an orphaned match with a foreign tournament_id was briefly visible
on the live public site) as an automated test: insert a document tagged with
a tournament_id that does NOT match the one real Tournament, and assert it
never appears in any public list endpoint. Before the fix in
app/services/tournament_scope.py, every one of these would have leaked the
foreign document straight into the response.
"""

from beanie import PydanticObjectId

from app.models import Group, Match, Team


async def test_foreign_team_does_not_appear_in_team_listing(async_client, tournament, teams):
    foreign_tournament_id = PydanticObjectId()
    foreign_team = Team(tournament_id=foreign_tournament_id, name="Ghost United", color="#000000")
    await foreign_team.insert()

    resp = await async_client.get("/api/teams")
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()}
    assert "Ghost United" not in names
    assert len(resp.json()) == len(teams)


async def test_foreign_match_does_not_appear_in_match_listing_or_live_endpoint(
    async_client, tournament, groups, teams
):
    foreign_tournament_id = PydanticObjectId()
    foreign_match = Match(
        tournament_id=foreign_tournament_id,
        match_number=1,
        stage="group",
        team1_id=None,
        team2_id=None,
        status="live",
    )
    await foreign_match.insert()

    resp = await async_client.get("/api/matches")
    assert resp.status_code == 200
    assert all(m["id"] != str(foreign_match.id) for m in resp.json())

    live_resp = await async_client.get("/api/matches/live")
    assert live_resp.status_code == 200
    assert live_resp.json() == []


async def test_foreign_player_does_not_appear_in_player_listing(async_client, tournament, teams, players):
    foreign_tournament_id = PydanticObjectId()
    foreign_team = Team(tournament_id=foreign_tournament_id, name="Ghost United", color="#000000")
    await foreign_team.insert()
    from app.models import Player

    foreign_player = Player(team_id=foreign_team.id, dcl_id="GHOST-001", name="Ghost Player", number=99)
    await foreign_player.insert()

    resp = await async_client.get("/api/players")
    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert "Ghost Player" not in names

    # Explicitly asking for that foreign team's roster returns empty, not a leak.
    scoped_resp = await async_client.get("/api/players", params={"team_id": str(foreign_team.id)})
    assert scoped_resp.status_code == 200
    assert scoped_resp.json() == []


async def test_foreign_group_does_not_appear_in_group_or_standings_listing(async_client, tournament, groups, teams):
    foreign_tournament_id = PydanticObjectId()
    foreign_group = Group(tournament_id=foreign_tournament_id, name="Z")
    await foreign_group.insert()

    resp = await async_client.get("/api/groups")
    assert resp.status_code == 200
    names = {g["name"] for g in resp.json()}
    assert "Z" not in names
    assert len(resp.json()) == 2  # still exactly A and B

    standings_resp = await async_client.get("/api/standings")
    assert standings_resp.status_code == 200
    group_names = {g["group_name"] for g in standings_resp.json()}
    assert "Z" not in group_names


# Regression tests for the Dead/Duplicate Code follow-up: routers/tournament.py,
# routers/statistics.py, and routers/groups.py each used to fetch the singleton
# Tournament with their own separately-written copy of the same "find_one, 404
# if missing" logic. Consolidated onto app.services.tournament_scope's shared
# helper — these confirm every call site still behaves correctly afterward.


async def test_tournament_endpoint_still_works_after_consolidating_singleton_fetch(
    async_client, tournament
):
    resp = await async_client.get("/api/tournament")
    assert resp.status_code == 200
    assert resp.json()["id"] == str(tournament.id)
    assert resp.json()["name"] == tournament.name


async def test_leaderboards_endpoint_still_works_after_consolidating_singleton_fetch(
    async_client, tournament, teams, players
):
    resp = await async_client.get("/api/statistics/leaderboards")
    assert resp.status_code == 200
    assert set(resp.json().keys()) == {"top_scorers", "top_assists", "top_potm", "most_appearances"}


async def test_random_draw_endpoint_still_works_after_consolidating_singleton_fetch(
    async_client, tournament, groups, teams, auth_headers
):
    resp = await async_client.post("/api/groups/random-draw", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert {g["name"] for g in body} == {"A", "B"}
    all_team_ids = {t["id"] for g in body for t in g["teams"]}
    assert all_team_ids == {str(t.id) for t in teams.values()}
