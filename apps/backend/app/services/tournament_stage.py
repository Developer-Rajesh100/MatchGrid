"""Refreshes the materialized Tournament.stage / champion_team_id fields.

Mirrors the reference prototype's tournamentStage() derivation (see
docs/PROJECT_ANALYSIS.md §7): group -> semis (once any semi has a team
assigned) -> final (once the final has both teams assigned) -> champions
(once the final is full_time).
"""

from beanie import PydanticObjectId

from app.models import Match, MatchEvent, Tournament


async def refresh_tournament_stage(tournament_id: PydanticObjectId) -> Tournament | None:
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        return None

    final_match = await Match.find_one(
        Match.tournament_id == tournament_id, Match.stage == "final"
    )
    semi_matches = await Match.find(
        Match.tournament_id == tournament_id, Match.stage == "semi"
    ).to_list()

    stage = "group"
    champion_team_id = None

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
