"""Document -> response-schema conversion helpers, shared across routers.

Kept explicit (rather than generic from_attributes magic) so ObjectId->str
conversion and any joined/computed fields (team name, score, etc.) are easy
to see and adjust per resource.
"""

from datetime import datetime, timezone
from typing import Optional

from app.models import Group, GroupTeam, Match, MatchEvent, Player, Team, Tournament, TournamentConfig, User
from app.schemas.auth import UserOut
from app.schemas.group import GroupOut
from app.schemas.match import MatchAdminOut, MatchOut
from app.schemas.match_event import MatchEventOut
from app.schemas.player import PlayerOut
from app.schemas.team import TeamOut
from app.schemas.tournament import TournamentOut


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        organization_name=user.organization_name,
        created_by=str(user.created_by) if user.created_by else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


def tournament_to_out(t: Tournament, live_matches_count: int = 0) -> TournamentOut:
    return TournamentOut(
        id=str(t.id),
        name=t.name,
        season=t.season,
        format_description=t.format_description,
        stage=t.stage,
        champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
        organizer_id=str(t.organizer_id) if t.organizer_id else None,
        slug=t.slug,
        status=t.status,
        logo_url=t.logo_url,
        banner_url=t.banner_url,
        config=t.config or TournamentConfig(),
        live_matches_count=live_matches_count,
    )


def group_to_out(group: Group) -> GroupOut:
    return GroupOut(id=str(group.id), tournament_id=str(group.tournament_id), name=group.name)


def team_to_out(
    team: Team,
    group_team: Optional[GroupTeam] = None,
    group: Optional[Group] = None,
    player_count: Optional[int] = None,
) -> TeamOut:
    crest = team.crest
    return TeamOut(
        id=str(team.id),
        tournament_id=str(team.tournament_id),
        name=team.name,
        color=team.color,
        crest_url=crest,
        logo_url=crest,
        group_id=str(group_team.group_id) if group_team else None,
        group_name=group.name if group else None,
        player_count=player_count,
    )


def player_to_out(player: Player, team: Optional[Team] = None) -> PlayerOut:
    tournament_id = player.tournament_id or (team.tournament_id if team else None)
    return PlayerOut(
        id=str(player.id),
        tournament_id=str(tournament_id) if tournament_id else None,
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
    tournament_name: Optional[str] = None,
    tournament_slug: Optional[str] = None,
    include_scorers: bool = False,
) -> MatchOut:
    team1 = teams.get(match.team1_id)
    team2 = teams.get(match.team2_id)
    fields = dict(
        id=str(match.id),
        tournament_id=str(match.tournament_id),
        tournament_name=tournament_name,
        tournament_slug=tournament_slug,
        match_number=match.match_number,
        group_id=str(match.group_id) if match.group_id else None,
        group_name=group_name,
        stage=match.stage,
        label=match.label,
        bracket_slot=getattr(match, "bracket_slot", None),
        round_order=getattr(match, "round_order", None),
        date=match.date,
        time=match.time,
        venue=match.venue,
        duration_minutes=match.duration_minutes,
        notes=match.notes,
        team1_id=str(match.team1_id) if match.team1_id else None,
        team1_name=team1.name if team1 else None,
        team1_crest_url=team1.crest if team1 else None,
        team1_color=team1.color if team1 else None,
        team2_id=str(match.team2_id) if match.team2_id else None,
        team2_name=team2.name if team2 else None,
        team2_crest_url=team2.crest if team2 else None,
        team2_color=team2.color if team2 else None,
        status=match.status,
        score1=score1,
        score2=score2,
        winner_id=str(winner_id) if winner_id else None,
        started_at=match.started_at,
        ended_at=match.ended_at,
        is_half_time=match.is_half_time,
        elapsed_seconds=match.elapsed_seconds,
        server_now=datetime.now(timezone.utc),
    )
    if include_scorers:
        # Staff-only endpoints. Public responses never carry scorer account ids.
        return MatchAdminOut(
            **fields,
            assigned_scorer_ids=[str(sid) for sid in (getattr(match, "assigned_scorer_ids", None) or [])],
        )
    return MatchOut(**fields)
