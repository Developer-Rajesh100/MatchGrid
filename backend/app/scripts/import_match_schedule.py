"""Imports/updates the real match schedule (dates, times, venues, and — for
group matches — team pairings) from a JSON file. See backend/data/README.md
for the schema.

Idempotent: matches are keyed by match_number (1-9, the tournament's fixed
slot numbering — see docs/PROJECT_ANALYSIS.md §4). Re-running upserts in
place. Never touches status/score/events — those are owned by the match
lifecycle endpoints (start/end/reopen/cancel), not this importer.

Usage:
    python -m app.scripts.import_match_schedule [--file PATH] [--dry-run]
"""

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

from app.core.database import close_db, init_db
from app.models import Group, Match, Team, Tournament

DEFAULT_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "match_schedule.json"
VALID_STAGES = {"group", "semi", "final"}
VALID_GROUPS = {"A", "B"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def validate_structure(data: dict) -> list[str]:
    """Pure structural validation — no DB access."""
    errors: list[str] = []
    matches = data.get("matches")
    if not isinstance(matches, list) or not matches:
        return ["'matches' must be a non-empty list"]

    seen_numbers: set[int] = set()
    for i, m in enumerate(matches):
        prefix = f"matches[{i}]"
        number = m.get("match_number")
        if not isinstance(number, int) or isinstance(number, bool) or number < 1:
            errors.append(f"{prefix}.match_number must be a positive integer")
        elif number in seen_numbers:
            errors.append(f"{prefix}.match_number {number} is duplicated in this file")
        else:
            seen_numbers.add(number)

        stage = m.get("stage")
        if stage not in VALID_STAGES:
            errors.append(f"{prefix}.stage must be one of {sorted(VALID_STAGES)}, got {stage!r}")

        group = m.get("group")
        if stage == "group" and group not in VALID_GROUPS:
            errors.append(f"{prefix}.group must be one of {sorted(VALID_GROUPS)} when stage='group'")
        if stage in ("semi", "final") and group is not None:
            errors.append(f"{prefix}.group must be null when stage='{stage}'")

        for field, pattern, label in (("date", DATE_RE, "YYYY-MM-DD"), ("time", TIME_RE, "HH:MM")):
            value = m.get(field)
            if value is not None and (not isinstance(value, str) or not pattern.match(value)):
                errors.append(f"{prefix}.{field} must match {label} if given, got {value!r}")

        duration = m.get("duration_minutes")
        if duration is not None and (not isinstance(duration, int) or duration < 1):
            errors.append(f"{prefix}.duration_minutes must be a positive integer if given")

        for field in ("team1", "team2"):
            value = m.get(field)
            if value is not None and not isinstance(value, str):
                errors.append(f"{prefix}.{field} must be a string if given")

    return errors


async def validate_teams(data: dict) -> list[str]:
    """DB-aware validation: every named team must actually exist."""
    errors: list[str] = []
    for i, m in enumerate(data["matches"]):
        for field in ("team1", "team2"):
            name = m.get(field)
            if name:
                team = await Team.find_one(Team.name == re.compile(f"^{re.escape(name)}$", re.IGNORECASE))
                if team is None:
                    errors.append(f"matches[{i}].{field} '{name}' does not match any existing team")
    return errors


async def import_schedule(data: dict, dry_run: bool) -> dict:
    tournament = await Tournament.find_one()
    if tournament is None:
        raise RuntimeError("Tournament not found — run migrations first")
    groups = {g.name: g for g in await Group.find(Group.tournament_id == tournament.id).to_list()}
    teams_by_name = {t.name.lower(): t for t in await Team.find_all().to_list()}

    stats = {"created": 0, "updated": 0}

    for m in data["matches"]:
        existing = await Match.find_one(
            Match.tournament_id == tournament.id, Match.match_number == m["match_number"]
        )
        group_id = groups[m["group"]].id if m.get("group") else None
        team1_id = teams_by_name[m["team1"].lower()].id if m.get("team1") else None
        team2_id = teams_by_name[m["team2"].lower()].id if m.get("team2") else None

        if existing:
            existing.stage = m["stage"]
            existing.group_id = group_id
            if m.get("label") is not None:
                existing.label = m["label"]
            if team1_id is not None:
                existing.team1_id = team1_id
            if team2_id is not None:
                existing.team2_id = team2_id
            for field in ("date", "time", "venue", "duration_minutes", "notes"):
                if m.get(field) is not None:
                    setattr(existing, field, m[field])
            if not dry_run:
                await existing.save()
            stats["updated"] += 1
        else:
            match = Match(
                tournament_id=tournament.id,
                match_number=m["match_number"],
                group_id=group_id,
                stage=m["stage"],
                label=m.get("label"),
                date=m.get("date"),
                time=m.get("time"),
                venue=m.get("venue"),
                duration_minutes=m.get("duration_minutes"),
                notes=m.get("notes"),
                team1_id=team1_id,
                team2_id=team2_id,
                status="upcoming",
            )
            if not dry_run:
                await match.insert()
            stats["created"] += 1

    return stats


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_PATH)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"No schedule file at {args.file}")
        print("See backend/data/README.md for the expected format and filename.")
        sys.exit(1)

    data = json.loads(args.file.read_text())

    errors = validate_structure(data)
    if errors:
        print(f"Found {len(errors)} problem(s) in {args.file} — nothing was imported:\n")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    await init_db()
    try:
        team_errors = await validate_teams(data)
        if team_errors:
            print(f"Found {len(team_errors)} problem(s) — nothing was imported:\n")
            for e in team_errors:
                print(f"  - {e}")
            sys.exit(1)

        result = await import_schedule(data, args.dry_run)
    finally:
        await close_db()

    prefix = "[DRY RUN] Would apply" if args.dry_run else "Applied"
    print(f"{prefix}: {result}")


if __name__ == "__main__":
    asyncio.run(main())
