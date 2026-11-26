"""Pure scoring rules shared by every place that turns goal events into a result."""

from beanie import PydanticObjectId

from app.models import Match


def count_goals(match: Match, goal_events) -> tuple[int, int]:
    """(team1 goals, team2 goals) from a match's goal events."""
    return (
        sum(1 for e in goal_events if e.team_id == match.team1_id),
        sum(1 for e in goal_events if e.team_id == match.team2_id),
    )


def winner_from_score(match: Match, goals1: int, goals2: int) -> PydanticObjectId | None:
    """Same precedence as the reference prototype's getMatchWinnerId(): higher goal count wins;
    on a tie, the manual (e.g. penalty shoot-out) override. Only a finished match has a winner."""
    if match.status != "full_time" or not match.team1_id or not match.team2_id:
        return None
    if goals1 > goals2:
        return match.team1_id
    if goals2 > goals1:
        return match.team2_id
    return match.winner_override_id
