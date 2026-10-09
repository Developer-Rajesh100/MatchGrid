"""Imports/updates real tournament data (teams, players, group assignments)
from a JSON file — see backend/data/README.md for the exact schema.

Idempotent: re-running against an updated file upserts in place (matches
teams by name, players by dcl_id or by team+number) rather than creating
duplicates. Validates the whole file before writing anything. Never touches
matches/events/lineups/standings.

Usage:
    python -m app.scripts.import_tournament_data [--file PATH] [--dry-run]
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

from pymongo.errors import DuplicateKeyError

from app.core.database import close_db, init_db
from app.models import Group, Player, Team, Tournament
from app.services.groups import assign_team_group

DEFAULT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "tournament_data.json"
VALID_GROUPS = {"A", "B"}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def validate(data: dict) -> list[str]:
    """Pure structural validation — no DB access. Returns a list of error
    strings; empty means the file is safe to import."""
    errors: list[str] = []
    teams = data.get("teams")
    if not isinstance(teams, list) or not teams:
        return ["'teams' must be a non-empty list"]

    seen_team_names: set[str] = set()
    seen_dcl_ids: set[str] = set()

    for i, team in enumerate(teams):
        prefix = f"teams[{i}]"
        name = team.get("name")
        if not name or not isinstance(name, str):
            errors.append(f"{prefix}.name is required")
            name = None
        elif name.strip().lower() in seen_team_names:
            errors.append(f"{prefix}.name '{name}' is duplicated in this file")
        elif name:
            seen_team_names.add(name.strip().lower())

        group = team.get("group")
        if group not in VALID_GROUPS:
            errors.append(f"{prefix}.group must be one of {sorted(VALID_GROUPS)}, got {group!r}")

        color = team.get("color")
        if not color or not isinstance(color, str):
            errors.append(f"{prefix}.color is required")

        players = team.get("players", [])
        if not isinstance(players, list):
            errors.append(f"{prefix}.players must be a list")
            players = []

        seen_numbers: set[int] = set()
        manager_count = 0
        for j, player in enumerate(players):
            pprefix = f"{prefix}.players[{j}]"
            pname = player.get("name")
            if not pname or not isinstance(pname, str):
                errors.append(f"{pprefix}.name is required")

            number = player.get("number")
            if not isinstance(number, int) or isinstance(number, bool) or number < 0:
                errors.append(f"{pprefix}.number must be a non-negative integer")
            elif number in seen_numbers:
                errors.append(f"{pprefix}.number {number} is duplicated within team '{name}'")
            else:
                seen_numbers.add(number)

            dcl_id = player.get("dcl_id")
            if dcl_id is not None:
                if not isinstance(dcl_id, str) or not dcl_id.strip():
                    errors.append(f"{pprefix}.dcl_id must be a non-empty string if given")
                elif dcl_id in seen_dcl_ids:
                    errors.append(f"{pprefix}.dcl_id '{dcl_id}' is duplicated in this file")
                else:
                    seen_dcl_ids.add(dcl_id)

            if player.get("is_manager") is True:
                manager_count += 1

        if manager_count > 1:
            errors.append(f"{prefix} ('{name}') has {manager_count} managers — at most one allowed")

    group_counts = {g: sum(1 for t in teams if t.get("group") == g) for g in VALID_GROUPS}
    if len(teams) != 6 or any(count != 3 for count in group_counts.values()):
        errors.append(
            "NOTE (not blocking): the tournament format is fixed at 2 groups of 3 teams "
            f"(6 total) — this file has {len(teams)} team(s), group counts {group_counts}. "
            "Import will proceed, but fixtures/semis generation expects exactly 3 per group."
        )

    return errors


async def import_data(data: dict, dry_run: bool, update_existing: bool = True) -> dict:
    """update_existing=False is create-only: records already in the database
    (matched the same way) are left completely untouched."""
    tournament = await Tournament.find_one()
    if tournament is None:
        raise RuntimeError("Tournament not found — run migrations first (python -m app.migrations.runner)")

    groups = {g.name: g for g in await Group.find(Group.tournament_id == tournament.id).to_list()}
    if not {"A", "B"} <= groups.keys():
        raise RuntimeError("Groups A/B not found — run migrations first")

    stats = {"teams_created": 0, "teams_updated": 0, "players_created": 0, "players_updated": 0}
    warnings: list[str] = []

    for team_data in data["teams"]:
        name = team_data["name"].strip()
        existing_team = await Team.find_one(Team.name == re.compile(f"^{re.escape(name)}$", re.IGNORECASE))

        if existing_team and not update_existing:
            team = existing_team
            stats["teams_skipped"] = stats.get("teams_skipped", 0) + 1
        elif existing_team:
            existing_team.name = name
            existing_team.color = team_data["color"]
            if team_data.get("logo_url"):
                existing_team.logo_url = team_data["logo_url"]
            elif not existing_team.logo_url:
                existing_team.logo_url = f"/assets/teams/{slugify(name)}.png"
            if not dry_run:
                await existing_team.save()
            team = existing_team
            stats["teams_updated"] += 1
        else:
            team = Team(
                tournament_id=tournament.id,
                name=name,
                color=team_data["color"],
                logo_url=team_data.get("logo_url") or f"/assets/teams/{slugify(name)}.png",
            )
            if not dry_run:
                await team.insert()
            stats["teams_created"] += 1

        if not dry_run and team.id and not (existing_team and not update_existing):
            await assign_team_group(team.id, groups[team_data["group"]].id)

        for player_data in team_data.get("players", []):
            dcl_id = player_data.get("dcl_id")
            existing_player = None
            if dcl_id:
                existing_player = await Player.find_one(Player.dcl_id == dcl_id)
            elif team.id:
                existing_player = await Player.find_one(
                    Player.team_id == team.id, Player.number == player_data["number"]
                )

            photo_url = player_data.get("photo_url")
            if not photo_url and dcl_id:
                photo_url = f"/assets/players/{dcl_id}.jpg"

            if existing_player and not update_existing:
                stats["players_skipped"] = stats.get("players_skipped", 0) + 1
                continue
            if existing_player:
                existing_player.name = player_data["name"]
                existing_player.number = player_data["number"]
                if photo_url:
                    existing_player.photo_url = photo_url
                if player_data.get("is_manager") is True:
                    existing_player.is_manager = True
                try:
                    if not dry_run:
                        await existing_player.save()
                except DuplicateKeyError:
                    warnings.append(
                        f"Skipped updating '{player_data['name']}' on team '{name}': "
                        f"jersey number {player_data['number']} is already used by another player"
                    )
                    continue
                stats["players_updated"] += 1
            else:
                if not dcl_id:
                    count = await Player.find_all().count()
                    dcl_id = f"DCL-{count + 1:03d}"
                    if not photo_url:
                        photo_url = f"/assets/players/{dcl_id}.jpg"
                player = Player(
                    team_id=team.id,
                    dcl_id=dcl_id,
                    name=player_data["name"],
                    number=player_data["number"],
                    is_manager=bool(player_data.get("is_manager")),
                    photo_url=photo_url,
                )
                try:
                    if not dry_run:
                        await player.insert()
                except DuplicateKeyError:
                    warnings.append(
                        f"Skipped creating '{player_data['name']}' on team '{name}': "
                        f"jersey number {player_data['number']} is already used by another player"
                    )
                    continue
                stats["players_created"] += 1

    return {"stats": stats, "warnings": warnings}


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_PATH)
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"No data file at {args.file}")
        print("See backend/data/README.md for the expected format and filename.")
        sys.exit(1)

    data = json.loads(args.file.read_text())

    all_messages = validate(data)
    errors = [e for e in all_messages if not e.startswith("NOTE")]
    notes = [e for e in all_messages if e.startswith("NOTE")]
    if errors:
        print(f"Found {len(errors)} problem(s) in {args.file} — nothing was imported:\n")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    for n in notes:
        print(f"  {n}")

    await init_db()
    try:
        result = await import_data(data, args.dry_run)
    finally:
        await close_db()

    prefix = "[DRY RUN] Would apply" if args.dry_run else "Applied"
    print(f"\n{prefix}: {result['stats']}")
    if result["warnings"]:
        print(f"\n{len(result['warnings'])} warning(s):")
        for w in result["warnings"]:
            print(f"  - {w}")


if __name__ == "__main__":
    asyncio.run(main())
