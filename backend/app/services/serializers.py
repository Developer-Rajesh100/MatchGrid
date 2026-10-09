"""Document -> response-schema conversion helpers, shared across routers.

Kept explicit (rather than generic from_attributes magic) so ObjectId->str
conversion and any joined/computed fields (team name, score, etc.) are easy
to see and adjust per resource.
"""

from typing import Optional

from app.models import Group, GroupTeam, Match, MatchEvent, Player, Team
from app.schemas.group import GroupOut
from app.schemas.match import MatchOut
from app.schemas.match_event import MatchEventOut
from app.schemas.player import PlayerOut
from app.schemas.team import TeamOut


def group_to_out(group: Group) -> GroupOut:
    return GroupOut(id=str(group.id), tournament_id=str(group.tournament_id), name=group.name)


def team_to_out(
    team: Team,
    group_team: Optional[GroupTeam] = None,
    group: Optional[Group] = None,
    player_count: Optional[int] = None,
) -> TeamOut:
    return TeamOut(
        id=str(team.id),
        tournament_id=str(team.tournament_id),
        name=team.name,
        color=team.color,
        logo_url=team.logo_url,
        group_id=str(group_team.group_id) if group_team else None,
        group_name=group.name if group else None,
        player_count=player_count,
    )


def player_to_out(player: Player, team: Optional[Team] = None) -> PlayerOut:
    return PlayerOut(
        id=str(player.id),
        team_id=str(player.team_id),
        team_name=team.name if team else None,
        team_color=team.color if team else None,
        dcl_id=player.dcl_id,
        name=player.name,
        number=player.number,
        is_manager=player.is_manager,
        photo_url=player.photo_url,
    )


def match_event_to_out(event: MatchEvent, players: dict) -> MatchEventOut:
    scorer = players.get(event.player_id)
    assist = players.get(event.assist_player_id) if event.assist_player_id else None
    return MatchEventOut(
        id=str(event.id),
        match_id=str(event.match_id),
        type=event.type,
        team_id=str(event.team_id),
        player_id=str(event.player_id),
        player_name=scorer.name if scorer else None,
        assist_player_id=str(event.assist_player_id) if event.assist_player_id else None,
        assist_player_name=assist.name if assist else None,
        minute=event.minute,
    )


def match_to_out(
    match: Match,
    teams: dict,
    score1: int,
    score2: int,
    winner_id=None,
    group_name: Optional[str] = None,
) -> MatchOut:
    team1 = teams.get(match.team1_id)
    team2 = teams.get(match.team2_id)
    return MatchOut(
        id=str(match.id),
        tournament_id=str(match.tournament_id),
        match_number=match.match_number,
        group_id=str(match.group_id) if match.group_id else None,
        group_name=group_name,
        stage=match.stage,
        label=match.label,
        date=match.date,
        time=match.time,
        venue=match.venue,
        duration_minutes=match.duration_minutes,
        notes=match.notes,
        team1_id=str(match.team1_id) if match.team1_id else None,
        team1_name=team1.name if team1 else None,
        team2_id=str(match.team2_id) if match.team2_id else None,
        team2_name=team2.name if team2 else None,
        status=match.status,
        score1=score1,
        score2=score2,
        winner_id=str(winner_id) if winner_id else None,
        started_at=match.started_at,
        ended_at=match.ended_at,
        # Plain attribute access, not getattr(..., default) — Beanie/Pydantic
        # already apply the model's field defaults (False / None) when loading
        # a document saved before these fields existed, so the defensive
        # getattr was redundant (verified against the dev database's
        # pre-Timer-feature match documents during the Timer/Half-Time audit).
        is_half_time=match.is_half_time,
        elapsed_seconds=match.elapsed_seconds,
    )
