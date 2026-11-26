"""Regression tests for the audit-remediation findings (fix/audit-remediation).

B1  invalid merged tournament config -> 422, never 500
B2  idempotent half-time / resume: the match clock can never rewind or count the break
B3  /api/scorer/matches runs a fixed number of queries, not a handful per match
B4  cancelled matches never appear in a player's history
B6  minor edge cases (missing champion team, bracket rounds of legacy rows, orphan stats)
D   draft tournaments are private to their superadmin / organizer / assigned scorers
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import create_access_token, hash_password
from app.models import Match, MatchEvent, MatchLineup, Player, PlayerStatistics, Team, Tournament, User, UserRole
from app.services.matches import build_tournament_bracket, pause_half_time, resume_match
from app.services.player_stats import recalculate_players_statistics


def _headers(user: User) -> dict[str, str]:
    token, _ = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


async def _user(username: str, role: UserRole, created_by=None) -> User:
    u = User(username=username, password_hash=hash_password("Password123!"), role=role, created_by=created_by)
    await u.insert()
    return u


async def _match(tournament, teams, **fields) -> Match:
    defaults = dict(
        tournament_id=tournament.id,
        match_number=fields.pop("match_number", 1),
        stage="group",
        team1_id=teams["Red Dragons"].id,
        team2_id=teams["Golden Hawks"].id,
    )
    defaults.update(fields)
    m = Match(**defaults)
    await m.insert()
    return m


# ---- B1 -------------------------------------------------------------------------------------


async def test_b1_infeasible_config_update_is_a_422_not_a_500(async_client, auth_headers):
    created = await async_client.post(
        "/api/organizer/tournaments", headers=auth_headers, json={"name": "Cfg Cup", "season": "1"}
    )
    tid = created.json()["id"]
    r = await async_client.patch(
        f"/api/organizer/tournaments/{tid}/config",
        headers=auth_headers,
        json={"teams_per_group": 2, "qualifiers_per_group": 3},
    )
    assert r.status_code == 422
    assert "qualifiers_per_group" in r.json()["detail"]
    # The stored config is untouched and the server keeps answering on the same connection.
    again = await async_client.get(f"/api/tournaments/{tid}")
    assert again.status_code == 200
    assert again.json()["config"]["qualifiers_per_group"] == 2


# ---- B2 -------------------------------------------------------------------------------------


async def test_b2_resume_while_running_does_not_rewind_the_clock(tournament, groups, teams):
    started = datetime.now(timezone.utc) - timedelta(seconds=900)
    match = await _match(tournament, teams, status="live", started_at=started, elapsed_seconds=0)
    result = await resume_match(await Match.get(match.id))
    assert result.is_half_time is False
    assert abs((result.started_at.replace(tzinfo=timezone.utc) - started).total_seconds()) < 1


async def test_b2_second_half_time_call_keeps_the_frozen_clock(tournament, groups, teams):
    match = await _match(
        tournament, teams, status="live", started_at=datetime.now(timezone.utc) - timedelta(seconds=1500)
    )
    first = await pause_half_time(await Match.get(match.id))
    frozen = first.elapsed_seconds
    # The break goes on: started_at is now stale, so recomputing from it would add the break.
    stale = await Match.get(match.id)
    stale.started_at = stale.started_at - timedelta(seconds=600)
    await stale.save()
    second = await pause_half_time(await Match.get(match.id))
    assert second.is_half_time is True
    assert second.elapsed_seconds == frozen


async def test_b2_explicit_half_time_reading_is_still_applied(tournament, groups, teams):
    match = await _match(tournament, teams, status="live", started_at=datetime.now(timezone.utc))
    await pause_half_time(await Match.get(match.id))
    corrected = await pause_half_time(await Match.get(match.id), elapsed_seconds=1500)
    assert corrected.elapsed_seconds == 1500


async def test_b2_api_double_resume_is_harmless(async_client, auth_headers, tournament, groups, teams):
    match = await _match(
        tournament, teams, status="live", started_at=datetime.now(timezone.utc) - timedelta(seconds=300)
    )
    url = f"/api/matches/{match.id}"
    assert (await async_client.post(f"{url}/half-time", headers=auth_headers)).status_code == 200
    assert (await async_client.post(f"{url}/resume", headers=auth_headers)).status_code == 200
    before = (await async_client.get(url)).json()["started_at"]
    assert (await async_client.post(f"{url}/resume", headers=auth_headers)).status_code == 200
    assert (await async_client.get(url)).json()["started_at"] == before


# ---- B3 -------------------------------------------------------------------------------------


async def test_b3_scorer_match_list_query_count_does_not_grow_with_matches(
    async_client, auth_headers, tournament, groups, teams, monkeypatch
):
    """Counts every find/find_one/get on every model during the request: the old per-match
    conversion issued ~5 of them per match, the batched one a fixed handful."""
    from app.models import DOCUMENT_MODELS

    calls = {"n": 0}

    def counting(original):
        def wrapper(*args, **kwargs):
            calls["n"] += 1
            return original(*args, **kwargs)
        return wrapper

    for model in DOCUMENT_MODELS:
        for name in ("find", "find_one", "get"):
            monkeypatch.setattr(model, name, counting(getattr(model, name)))

    async def count_for(n_matches: int) -> int:
        await Match.get_pymongo_collection().delete_many({})
        for i in range(n_matches):
            await _match(tournament, teams, match_number=i + 1, status="full_time")
        calls["n"] = 0
        r = await async_client.get("/api/scorer/matches", headers=auth_headers)
        assert r.status_code == 200 and len(r.json()) == n_matches
        return calls["n"]

    small, large = await count_for(2), await count_for(12)
    assert small == large, (small, large)


async def test_b3_scorer_list_still_reports_scores_and_scorers(async_client, tournament, groups, teams, players):
    scorer = await _user("b3_scorer", UserRole.SCORER)
    m = await _match(tournament, teams, status="full_time", assigned_scorer_ids=[scorer.id])
    await MatchEvent(match_id=m.id, type="goal", team_id=teams["Red Dragons"].id,
                     player_id=players["Red Dragons"][3].id, minute=10).insert()
    rows = (await async_client.get("/api/scorer/matches", headers=_headers(scorer))).json()
    assert [(r["score1"], r["score2"], r["winner_id"], r["assigned_scorer_ids"]) for r in rows] == [
        (1, 0, str(teams["Red Dragons"].id), [str(scorer.id)])
    ]


# ---- B4 -------------------------------------------------------------------------------------


async def test_b4_cancelled_matches_are_not_in_player_history(async_client, tournament, groups, teams, players):
    played = await _match(tournament, teams, match_number=1, status="full_time")
    await _match(tournament, teams, match_number=2, status="cancelled")
    await _match(tournament, teams, match_number=3, status="upcoming")
    striker = players["Red Dragons"][3]
    history = (await async_client.get(f"/api/players/{striker.id}")).json()["history"]
    assert [h["match_id"] for h in history] == [str(played.id)]


# ---- B6 -------------------------------------------------------------------------------------


async def test_b6_public_list_survives_a_champion_team_that_no_longer_exists(async_client, tournament):
    from beanie import PydanticObjectId

    tournament.champion_team_id = PydanticObjectId()
    await tournament.save()
    r = await async_client.get("/api/tournaments/public")
    assert r.status_code == 200
    assert r.json()[0]["champion_crest_url"] is None


async def test_b6_legacy_quarter_bracket_rows_without_round_order_land_in_their_round(tournament, teams):
    tournament.config.knockout_format = "quarters_semis_final"
    tournament.config.num_groups = 4
    await tournament.save()
    for n, (stage, slot) in enumerate([("quarter", "QF1"), ("semi", "SF1"), ("final", "FINAL")], start=1):
        await Match(tournament_id=tournament.id, match_number=n, stage=stage, bracket_slot=slot).insert()
    tree = await build_tournament_bracket(tournament.id)
    assert [(r.round_order, r.round_name, [m.stage for m in r.matches]) for r in tree.rounds] == [
        (1, "Quarter-finals", ["quarter"]),
        (2, "Semi-finals", ["semi"]),
        (3, "Final", ["final"]),
    ]


async def test_b6_batched_stats_skip_an_orphan_player_instead_of_crashing(tournament, teams, players):
    from beanie import PydanticObjectId

    orphan = Player(tournament_id=None, team_id=PydanticObjectId(), name="Orphan", number=99)
    await orphan.insert()
    striker = players["Red Dragons"][3]
    m = await _match(tournament, teams, status="full_time")
    await MatchEvent(match_id=m.id, type="goal", team_id=striker.team_id, player_id=striker.id, minute=3).insert()
    await MatchLineup(match_id=m.id, team_id=striker.team_id, player_id=striker.id).insert()
    result = await recalculate_players_statistics([orphan.id, striker.id])
    assert orphan.id not in result
    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == striker.id)
    assert (stats.goals, stats.appearances) == (1, 1)


# ---- D: draft visibility ----------------------------------------------------------------------


@pytest.fixture
async def draft_setup(clean_db):
    owner = await _user("draft_owner", UserRole.ORGANIZER)
    other = await _user("draft_other", UserRole.ORGANIZER)
    scorer = await _user("draft_scorer", UserRole.SCORER, created_by=owner.id)
    stranger_scorer = await _user("draft_stranger", UserRole.SCORER)
    t = Tournament(name="Secret Cup", season="1", slug="secret-cup", status="draft", organizer_id=owner.id)
    await t.insert()
    team = Team(tournament_id=t.id, name="Hidden FC", color="#10B981")
    await team.insert()
    m = Match(tournament_id=t.id, match_number=1, stage="extra", team1_id=team.id, team2_id=team.id,
              status="live", assigned_scorer_ids=[scorer.id])
    await m.insert()
    return dict(t=t, team=team, match=m, owner=owner, other=other, scorer=scorer, stranger=stranger_scorer)


def _public_urls(s) -> list[str]:
    t = s["t"]
    return [
        "/api/tournaments/slug/secret-cup",
        f"/api/tournaments/{t.id}",
        "/api/matches?tournament_slug=secret-cup",
        f"/api/matches/bracket?tournament_id={t.id}",
        f"/api/teams?tournament_id={t.id}",
        f"/api/players?tournament_id={t.id}",
        f"/api/groups?tournament_id={t.id}",
        f"/api/standings?tournament_id={t.id}",
        f"/api/statistics/leaderboards?tournament_id={t.id}",
        f"/api/matches/{s['match'].id}",
        f"/api/matches/{s['match'].id}/events",
        f"/api/teams/{s['team'].id}",
    ]


async def test_draft_is_invisible_to_the_public_and_to_unrelated_accounts(async_client, draft_setup):
    s = draft_setup
    assert all(t["slug"] != "secret-cup" for t in (await async_client.get("/api/tournaments/public")).json())
    assert (await async_client.get("/api/matches/featured")).json() == []
    for viewer in (None, s["other"], s["stranger"]):
        headers = _headers(viewer) if viewer else {}
        for url in _public_urls(s):
            r = await async_client.get(url, headers=headers)
            assert r.status_code == 404, (url, viewer and viewer.username, r.status_code)


async def test_draft_stays_readable_for_its_owner_superadmin_and_assigned_scorer(async_client, draft_setup, admin):
    s = draft_setup
    for viewer in (s["owner"], admin, s["scorer"]):
        for url in _public_urls(s):
            r = await async_client.get(url, headers=_headers(viewer))
            assert r.status_code == 200, (url, viewer.username, r.status_code)


async def test_an_invalid_token_on_a_public_page_is_treated_as_anonymous(async_client, draft_setup):
    r = await async_client.get("/api/tournaments/public", headers={"Authorization": "Bearer not-a-token"})
    assert r.status_code == 200


async def test_publishing_a_draft_makes_it_public(async_client, draft_setup):
    s = draft_setup
    r = await async_client.patch(
        f"/api/organizer/tournaments/{s['t'].id}", headers=_headers(s["owner"]), json={"status": "active"}
    )
    assert r.status_code == 200
    assert (await async_client.get("/api/tournaments/slug/secret-cup")).status_code == 200
    assert any(t["slug"] == "secret-cup" for t in (await async_client.get("/api/tournaments/public")).json())
