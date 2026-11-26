from beanie import PydanticObjectId

from app.core.errors import ValidationAppError
from app.core.websocket import broadcast
from app.models import Match, MatchLineup, Player
from app.services.player_stats import recalculate_players_statistics


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
    previous_by_player = {entry.player_id: entry for entry in previous}
    previous_player_ids = set(previous_by_player)

    # Add what is new first, then remove what is gone, never wiping the lineup in between:
    # a failure part-way leaves the old lineup plus some additions, not an empty team sheet.
    # Players who stay keep their existing row.
    to_add = [
        MatchLineup(match_id=match.id, team_id=players_by_id[pid].team_id, player_id=pid)
        for pid in ids
        if pid not in previous_by_player
    ]
    if to_add:
        await MatchLineup.insert_many(to_add)
    stale_ids = [entry.id for pid, entry in previous_by_player.items() if pid not in set(ids)]
    if stale_ids:
        await MatchLineup.find({"_id": {"$in": stale_ids}}).delete()

    kept = [previous_by_player[pid] for pid in ids if pid in previous_by_player]
    new_entries: list[MatchLineup] = kept + to_add
    new_entries.sort(key=lambda e: ids.index(e.player_id))

    await recalculate_players_statistics(previous_player_ids | set(ids))

    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return new_entries
