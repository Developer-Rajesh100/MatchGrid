"""Recomputes the materialized PlayerStatistics rows (write-through cache).

Appearances come from real MatchLineup entries, not merely "the player's team played" (see
MatchLineup's docstring). Admin-created "extra" matches (friendlies) are not part of the
tournament record and never count.

Everything is batched: recomputing N players (a saved lineup, a purged group) costs a fixed
handful of queries plus one write per player, never several queries per player.
"""

from collections import Counter
from collections.abc import Iterable

from beanie import PydanticObjectId

from app.models import Match, MatchEvent, MatchLineup, Player, PlayerStatistics, Team

_EVENT_STAT = {"goal": "goals", "yellow": "yellow_cards", "red": "red_cards", "potm": "potm_awards"}
_STAT_FIELDS = ("appearances", "goals", "assists", "yellow_cards", "red_cards", "potm_awards")


async def recalculate_players_statistics(
    player_ids: Iterable[PydanticObjectId],
) -> dict[PydanticObjectId, PlayerStatistics]:
    """Recomputes the statistics of every given player. Players that no longer exist are skipped."""
    ids = list({pid for pid in player_ids if pid is not None})
    if not ids:
        return {}
    players = await Player.find({"_id": {"$in": ids}}).to_list()
    if not players:
        return {}
    ids = [p.id for p in players]

    # Players created before multi-tenancy may lack tournament_id: take it from their team.
    teams_needed = {p.team_id for p in players if p.tournament_id is None}
    team_tournament = (
        {t.id: t.tournament_id for t in await Team.find({"_id": {"$in": list(teams_needed)}}).to_list()}
        if teams_needed
        else {}
    )
    tournament_of = {p.id: p.tournament_id or team_tournament.get(p.team_id) for p in players}

    tournament_ids = {tid for tid in tournament_of.values() if tid}
    extra_ids = [
        m.id
        for m in await Match.find(
            {"stage": "extra", "tournament_id": {"$in": list(tournament_ids)}}
        ).to_list()
    ]

    appearances: Counter = Counter()
    async for row in MatchLineup.get_pymongo_collection().aggregate(
        [
            {"$match": {"player_id": {"$in": ids}, "match_id": {"$nin": extra_ids}}},
            {"$group": {"_id": "$player_id", "n": {"$sum": 1}}},
        ]
    ):
        appearances[row["_id"]] = row["n"]

    counts: dict[PydanticObjectId, Counter] = {pid: Counter() for pid in ids}
    events = await MatchEvent.find(
        {
            "$or": [{"player_id": {"$in": ids}}, {"assist_player_id": {"$in": ids}}],
            "match_id": {"$nin": extra_ids},
        }
    ).to_list()
    for e in events:
        if e.player_id in counts and e.type in _EVENT_STAT:
            counts[e.player_id][_EVENT_STAT[e.type]] += 1
        if e.type == "goal" and e.assist_player_id in counts:
            counts[e.assist_player_id]["assists"] += 1

    existing = {
        s.player_id: s for s in await PlayerStatistics.find({"player_id": {"$in": ids}}).to_list()
    }
    results: dict[PydanticObjectId, PlayerStatistics] = {}
    for player in players:
        stats = existing.get(player.id)
        if stats is None:
            tournament_id = tournament_of[player.id]
            if tournament_id is None:
                continue  # an orphaned player with no tournament has no tournament record
            stats = PlayerStatistics(tournament_id=tournament_id, player_id=player.id, team_id=player.team_id)
        stats.team_id = player.team_id
        stats.appearances = appearances[player.id]
        for field in _STAT_FIELDS[1:]:
            setattr(stats, field, counts[player.id][field])
        await stats.save()
        results[player.id] = stats
    return results


async def recalculate_player_statistics(player_id: PydanticObjectId) -> PlayerStatistics | None:
    """Single-player convenience wrapper around recalculate_players_statistics()."""
    return (await recalculate_players_statistics([player_id])).get(player_id)


def is_empty(stats: PlayerStatistics) -> bool:
    return not any(getattr(stats, field) for field in _STAT_FIELDS)
