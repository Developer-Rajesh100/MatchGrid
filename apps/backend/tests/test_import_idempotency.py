"""Import-script idempotency: run each importer twice and assert no
duplicates are created, per implementation.txt Phase 8.2."""

import json
from pathlib import Path

from app.models import GroupTeam, Match, Player, Team
from app.scripts.import_match_schedule import import_schedule
from app.scripts.import_tournament_data import import_data

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


async def test_tournament_data_import_is_idempotent(tournament, groups):
    data = json.loads((DATA_DIR / "tournament_data.example.json").read_text())

    result1 = await import_data(data, dry_run=False)
    first_team_count = await Team.find_all().count()
    first_player_count = await Player.find_all().count()
    first_group_team_count = await GroupTeam.find_all().count()
    assert first_team_count == len(data["teams"])
    assert result1["stats"]["teams_created"] == len(data["teams"])
    assert first_player_count > 0

    result2 = await import_data(data, dry_run=False)  # run again, unchanged input
    assert await Team.find_all().count() == first_team_count
    assert await Player.find_all().count() == first_player_count
    assert await GroupTeam.find_all().count() == first_group_team_count
    assert result2["stats"]["teams_created"] == 0
    assert result2["stats"]["teams_updated"] == len(data["teams"])


async def test_match_schedule_import_is_idempotent(tournament, groups, teams):
    data = json.loads((DATA_DIR / "match_schedule.example.json").read_text())

    result1 = await import_schedule(data, dry_run=False)
    first_match_count = await Match.find_all().count()
    assert first_match_count == len(data["matches"])
    assert result1["created"] == len(data["matches"])

    result2 = await import_schedule(data, dry_run=False)
    assert await Match.find_all().count() == first_match_count  # no duplicates
    assert result2["created"] == 0
    assert result2["updated"] == len(data["matches"])


async def test_match_schedule_import_upserts_scheduling_fields_without_touching_status(
    tournament, groups, teams
):
    data = json.loads((DATA_DIR / "match_schedule.example.json").read_text())
    await import_schedule(data, dry_run=False)

    match = await Match.find_one(Match.tournament_id == tournament.id, Match.match_number == 1)
    assert match.status == "upcoming"  # importer never sets status
    match.status = "live"
    await match.save()

    await import_schedule(data, dry_run=False)  # re-import with the same data
    match = await Match.get(match.id)
    assert match.status == "live"  # untouched by the re-import
    assert match.venue == data["matches"][0]["venue"]  # scheduling fields still applied
