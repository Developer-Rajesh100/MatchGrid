"""Resets specific matches back to the scheduled / not-started state, and can
clear specific matches' kickoff times.

Touches ONLY the matches named on the command line. For each --reset match it:
  - sets status back to "upcoming" and clears score-related state (start/end
    timestamps, timer, half-time flag, winner override),
  - deletes that match's events and lineup,
  - recomputes the affected players' statistics, the group standings and the
    tournament stage from what remains.
For each --clear-time match it only sets `time` to null.
Teams, players, assignments, dates, venues and every other match are untouched.

Dry-run by default (prints what it would do). Nothing is written without --apply,
and --apply first writes a JSON backup of every document it may change.

Usage (from backend/, with MONGO_URI / MONGO_DB_NAME in the environment):
    python -m app.scripts.reset_matches --reset 1 2 --clear-time 1 2 3            # dry run
    python -m app.scripts.reset_matches --reset 1 2 --clear-time 1 2 3 --apply
"""

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util

from app.core.database import close_db, init_db
from app.models import Match, MatchEvent, MatchLineup, PlayerStatistics, Tournament, TournamentStanding
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings
from app.services.tournament_stage import refresh_tournament_stage


async def _get_match(number: int) -> Match:
    match = await Match.find_one(Match.match_number == number)
    if match is None:
        raise SystemExit(f"Match {number} not found — nothing changed.")
    return match


async def reset_matches(
    reset_numbers: list[int], clear_time_numbers: list[int], apply: bool, backup_file: Path | None
) -> list[str]:
    log: list[str] = []
    tournament = await Tournament.find_one()
    if tournament is None:
        raise SystemExit("No tournament found — nothing changed.")

    to_reset = [await _get_match(n) for n in reset_numbers]
    to_clear = [await _get_match(n) for n in clear_time_numbers]

    for m in to_reset:
        if m.status == "live":
            raise SystemExit(f"Match {m.match_number} is LIVE — refusing to touch a live match.")
        if m.status == "cancelled":
            raise SystemExit(f"Match {m.match_number} is cancelled — refusing; restore it from the admin panel.")

    plan: list[str] = []
    affected_players = set()
    group_ids = set()
    for m in to_reset:
        events = await MatchEvent.find(MatchEvent.match_id == m.id).to_list()
        lineup = await MatchLineup.find(MatchLineup.match_id == m.id).count()
        affected_players |= {e.player_id for e in events} | {e.assist_player_id for e in events if e.assist_player_id}
        if m.stage == "group" and m.group_id:
            group_ids.add(m.group_id)
        plan.append(
            f"Match {m.match_number}: status {m.status} -> upcoming; delete {len(events)} event(s) and "
            f"{lineup} lineup row(s); clear timer/timestamps"
        )
    for m in to_clear:
        plan.append(f"Match {m.match_number}: kickoff time {m.time!r} -> unset")
    log.extend(plan)

    if not apply:
        log.append("DRY RUN — nothing was written. Re-run with --apply to make these changes.")
        return log

    # ---- backup everything we may change, before changing anything
    ids = {m.id for m in to_reset + to_clear}
    backup = {
        "created_at": datetime.now(timezone.utc),
        "matches": [m.model_dump(mode="python") for m in await Match.find({"_id": {"$in": list(ids)}}).to_list()],
        "match_events": [e.model_dump(mode="python") for e in await MatchEvent.find({"match_id": {"$in": [m.id for m in to_reset]}}).to_list()],
        "match_lineups": [l.model_dump(mode="python") for l in await MatchLineup.find({"match_id": {"$in": [m.id for m in to_reset]}}).to_list()],
        "player_statistics": [s.model_dump(mode="python") for s in await PlayerStatistics.find({"player_id": {"$in": list(affected_players)}}).to_list()],
        "tournament_standings": [s.model_dump(mode="python") for s in await TournamentStanding.find({"group_id": {"$in": list(group_ids)}}).to_list()],
        "tournament": tournament.model_dump(mode="python"),
    }
    backup_file = backup_file or Path(f"reset_matches_backup_{datetime.now():%Y%m%d-%H%M%S}.json")
    backup_file.write_text(json_util.dumps(backup, indent=1))
    log.append(f"Backup of affected documents written to {backup_file}")

    now = datetime.now(timezone.utc)
    for m in to_reset:
        await MatchEvent.find(MatchEvent.match_id == m.id).delete()
        await MatchLineup.find(MatchLineup.match_id == m.id).delete()
        m.status = "upcoming"
        m.started_at = m.ended_at = m.elapsed_seconds = m.winner_override_id = None
        m.is_half_time = False
        m.updated_at = now
        await m.save()

    for pid in affected_players:
        await recalculate_player_statistics(pid)
        s = await PlayerStatistics.find_one(PlayerStatistics.player_id == pid)
        if s and not any([s.goals, s.assists, s.yellow_cards, s.red_cards, s.potm_awards, s.appearances]):
            await s.delete()
    for gid in group_ids:
        await recalculate_group_standings(gid)

    for m in to_clear:
        fresh = await Match.get(m.id)
        fresh.time = None
        fresh.updated_at = now
        await fresh.save()

    await refresh_tournament_stage(tournament.id)
    log.append("APPLIED.")
    return log


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", type=int, nargs="*", default=[], metavar="N", help="match numbers to reset to not-started")
    parser.add_argument("--clear-time", type=int, nargs="*", default=[], metavar="N", help="match numbers whose kickoff time to unset")
    parser.add_argument("--apply", action="store_true", help="actually write (default is a dry run)")
    parser.add_argument("--backup-file", type=Path, default=None)
    args = parser.parse_args()
    if not args.reset and not args.clear_time:
        parser.error("nothing to do: pass --reset and/or --clear-time")

    await init_db()
    try:
        for line in await reset_matches(args.reset, args.clear_time, args.apply, args.backup_file):
            print(line)
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(0)
