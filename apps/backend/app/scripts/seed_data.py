"""Development-only sample data seed.

Ports the reference prototype's demo roster (reference/index.html) into real
MongoDB documents, so the models/relationships/indexes/materialized-stats
pipeline can be exercised end-to-end before the user's real team/player/
schedule data is available. Safe to re-run — skips seeding if teams already
exist. Not intended for production use.

Usage:
    python -m app.scripts.seed_data
"""

import asyncio

from app.core.config import get_settings
from app.core.database import close_db, init_db
from app.models import Group, GroupTeam, Match, MatchEvent, MatchLineup, Player, Team, Tournament
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings
from app.services.tournament_stage import refresh_tournament_stage

TEAMS: list[dict] = []

GROUP_PAIRS = [(0, 1), (0, 2), (1, 2)]  # indexes into each group's teams


async def seed() -> None:
    settings = get_settings()

    tournament = await Tournament.find_one(Tournament.name == settings.tournament_name)
    if tournament is None:
        print("Tournament not found — run migrations first (python -m app.migrations.runner)")
        return

    if not TEAMS:
        print("No sample teams configured in seed_data.py — clean slate maintained (skipping seed).")
        return

    if await Team.find_all().count() > 0:
        print("Teams already exist — skipping seed (already seeded).")
        return

    group_docs = {g.name: g for g in await Group.find(Group.tournament_id == tournament.id).to_list()}

    teams_by_group: dict[str, list[Team]] = {"A": [], "B": []}
    for team_data in TEAMS:
        team = await Team(
            tournament_id=tournament.id, name=team_data["name"], color=team_data["color"]
        ).insert()
        await GroupTeam(
            tournament_id=tournament.id,
            group_id=group_docs[team_data["group"]].id,
            team_id=team.id,
        ).insert()
        teams_by_group[team_data["group"]].append(team)

        for dcl_id, name, number, is_manager in team_data["players"]:
            await Player(
                team_id=team.id,
                dcl_id=dcl_id,
                name=name,
                number=number,
                is_manager=is_manager,
                photo_url=f"/assets/players/{dcl_id}.jpg",
            ).insert()

    match_number = 1
    group_matches: dict[str, list[Match]] = {"A": [], "B": []}
    for group_name in ("A", "B"):
        teams = teams_by_group[group_name]
        for i, j in GROUP_PAIRS:
            match = await Match(
                tournament_id=tournament.id,
                match_number=match_number,
                group_id=group_docs[group_name].id,
                stage="group",
                team1_id=teams[i].id,
                team2_id=teams[j].id,
                status="upcoming",
            ).insert()
            group_matches[group_name].append(match)
            match_number += 1

    # Semi-final/Final slots are created by migration 0004 (they don't depend on
    # teams/groups, so they exist as soon as migrations have run) — not duplicated here.

    # --- Simulate one completed match so the materialized stats pipeline
    # (MatchLineup -> PlayerStatistics, MatchEvent -> TournamentStanding,
    # Match.status -> Tournament.stage) can be exercised end-to-end. ---
    demo_match = group_matches["A"][0]
    team1_players = await Player.find(Player.team_id == demo_match.team1_id).to_list()
    team2_players = await Player.find(Player.team_id == demo_match.team2_id).to_list()

    demo_match.status = "live"
    await demo_match.save()

    for player in team1_players + team2_players:
        await MatchLineup(
            match_id=demo_match.id, team_id=player.team_id, player_id=player.id
        ).insert()

    outfield1 = [p for p in team1_players if not p.is_manager]
    outfield2 = [p for p in team2_players if not p.is_manager]
    scorer1, assist1 = outfield1[-1], outfield1[-2]
    scorer2, booked = outfield2[-1], outfield2[1]

    await MatchEvent(
        match_id=demo_match.id, type="goal", team_id=demo_match.team1_id,
        player_id=scorer1.id, assist_player_id=assist1.id, minute=23,
    ).insert()
    await MatchEvent(
        match_id=demo_match.id, type="goal", team_id=demo_match.team1_id,
        player_id=scorer1.id, minute=61,
    ).insert()
    await MatchEvent(
        match_id=demo_match.id, type="goal", team_id=demo_match.team2_id,
        player_id=scorer2.id, minute=75,
    ).insert()
    await MatchEvent(
        match_id=demo_match.id, type="yellow", team_id=demo_match.team2_id,
        player_id=booked.id, minute=40,
    ).insert()
    await MatchEvent(
        match_id=demo_match.id, type="potm", team_id=demo_match.team1_id, player_id=scorer1.id,
    ).insert()

    demo_match.status = "full_time"
    await demo_match.save()

    await recalculate_group_standings(group_docs["A"].id)
    for player in [scorer1, assist1, scorer2, booked]:
        await recalculate_player_statistics(player.id)
    await refresh_tournament_stage(tournament.id)

    print("Seeded 6 teams, players, 9 matches, and one simulated completed match.")


async def main() -> None:
    await init_db()
    await seed()
    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
