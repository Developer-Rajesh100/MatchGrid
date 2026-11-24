from beanie import PydanticObjectId

from app.core.errors import ValidationAppError
from app.core.websocket import broadcast
from app.models import Match, MatchLineup, Player
from app.services.player_stats import recalculate_player_statistics


async def set_lineup(match: Match, player_ids: list[str]) -> list[MatchLineup]:
    ids = [PydanticObjectId(pid) for pid in player_ids]
    if len(set(ids)) != len(ids):
        raise ValidationAppError("Duplicate player in lineup")

    players = await Player.find({"_id": {"$in": ids}}).to_list()
    players_by_id = {p.id: p for p in players}
    for pid in ids:
        player = players_by_id.get(pid)
        if player is None:
            raise ValidationAppError(f"Player {pid} not found")
        if player.team_id not in (match.team1_id, match.team2_id):
            raise ValidationAppError(f"Player {player.name} does not belong to either team in this match")

    previous = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    previous_player_ids = {entry.player_id for entry in previous}

    await MatchLineup.find(MatchLineup.match_id == match.id).delete()

    new_entries: list[MatchLineup] = []
    for pid in ids:
        player = players_by_id[pid]
        entry = MatchLineup(match_id=match.id, team_id=player.team_id, player_id=pid)
        await entry.insert()
        new_entries.append(entry)

    affected = previous_player_ids | set(ids)
    for player_id in affected:
        await recalculate_player_statistics(player_id)

    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return new_entries
