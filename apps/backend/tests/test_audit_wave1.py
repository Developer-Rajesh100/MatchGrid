"""Regression tests for audit Wave 1 (docs/Audit.md: C1-C10, M6, H14)."""

from unittest.mock import MagicMock

import pytest

from app.core.security import create_access_token, hash_password
from app.migrations import m0007_migrate_legacy_admins
from app.core.config import get_settings
from app.core.database import get_client
from app.models import (
    Group,
    GroupTeam,
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
from app.services.storage import get_storage_service

KEY32 = "a" * 32
OTHER_KEY32 = "b" * 32


def _h(user: User) -> dict[str, str]:
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


async def _user(name: str, role: UserRole, **kw) -> User:
    u = User(username=name, password_hash=hash_password("pass12345"), role=role, is_active=True, **kw)
    await u.insert()
    return u


async def _tournament(owner: User | None, slug: str) -> Tournament:
    t = Tournament(name=slug.title(), season="2026", slug=slug, organizer_id=owner.id if owner else None)
    await t.insert()
    return t


async def _team(t: Tournament, name: str, group: Group | None = None) -> Team:
    team = Team(tournament_id=t.id, name=name, color="#112233")
    await team.insert()
    if group is not None:
        await GroupTeam(tournament_id=t.id, group_id=group.id, team_id=team.id).insert()
    return team


@pytest.fixture
def r2():
    """Enables R2 with a mocked S3 client, restoring the shared settings afterwards."""
    storage = get_storage_service()
    names = ("r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket_name", "r2_public_base_url")
    saved = {n: getattr(storage.settings, n) for n in names}
    saved_client = storage._s3_client
    mock = MagicMock()
    mock.list_objects_v2.return_value = {"Contents": [], "IsTruncated": False}
    storage._s3_client = mock
    storage.settings.r2_account_id = "acc"
    storage.settings.r2_access_key_id = "key"
    storage.settings.r2_secret_access_key = "secret"
    storage.settings.r2_bucket_name = "bucket"
    storage.settings.r2_public_base_url = "https://cdn.test"
    yield mock
    for n, v in saved.items():
        setattr(storage.settings, n, v)
    storage._s3_client = saved_client


def _deleted_keys(mock: MagicMock) -> list[str]:
    return [c.kwargs["Key"] for c in mock.delete_object.call_args_list]


# --------------------------------------------------------------------------- C2 / C10 / H14


async def test_c2_team_crest_must_belong_to_own_tournament(async_client, clean_db, r2):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta, tb = await _tournament(org_a, "cup-a"), await _tournament(org_b, "cup-b")
    team_b = await _team(tb, "B FC")
    foreign = f"https://cdn.test/tournaments/{ta.id}/crests/{KEY32}.png"
    own = f"https://cdn.test/tournaments/{tb.id}/crests/{OTHER_KEY32}.png"

    r = await async_client.patch(f"/api/teams/{team_b.id}", json={"crest_url": foreign}, headers=_h(org_b))
    assert r.status_code == 422
    r = await async_client.post(
        "/api/teams",
        json={"name": "New", "color": "#123456", "tournament_id": str(tb.id), "crest_url": foreign},
        headers=_h(org_b),
    )
    assert r.status_code == 422
    r = await async_client.patch(f"/api/teams/{team_b.id}", json={"crest_url": own}, headers=_h(org_b))
    assert r.status_code == 200
    assert (await Team.get(team_b.id)).crest_url == own
    assert r2.delete_object.call_count == 0


async def test_c2_player_photo_and_unsafe_schemes_rejected(async_client, clean_db, r2):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta, tb = await _tournament(org_a, "cup-a"), await _tournament(org_b, "cup-b")
    team_b = await _team(tb, "B FC")
    player = Player(team_id=team_b.id, tournament_id=tb.id, name="P", number=1, dcl_id="DCL-001")
    await player.insert()

    for bad in (
        f"tournaments/{ta.id}/photos/{KEY32}.jpg",  # another tenant's key
        f"tournaments/{tb.id}/photos/not-a-real-name.jpg",  # malformed key in our own folder
        "javascript:alert(1)",
    ):
        r = await async_client.patch(f"/api/players/{player.id}", json={"photo_url": bad}, headers=_h(org_b))
        assert r.status_code == 422, bad
    ok = await async_client.patch(
        f"/api/players/{player.id}", json={"photo_url": "https://example.com/p.png"}, headers=_h(org_b)
    )
    assert ok.status_code == 200


async def test_c2_replaced_media_deleted_only_when_own_and_unreferenced(async_client, clean_db, r2):
    org = await _user("org_a", UserRole.ORGANIZER)
    t = await _tournament(org, "cup-a")
    team1, team2 = await _team(t, "One"), await _team(t, "Two")
    shared = f"tournaments/{t.id}/crests/{KEY32}.png"
    unique = f"tournaments/{t.id}/crests/{OTHER_KEY32}.png"
    team1.crest_url = team1.logo_url = shared
    await team1.save()
    team2.crest_url = team2.logo_url = shared
    await team2.save()

    # team1 swaps away from an image team2 still uses -> must NOT be deleted
    r = await async_client.patch(
        f"/api/teams/{team1.id}", json={"crest_url": "https://example.com/x.png"}, headers=_h(org)
    )
    assert r.status_code == 200
    assert _deleted_keys(r2) == []

    # team2 was the last user -> now it is deleted
    r = await async_client.patch(f"/api/teams/{team2.id}", json={"crest_url": None}, headers=_h(org))
    assert r.status_code == 200
    assert _deleted_keys(r2) == [shared]
    assert unique  # (keeps the constants honest)


async def test_c10_delete_endpoint_rejects_malformed_keys(async_client, admin, auth_headers, r2):
    for bad in (
        "tournaments/anything/at/all.png",
        "tournaments/not24hexchars/crests/" + KEY32 + ".png",
        "tournaments/" + "c" * 24 + "/crests/short.png",
        "tournaments/" + "c" * 24 + "/other/" + KEY32 + ".png",
    ):
        r = await async_client.request("DELETE", "/api/uploads/image", json={"url_or_key": bad}, headers=auth_headers)
        assert r.status_code == 404, bad
    assert r2.delete_object.call_count == 0


async def test_c10_storage_refuses_non_media_keys_even_if_called_directly(r2):
    storage = get_storage_service()
    assert await storage.delete_image("tournaments/anything/file.png") is False
    assert r2.delete_object.call_count == 0


async def test_h14_tournament_patch_deletes_replaced_logo_and_banner(async_client, clean_db, r2):
    org = await _user("org_a", UserRole.ORGANIZER)
    t = await _tournament(org, "cup-a")
    old_logo = f"https://cdn.test/tournaments/{t.id}/logos/{KEY32}.png"
    old_banner = f"https://cdn.test/tournaments/{t.id}/banners/{KEY32}.jpg"
    t.logo_url, t.banner_url = old_logo, old_banner
    await t.save()
    new_logo = f"https://cdn.test/tournaments/{t.id}/logos/{OTHER_KEY32}.png"

    r = await async_client.patch(
        f"/api/organizer/tournaments/{t.id}", json={"logo_url": new_logo, "banner_url": None}, headers=_h(org)
    )
    assert r.status_code == 200
    assert set(_deleted_keys(r2)) == {f"tournaments/{t.id}/logos/{KEY32}.png", f"tournaments/{t.id}/banners/{KEY32}.jpg"}

    # unchanged logo is not deleted
    r2.delete_object.reset_mock()
    r = await async_client.patch(f"/api/organizer/tournaments/{t.id}", json={"logo_url": new_logo}, headers=_h(org))
    assert r.status_code == 200
    assert r2.delete_object.call_count == 0


async def test_h14_tournament_patch_rejects_foreign_logo(async_client, clean_db, r2):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta, tb = await _tournament(org_a, "cup-a"), await _tournament(org_b, "cup-b")
    r = await async_client.patch(
        f"/api/organizer/tournaments/{tb.id}",
        json={"logo_url": f"tournaments/{ta.id}/logos/{KEY32}.png"},
        headers=_h(org_b),
    )
    assert r.status_code == 422


async def test_create_tournament_rejects_r2_media_before_it_exists(async_client, clean_db, r2):
    org = await _user("org_a", UserRole.ORGANIZER)
    r = await async_client.post(
        "/api/organizer/tournaments",
        json={"name": "N", "season": "1", "logo_url": f"tournaments/{'d' * 24}/logos/{KEY32}.png"},
        headers=_h(org),
    )
    assert r.status_code == 422


# --------------------------------------------------------------------------- C3


async def test_c3_cannot_assign_team_to_another_tournaments_group(async_client, clean_db):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta, tb = await _tournament(org_a, "cup-a"), await _tournament(org_b, "cup-b")
    group_b = Group(tournament_id=tb.id, name="A")
    await group_b.insert()
    team_a = await _team(ta, "A FC")

    r = await async_client.patch(f"/api/teams/{team_a.id}", json={"group_id": str(group_b.id)}, headers=_h(org_a))
    assert r.status_code == 404
    assert await GroupTeam.find(GroupTeam.group_id == group_b.id).count() == 0

    r = await async_client.post(
        "/api/teams",
        json={"name": "Spy FC", "color": "#123456", "tournament_id": str(ta.id), "group_id": str(group_b.id)},
        headers=_h(org_a),
    )
    assert r.status_code == 404
    assert await Team.find(Team.name == "Spy FC").count() == 0  # nothing half-created


async def test_c3_failed_group_move_does_not_apply_other_field_changes(async_client, clean_db):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta, tb = await _tournament(org_a, "cup-a"), await _tournament(org_b, "cup-b")
    group_b = Group(tournament_id=tb.id, name="A")
    await group_b.insert()
    team_a = await _team(ta, "A FC")
    r = await async_client.patch(
        f"/api/teams/{team_a.id}", json={"name": "Renamed", "group_id": str(group_b.id)}, headers=_h(org_a)
    )
    assert r.status_code == 404
    assert (await Team.get(team_a.id)).name == "A FC"


# --------------------------------------------------------------------------- C5


async def test_c5_unowned_tournament_is_superadmin_only(async_client, admin, auth_headers, tournament):
    assert tournament.organizer_id is None
    org = await _user("org_any", UserRole.ORGANIZER)
    body = {"name": "T", "color": "#123456", "tournament_id": str(tournament.id)}

    r = await async_client.post("/api/teams", json=body, headers=_h(org))
    assert r.status_code == 403
    r = await async_client.patch(f"/api/organizer/tournaments/{tournament.id}", json={"name": "x"}, headers=_h(org))
    assert r.status_code == 403
    r = await async_client.post("/api/teams", json=body, headers=auth_headers)
    assert r.status_code == 201


async def test_c5_unknown_tournament_is_404_for_everyone(async_client, admin, auth_headers):
    ghost = "f" * 24
    org = await _user("org_any", UserRole.ORGANIZER)
    for headers in (auth_headers, _h(org)):
        r = await async_client.post(
            "/api/teams", json={"name": "T", "color": "#123456", "tournament_id": ghost}, headers=headers
        )
        assert r.status_code == 404
        r = await async_client.post(f"/api/groups/random-draw?tournament_id={ghost}", headers=headers)
        assert r.status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/api/groups/random-draw",
        "/api/matches/generate-semis",
        "/api/matches/generate-final",
        "/api/matches/seed-knockout",
    ],
)
async def test_c5_mutations_require_explicit_tournament_id(async_client, admin, auth_headers, tournament, path):
    r = await async_client.post(path, headers=auth_headers)
    assert r.status_code == 422  # no fallback to "the first tournament"


async def test_c5_create_team_and_match_require_tournament_id_in_body(async_client, admin, auth_headers, tournament, teams):
    r = await async_client.post("/api/teams", json={"name": "T", "color": "#123456"}, headers=auth_headers)
    assert r.status_code == 422
    r = await async_client.post(
        "/api/matches",
        json={
            "team1_id": str(teams["Red Dragons"].id),
            "team2_id": str(teams["Blue Whales"].id),
            "date": "2026-11-01",
        },
        headers=auth_headers,
    )
    assert r.status_code == 422


async def test_c5_organizer_cannot_operate_orphaned_or_unowned_match(async_client, clean_db, admin, auth_headers):
    org = await _user("org_any", UserRole.ORGANIZER)
    t = await _tournament(None, "unowned")
    team_a, team_b = await _team(t, "A"), await _team(t, "B")
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=team_a.id, team2_id=team_b.id)
    await m.insert()
    assert (await async_client.post(f"/api/matches/{m.id}/start", headers=_h(org))).status_code == 403

    orphan = Match(tournament_id=PydanticObjectIdFactory(), match_number=1, stage="extra")
    await orphan.insert()
    assert (await async_client.post(f"/api/matches/{orphan.id}/start", headers=_h(org))).status_code == 404
    assert (await async_client.post(f"/api/matches/{orphan.id}/start", headers=auth_headers)).status_code == 404


def PydanticObjectIdFactory():
    from beanie import PydanticObjectId

    return PydanticObjectId()


# --------------------------------------------------------------------------- C4


async def test_c4_singleton_tournament_patch_routes_are_gone(async_client, admin, auth_headers, tournament):
    for path in ("/api/tournament", "/api/tournament/config"):
        r = await async_client.patch(path, json={"name": "X"}, headers=auth_headers)
        assert r.status_code in (404, 405), path
    assert (await Tournament.get(tournament.id)).name == "Test Tournament"


async def test_c4_organizer_endpoints_enforce_ownership_and_merge_config(async_client, clean_db):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    ta = await _tournament(org_a, "cup-a")

    assert (
        await async_client.patch(f"/api/organizer/tournaments/{ta.id}", json={"name": "Hijack"}, headers=_h(org_b))
    ).status_code == 403
    assert (
        await async_client.patch(
            f"/api/organizer/tournaments/{ta.id}/config", json={"points_win": 5}, headers=_h(org_b)
        )
    ).status_code == 403

    r = await async_client.patch(f"/api/organizer/tournaments/{ta.id}", json={"name": "Renamed"}, headers=_h(org_a))
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    r = await async_client.patch(
        f"/api/organizer/tournaments/{ta.id}/config", json={"points_win": 2}, headers=_h(org_a)
    )
    assert r.status_code == 200
    cfg = r.json()["config"]
    assert cfg["points_win"] == 2 and cfg["points_draw"] == 1  # untouched fields survive


# --------------------------------------------------------------------------- C9


async def test_c9_assigned_scorer_cannot_use_management_routes(async_client, clean_db):
    org = await _user("org_a", UserRole.ORGANIZER)
    scorer = await _user("scorer_1", UserRole.SCORER, created_by=org.id)
    t = await _tournament(org, "cup-a")
    ta, tb = await _team(t, "A"), await _team(t, "B")
    m = Match(
        tournament_id=t.id, match_number=1, stage="extra", team1_id=ta.id, team2_id=tb.id,
        assigned_scorer_ids=[scorer.id],
    )
    await m.insert()
    h = _h(scorer)

    assert (await async_client.patch(f"/api/matches/{m.id}", json={"venue": "Hacked"}, headers=h)).status_code == 403
    assert (await async_client.post(f"/api/matches/{m.id}/cancel", headers=h)).status_code == 403
    assert (await async_client.post(f"/api/matches/{m.id}/uncancel", headers=h)).status_code == 403
    assert (await async_client.post(f"/api/matches/{m.id}/reopen", headers=h)).status_code == 403
    assert (
        await async_client.post(f"/api/matches/{m.id}/winner", json={"team_id": str(ta.id)}, headers=h)
    ).status_code == 403
    assert (await Match.get(m.id)).venue is None

    # ...but the live clock is still theirs
    assert (await async_client.post(f"/api/matches/{m.id}/start", headers=h)).status_code == 200

    # and the owning organizer keeps full control
    oh = _h(org)
    assert (await async_client.patch(f"/api/matches/{m.id}", json={"venue": "Main"}, headers=oh)).status_code == 200
    assert (await async_client.post(f"/api/matches/{m.id}/end", headers=oh)).status_code == 200
    assert (await async_client.post(f"/api/matches/{m.id}/reopen", headers=oh)).status_code == 200

    other = await _user("org_b", UserRole.ORGANIZER)
    assert (await async_client.patch(f"/api/matches/{m.id}", json={"venue": "x"}, headers=_h(other))).status_code == 403


# --------------------------------------------------------------------------- M6


async def test_m6_scorer_assignment_limited_to_own_scorers(async_client, clean_db, admin, auth_headers):
    org_a, org_b = await _user("org_a", UserRole.ORGANIZER), await _user("org_b", UserRole.ORGANIZER)
    own = await _user("own_scorer", UserRole.SCORER, created_by=org_a.id)
    foreign = await _user("foreign_scorer", UserRole.SCORER, created_by=org_b.id)
    t = await _tournament(org_a, "cup-a")
    m = Match(tournament_id=t.id, match_number=1, stage="extra")
    await m.insert()
    url = f"/api/organizer/matches/{m.id}/scorers"

    r = await async_client.post(url, json={"scorer_id": str(foreign.id)}, headers=_h(org_a))
    assert r.status_code == 403
    assert (await Match.get(m.id)).assigned_scorer_ids == []

    r = await async_client.post(url, json={"scorer_id": str(own.id)}, headers=_h(org_a))
    assert r.status_code == 200

    r = await async_client.post(url, json={"scorer_id": str(foreign.id)}, headers=auth_headers)
    assert r.status_code == 200  # superadmin may assign any scorer


# --------------------------------------------------------------------------- C6


async def _populate(t: Tournament):
    group = Group(tournament_id=t.id, name="A")
    await group.insert()
    ta, tb = await _team(t, f"{t.slug}-A", group), await _team(t, f"{t.slug}-B", group)
    pa = Player(team_id=ta.id, tournament_id=t.id, name="PA", number=1, dcl_id="X1")
    pb = Player(team_id=tb.id, tournament_id=t.id, name="PB", number=1, dcl_id="X2")
    await pa.insert()
    await pb.insert()
    m = Match(tournament_id=t.id, match_number=1, stage="group", group_id=group.id, team1_id=ta.id, team2_id=tb.id)
    await m.insert()
    await MatchEvent(match_id=m.id, type="goal", team_id=ta.id, player_id=pa.id, minute=3).insert()
    await MatchLineup(match_id=m.id, team_id=ta.id, player_id=pa.id).insert()
    await TournamentStanding(tournament_id=t.id, group_id=group.id, team_id=ta.id).insert()
    await PlayerStatistics(tournament_id=t.id, player_id=pa.id, team_id=ta.id, goals=1).insert()


async def _counts() -> dict[str, int]:
    return {
        m.__name__: await m.find_all().count()
        for m in (Group, GroupTeam, Team, Player, Match, MatchEvent, MatchLineup, TournamentStanding, PlayerStatistics)
    }


async def test_c6_tournament_delete_cascades_everything_and_purges_r2_prefix(async_client, clean_db, r2):
    org = await _user("org_a", UserRole.ORGANIZER)
    doomed, survivor = await _tournament(org, "doomed"), await _tournament(org, "survivor")
    await _populate(doomed)
    await _populate(survivor)
    before = await _counts()
    assert all(v > 0 and v % 2 == 0 for v in before.values()), before  # every collection populated for both

    r2.list_objects_v2.return_value = {
        "Contents": [{"Key": f"tournaments/{doomed.id}/crests/{KEY32}.png"}],
        "IsTruncated": False,
    }
    r = await async_client.delete(f"/api/organizer/tournaments/{doomed.id}", headers=_h(org))
    assert r.status_code == 204

    after = await _counts()
    assert all(after[k] * 2 == before[k] for k in before), (before, after)  # exactly the survivor's rows remain
    assert await Tournament.get(doomed.id) is None and await Tournament.get(survivor.id) is not None

    # purge ran for the doomed tournament's prefix only, and after the DB delete
    assert r2.list_objects_v2.call_args.kwargs["Prefix"] == f"tournaments/{doomed.id}/"
    deleted = r2.delete_objects.call_args.kwargs["Delete"]["Objects"]
    assert deleted == [{"Key": f"tournaments/{doomed.id}/crests/{KEY32}.png"}]


async def test_c6_prefix_purge_paginates(r2):
    storage = get_storage_service()
    tid = "e" * 24
    r2.list_objects_v2.side_effect = [
        {"Contents": [{"Key": "k1"}], "IsTruncated": True, "NextContinuationToken": "tok"},
        {"Contents": [{"Key": "k2"}], "IsTruncated": False},
    ]
    assert await storage.delete_prefix(f"tournaments/{tid}/") == 2
    assert r2.list_objects_v2.call_args_list[1].kwargs["ContinuationToken"] == "tok"
    assert await storage.delete_prefix("tournaments/") == 0  # refuses broad prefixes
    assert await storage.delete_prefix("") == 0


async def test_c6_superadmin_delete_uses_the_same_cascade(async_client, admin, auth_headers, clean_db, r2):
    org = await _user("org_a", UserRole.ORGANIZER)
    t = await _tournament(org, "doomed")
    await _populate(t)
    r = await async_client.delete(f"/api/superadmin/tournaments/{t.id}", headers=auth_headers)
    assert r.status_code == 204
    assert all(v == 0 for v in (await _counts()).values())


# --------------------------------------------------------------------------- C7


async def test_c7_cannot_delete_organizer_who_owns_tournaments(async_client, admin, auth_headers):
    org = await _user("org_a", UserRole.ORGANIZER)
    t = await _tournament(org, "cup-a")

    r = await async_client.delete(f"/api/superadmin/users/{org.id}", headers=auth_headers)
    assert r.status_code == 409
    assert await User.get(org.id) is not None

    await Tournament.find(Tournament.id == t.id).delete()
    r = await async_client.delete(f"/api/superadmin/users/{org.id}", headers=auth_headers)
    assert r.status_code == 204


async def test_c7_deleting_a_scorer_unassigns_them_everywhere(async_client, admin, auth_headers):
    org = await _user("org_a", UserRole.ORGANIZER)
    keep = await _user("keep_scorer", UserRole.SCORER, created_by=org.id)
    gone = await _user("gone_scorer", UserRole.SCORER, created_by=org.id)
    t = await _tournament(org, "cup-a")
    m1 = Match(tournament_id=t.id, match_number=1, stage="extra", assigned_scorer_ids=[gone.id, keep.id])
    m2 = Match(tournament_id=t.id, match_number=2, stage="extra", assigned_scorer_ids=[gone.id])
    await m1.insert()
    await m2.insert()

    r = await async_client.delete(f"/api/superadmin/users/{gone.id}", headers=auth_headers)
    assert r.status_code == 204
    assert (await Match.get(m1.id)).assigned_scorer_ids == [keep.id]
    assert (await Match.get(m2.id)).assigned_scorer_ids == []

    # the organizer-side delete shares the same cleanup
    r = await async_client.delete(f"/api/organizer/scorers/{keep.id}", headers=_h(org))
    assert r.status_code == 204
    assert (await Match.get(m1.id)).assigned_scorer_ids == []


# --------------------------------------------------------------------------- C8


async def test_c8_legacy_admin_collection_is_migrated_into_users(clean_db):
    db = get_client()[get_settings().mongo_db_name]
    legacy_hash = hash_password("legacy-password-1")
    inserted = await db["admins"].insert_one({"username": "old_admin", "password_hash": legacy_hash})
    # existing super-admin user with the same name: legacy password wins (it was authoritative)
    await User(username="dupe", password_hash=hash_password("stale"), role=UserRole.SUPER_ADMIN).insert()
    await db["admins"].insert_one({"username": "dupe", "password_hash": legacy_hash})

    await m0007_migrate_legacy_admins.up()

    migrated = await User.find_one(User.username == "old_admin")
    assert migrated.role == UserRole.SUPER_ADMIN and migrated.is_active
    assert migrated.id == inserted.inserted_id  # same id: already-issued tokens keep working
    assert (await User.find_one(User.username == "dupe")).password_hash == legacy_hash
    assert "admins" not in await db.list_collection_names()

    await m0007_migrate_legacy_admins.up()  # idempotent


async def test_c8_username_collision_with_non_admin_is_not_promoted(clean_db):
    db = get_client()[get_settings().mongo_db_name]
    await User(username="clash", password_hash=hash_password("x"), role=UserRole.SCORER).insert()
    await db["admins"].insert_one({"username": "clash", "password_hash": hash_password("legacy")})

    await m0007_migrate_legacy_admins.up()

    assert (await User.find_one(User.username == "clash")).role == UserRole.SCORER
    names = await db.list_collection_names()
    assert "admins" not in names and "admins_legacy_unmigrated" in names
    await db.drop_collection("admins_legacy_unmigrated")


async def test_c8_deactivated_superadmin_cannot_log_in_or_use_old_tokens(async_client, admin, auth_headers):
    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 200
    admin.is_active = False
    await admin.save()

    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 401
    r = await async_client.post("/api/auth/login", json={"username": "testadmin", "password": "testpass123"})
    assert r.status_code == 401


async def test_c8_no_special_case_for_a_user_named_testadmin(async_client, admin, auth_headers):
    """A token for a deleted account is rejected, and the account named 'testadmin' gets no
    special treatment either way (the old hardcoded bypass is gone)."""
    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 200
    await admin.delete()
    assert (await async_client.get("/api/auth/me", headers=auth_headers)).status_code == 401


def test_c8_admin_model_is_gone():
    import app.models as models

    assert not hasattr(models, "Admin")
    assert all(m.Settings.name != "admins" for m in models.DOCUMENT_MODELS)
