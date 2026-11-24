from beanie import PydanticObjectId

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.websocket import broadcast
from app.models import Match, MatchEvent, Player
from app.schemas.match_event import MatchEventCreate
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings
from app.services.tournament_stage import refresh_tournament_stage


async def _validate_team_and_player(
    match: Match, team_id: PydanticObjectId, player_id: PydanticObjectId
) -> Player:
    if team_id not in (match.team1_id, match.team2_id):
        raise ValidationAppError("team_id must be one of the two teams in this match")
    player = await Player.get(player_id)
    if player is None:
        raise NotFoundError("Player not found")
    if player.team_id != team_id:
        raise ValidationAppError("player does not belong to the selected team")
    return player


async def _after_mutation(match: Match, affected_player_ids: set[PydanticObjectId]) -> None:
    if match.stage == "group" and match.group_id:
        await recalculate_group_standings(match.group_id)
    for player_id in affected_player_ids:
        await recalculate_player_statistics(player_id)
    await refresh_tournament_stage(match.tournament_id)


async def add_event(
    match: Match, payload: MatchEventCreate, admin_id: PydanticObjectId
) -> MatchEvent:
    if match.status == "upcoming":
        raise ConflictError("Cannot record events on a match that hasn't started")

    team_id = PydanticObjectId(payload.team_id)
    player_id = PydanticObjectId(payload.player_id)
    await _validate_team_and_player(match, team_id, player_id)

    assist_player_id: PydanticObjectId | None = None
    if payload.type == "goal" and payload.assist_player_id:
        assist_player_id = PydanticObjectId(payload.assist_player_id)
        if assist_player_id == player_id:
            raise ValidationAppError("A player cannot assist their own goal")
        await _validate_team_and_player(match, team_id, assist_player_id)
    elif payload.assist_player_id and payload.type != "goal":
        raise ValidationAppError("Only goal events can have an assist")

    minute = payload.minute
    if payload.type == "potm":
        minute = None
        await MatchEvent.find(MatchEvent.match_id == match.id, MatchEvent.type == "potm").delete()
    elif minute is None:
        raise ValidationAppError("minute is required for goal, yellow, and red events")

    event = MatchEvent(
        match_id=match.id,
        type=payload.type,
        team_id=team_id,
        player_id=player_id,
        assist_player_id=assist_player_id,
        minute=minute,
        created_by=admin_id,
    )
    await event.insert()

    affected = {player_id}
    if assist_player_id:
        affected.add(assist_player_id)
    await _after_mutation(match, affected)
    await broadcast({"type": "match_event_added", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return event


async def remove_event(match: Match, event_id: PydanticObjectId) -> None:
    event = await MatchEvent.get(event_id)
    if event is None or event.match_id != match.id:
        raise NotFoundError("Event not found on this match")

    affected = {event.player_id}
    if event.assist_player_id:
        affected.add(event.assist_player_id)

    await event.delete()
    await _after_mutation(match, affected)
    await broadcast({"type": "match_event_removed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
