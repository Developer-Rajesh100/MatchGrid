"""Refreshes the materialized Tournament.stage / champion_team_id fields.

Mirrors the reference prototype's tournamentStage() derivation (see
docs/PROJECT_ANALYSIS.md §7): group -> semis (once any semi has a team
assigned) -> final (once the final has both teams assigned) -> champions
(once the final is full_time).
"""

from beanie import PydanticObjectId

from app.models import Group, Match, MatchEvent, Tournament
from app.services.standings import sorted_group_standings


async def _determine_league_champion(tournament_id: PydanticObjectId) -> PydanticObjectId | None:
    groups = await Group.find(Group.tournament_id == tournament_id).to_list()
    if not groups:
        return None
    top_standings = []
    for g in groups:
        standings = await sorted_group_standings(g.id)
        if standings:
            top_standings.append(standings[0])
    if not top_standings:
        return None
    top_standings.sort(key=lambda s: (-s.points, -s.goal_difference, -s.goals_for))
    return top_standings[0].team_id


async def refresh_tournament_stage(tournament_id: PydanticObjectId) -> Tournament | None:
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        return None

    knockout_format = (
        tournament.config.knockout_format
        if getattr(tournament, "config", None)
        else "semis_final"
    )

    if knockout_format == "none":
        group_matches = await Match.find(
            Match.tournament_id == tournament_id, Match.stage == "group"
        ).to_list()
        if group_matches and all(m.status == "full_time" for m in group_matches):
            stage = "champions"
            champion_team_id = await _determine_league_champion(tournament_id)
        else:
            stage = "group"
            champion_team_id = None
        tournament.stage = stage
        tournament.champion_team_id = champion_team_id
        await tournament.save()
        return tournament

    final_match = await Match.find_one(
        Match.tournament_id == tournament_id, Match.stage == "final"
    )
    semi_matches = await Match.find(
        Match.tournament_id == tournament_id, Match.stage == "semi"
    ).to_list()
    quarter_matches = await Match.find(
        Match.tournament_id == tournament_id, Match.stage == "quarter"
    ).to_list()

    stage = "group"
    champion_team_id = None

    if quarter_matches and any(m.team1_id for m in quarter_matches):
        stage = "quarters"
    if semi_matches and any(m.team1_id for m in semi_matches):
        stage = "semis"
    if final_match and final_match.team1_id and final_match.team2_id:
        stage = "final"
    if final_match and final_match.status == "full_time":
        stage = "champions"
        champion_team_id = await get_match_winner(final_match)

    tournament.stage = stage
    tournament.champion_team_id = champion_team_id
    await tournament.save()
    return tournament


async def get_match_winner(match: Match) -> PydanticObjectId | None:
    """Same precedence as the reference prototype's getMatchWinnerId(): higher
    goal count wins; on a tie, fall back to the admin's manual override."""
    if match.status != "full_time" or not match.team1_id or not match.team2_id:
        return None
    events = await MatchEvent.find(MatchEvent.match_id == match.id, MatchEvent.type == "goal").to_list()
    goals1 = sum(1 for e in events if e.team_id == match.team1_id)
    goals2 = sum(1 for e in events if e.team_id == match.team2_id)
    if goals1 > goals2:
        return match.team1_id
    if goals2 > goals1:
        return match.team2_id
    return match.winner_override_id
