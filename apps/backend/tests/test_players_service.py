"""Coverage for create_player/update_player/delete_player in
app/services/players.py — zero automated test coverage before this
(confirmed via `pytest --cov` during the Timer/Half-Time audit's Test
Coverage follow-up), despite real business logic: auto-assigned DCL IDs,
per-team jersey-number uniqueness, the "only one manager per team" swap
rule, and the "can't delete a player with recorded history" guard.
"""

import pytest

from app.core.errors import ConflictError
from app.models import MatchEvent, MatchLineup, Player
from app.schemas.player import PlayerCreate, PlayerUpdate
from app.services.players import create_player, delete_player, update_player


async def test_create_player_assigns_an_auto_incrementing_dcl_id(tournament, teams, players):
    existing_count = await Player.find(Player.tournament_id == tournament.id).count()
    payload = PlayerCreate(team_id=str(teams["Red Dragons"].id), name="New Signing", number=99)
    player = await create_player(payload)
    # fixture players already hold DCL-001..024; the counter catches up past them
    assert player.dcl_id == f"DCL-{existing_count + 1:03d}"
    assert player.team_id == teams["Red Dragons"].id


async def test_create_player_rejects_a_duplicate_jersey_number_on_the_same_team(tournament, teams, players):
    existing = players["Red Dragons"][0]
    payload = PlayerCreate(
        team_id=str(teams["Red Dragons"].id), name="Duplicate Number", number=existing.number
    )
    with pytest.raises(ConflictError):
        await create_player(payload)


async def test_create_player_allows_the_same_jersey_number_on_a_different_team(tournament, teams, players):
    # 77 isn't used by either fixture squad's default 1-4 numbering, so this
    # isolates "same number, different team" from an incidental same-team clash.
    number = 77
    await create_player(
        PlayerCreate(team_id=str(teams["Red Dragons"].id), name="Red 77", number=number)
    )
    player = await create_player(
        PlayerCreate(team_id=str(teams["Golden Hawks"].id), name="Hawks 77", number=number)
    )
    assert player.number == number
    assert player.team_id == teams["Golden Hawks"].id


async def test_create_player_as_manager_unsets_the_teams_existing_manager(tournament, teams, players):
    # The `players` fixture doesn't designate a manager, so set one directly
    # first to exercise the swap-on-create behavior.
    original_manager = players["Red Dragons"][0]
    original_manager.is_manager = True
    await original_manager.save()

    payload = PlayerCreate(
        team_id=str(teams["Red Dragons"].id), name="New Manager", number=50, is_manager=True
    )
    new_manager = await create_player(payload)

    assert new_manager.is_manager is True
    refreshed_original = await Player.get(original_manager.id)
    assert refreshed_original.is_manager is False


async def test_update_player_can_change_basic_fields(tournament, teams, players):
    player = players["Red Dragons"][1]
    updated = await update_player(player, PlayerUpdate(name="Renamed Player"))
    assert updated.name == "Renamed Player"


async def test_update_player_number_conflict_raises_a_clean_error(tournament, teams, players):
    p1, p2 = players["Red Dragons"][0], players["Red Dragons"][1]
    with pytest.raises(ConflictError):
        await update_player(p1, PlayerUpdate(number=p2.number))


async def test_update_player_making_them_manager_unsets_the_previous_manager(tournament, teams, players):
    squad = players["Red Dragons"]
    original_manager, other_player = squad[0], squad[1]
    original_manager.is_manager = True
    await original_manager.save()

    updated = await update_player(other_player, PlayerUpdate(is_manager=True))
    assert updated.is_manager is True

    refreshed_original = await Player.get(original_manager.id)
    assert refreshed_original.is_manager is False


async def test_update_player_can_unset_manager_status(tournament, teams, players):
    manager = players["Red Dragons"][0]
    manager.is_manager = True
    await manager.save()

    updated = await update_player(manager, PlayerUpdate(is_manager=False))
    assert updated.is_manager is False


async def test_delete_player_succeeds_when_they_have_no_recorded_history(tournament, teams, players):
    player = players["Red Dragons"][1]
    await delete_player(player)
    assert await Player.get(player.id) is None


async def test_delete_player_is_blocked_when_they_have_a_match_event(tournament, groups, teams, players):
    from app.models import Match

    player = players["Red Dragons"][3]
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="live",
    )
    await match.insert()
    await MatchEvent(match_id=match.id, type="goal", team_id=teams["Red Dragons"].id, player_id=player.id, minute=10).insert()

    with pytest.raises(ConflictError):
        await delete_player(player)
    assert await Player.get(player.id) is not None


async def test_delete_player_is_blocked_when_they_have_a_lineup_entry(tournament, groups, teams, players):
    from app.models import Match

    player = players["Red Dragons"][2]
    match = Match(
        tournament_id=tournament.id, match_number=1, group_id=groups["A"].id, stage="group",
        team1_id=teams["Red Dragons"].id, team2_id=teams["Golden Hawks"].id, status="live",
    )
    await match.insert()
    await MatchLineup(match_id=match.id, team_id=teams["Red Dragons"].id, player_id=player.id).insert()

    with pytest.raises(ConflictError):
        await delete_player(player)
    assert await Player.get(player.id) is not None


async def test_legacy_player_documents_with_position_still_load_and_are_not_exposed(
    async_client, tournament, teams
):
    """Production already holds players stored with a `position` — they must keep
    loading, and the API must no longer expose the field."""
    from app.core.database import get_client
    from app.core.config import get_settings

    team = teams["Red Dragons"]
    coll = get_client()[get_settings().mongo_db_name]["players"]
    await coll.insert_one(
        {"team_id": team.id, "dcl_id": "LEGACY-1", "name": "Old Doc", "number": 55,
         "position": "GK", "is_manager": False}
    )
    listed = (await async_client.get(f"/api/players?team_id={team.id}&tournament_id={team.tournament_id}")).json()
    legacy = next(p for p in listed if p["dcl_id"] == "LEGACY-1")
    assert "position" not in legacy
    assert legacy["name"] == "Old Doc"


def test_importer_accepts_files_with_or_without_position():
    from app.scripts.import_tournament_data import validate

    base = {"name": "T", "group": "A", "color": "#fff", "players": [{"name": "P", "number": 1}]}
    assert [e for e in validate({"teams": [base]}) if not e.startswith("NOTE")] == []
    with_pos = {**base, "players": [{"name": "P", "number": 1, "position": "GK"}]}
    assert [e for e in validate({"teams": [with_pos]}) if not e.startswith("NOTE")] == []
