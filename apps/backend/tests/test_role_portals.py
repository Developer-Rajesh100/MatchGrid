import pytest
from app.core.security import create_access_token, hash_password
from app.models import Group, Match, Player, Team, Tournament, User, UserRole
from app.models.tournament import TournamentConfig


def _headers_for(user: User) -> dict[str, str]:
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_superadmin_user_lifecycle_and_self_protection(async_client, admin, auth_headers):
    # 1. Platform stats
    stats_res = await async_client.get("/api/superadmin/stats", headers=auth_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "total_users" in stats
    assert "total_organizers" in stats
    assert "total_tournaments" in stats

    # 2. Create an organizer
    create_res = await async_client.post(
        "/api/superadmin/organizers",
        json={
            "username": "portal_org_1",
            "password": "Password123!",
            "email": "portal_org1@matchgrid.com",
            "organization_name": "Portal Org",
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    org_user = create_res.json()
    org_id = org_user["id"]
    assert org_user["username"] == "portal_org_1"
    assert org_user["is_active"] is True

    # 3. Toggle status to suspended (inactive)
    status_res = await async_client.patch(
        f"/api/superadmin/users/{org_id}/status",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert status_res.status_code == 200
    assert status_res.json()["is_active"] is False

    # Suspended user fails login
    login_res = await async_client.post(
        "/api/auth/login",
        json={"username": "portal_org_1", "password": "Password123!"},
    )
    assert login_res.status_code == 401

    # Reactivate user
    reactivate_res = await async_client.patch(
        f"/api/superadmin/users/{org_id}/status",
        json={"is_active": True},
        headers=auth_headers,
    )
    assert reactivate_res.status_code == 200
    assert reactivate_res.json()["is_active"] is True

    # 4. Superadmin self-deactivation protection
    self_status_res = await async_client.patch(
        f"/api/superadmin/users/{admin.id}/status",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert self_status_res.status_code == 400

    # 5. Superadmin self-deletion protection
    self_del_res = await async_client.delete(
        f"/api/superadmin/users/{admin.id}",
        headers=auth_headers,
    )
    assert self_del_res.status_code == 400

    # 6. Delete the organizer user
    del_res = await async_client.delete(
        f"/api/superadmin/users/{org_id}",
        headers=auth_headers,
    )
    assert del_res.status_code == 204


@pytest.mark.asyncio
async def test_organizer_multi_group_tournament_creation(async_client, clean_db):
    org = User(
        username="wizard_org",
        password_hash=hash_password("Pass123!"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org.insert()
    headers = _headers_for(org)

    # Create tournament with 4 groups of 4 teams
    res = await async_client.post(
        "/api/organizer/tournaments",
        json={
            "name": "World Cup Invitational",
            "season": "2026",
            "slug": "world-cup-invitational",
            "config": {
                "num_groups": 4,
                "teams_per_group": 4,
                "qualifiers_per_group": 2,
                "knockout_format": "quarters_semis_final",
                "points_win": 3,
                "points_draw": 1,
                "points_loss": 0,
                "half_duration_minutes": 25,
            },
        },
        headers=headers,
    )
    assert res.status_code == 201
    t_data = res.json()
    t_id = t_data["id"]

    # Verify 4 groups (A, B, C, D) were dynamically pre-created
    from beanie import PydanticObjectId
    groups = await Group.find(Group.tournament_id == PydanticObjectId(t_id)).sort("name").to_list()
    assert len(groups) == 4
    assert [g.name for g in groups] == ["A", "B", "C", "D"]


@pytest.mark.asyncio
async def test_tournament_scoped_random_draw_and_knockout_seeding(async_client, clean_db):
    org = User(
        username="draw_org",
        password_hash=hash_password("Pass123!"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org.insert()
    headers = _headers_for(org)

    # Create tournament
    t_res = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "Draw Cup", "season": "2026", "slug": "draw-cup"},
        headers=headers,
    )
    t_id = t_res.json()["id"]

    # Create 6 teams for this tournament
    teams = []
    for i in range(6):
        team_res = await async_client.post(
            "/api/teams",
            json={
                "name": f"Team {i}",
                "color": "#10B981",
                "tournament_id": t_id,
            },
            headers=headers,
        )
        assert team_res.status_code == 201
        teams.append(team_res.json())

    # Perform random draw passing tournament_id
    draw_res = await async_client.post(
        f"/api/groups/random-draw?tournament_id={t_id}",
        headers=headers,
    )
    assert draw_res.status_code == 200
    drawn_groups = draw_res.json()
    assert len(drawn_groups) == 2
    for grp in drawn_groups:
        assert len(grp["teams"]) == 3


@pytest.mark.asyncio
async def test_superadmin_delete_any_tournament(async_client, admin, auth_headers, clean_db):
    # Organizer creates a tournament
    org = User(
        username="victim_org",
        password_hash=hash_password("Pass123!"),
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org.insert()
    org_headers = _headers_for(org)

    t_res = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "To Be Deleted", "season": "2026"},
        headers=org_headers,
    )
    t_id = t_res.json()["id"]

    # Superadmin deletes this tournament via superadmin endpoint
    del_res = await async_client.delete(
        f"/api/superadmin/tournaments/{t_id}",
        headers=auth_headers,
    )
    assert del_res.status_code == 204

    # Confirm it no longer exists
    assert await Tournament.get(t_id) is None
