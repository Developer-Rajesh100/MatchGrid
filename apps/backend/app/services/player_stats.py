"""Recomputes the materialized PlayerStatistics row for one player.

Unlike the reference prototype (which counted "appearances" as simply "the
player's team played this match"), appearances here come from real
MatchLineup entries — see MatchLineup's docstring and
docs/PROJECT_ANALYSIS.md §7 for why this closes a known prototype gap.
"""

from beanie import PydanticObjectId

from app.models import Match, MatchEvent, MatchLineup, Player, PlayerStatistics, Team


async def recalculate_player_statistics(player_id: PydanticObjectId) -> PlayerStatistics | None:
    player = await Player.get(player_id)
    if player is None:
        return None

    # Admin-created "extra" matches (friendlies) are not part of the tournament record.
    # Only this player's own tournament can contain matches they took part in.
    tournament_id = player.tournament_id
    if tournament_id is None:
        team = await Team.get(player.team_id)
        tournament_id = team.tournament_id if team else None
    extra_ids = [
        m.id
        for m in await Match.find(Match.stage == "extra", Match.tournament_id == tournament_id).to_list()
    ]

    appearances = await MatchLineup.find(
        {"player_id": player_id, "match_id": {"$nin": extra_ids}}
    ).count()

    # One query for every event touching this player (as the primary player
    # or as an assist provider), instead of 5 separate .count() queries (one
    # per stat category) — this function runs in a loop over every affected
    # player whenever a lineup is saved (up to ~16 players at once) or an
    # event is added/removed, so the per-call query count compounds directly
    # into admin-panel latency. Found during the Timer/Half-Time audit's
    # Performance & Scalability follow-up.
    events = await MatchEvent.find(
        {
            "$or": [{"player_id": player_id}, {"assist_player_id": player_id}],
            "match_id": {"$nin": extra_ids},
        }
    ).to_list()
    goals = sum(1 for e in events if e.player_id == player_id and e.type == "goal")
    assists = sum(1 for e in events if e.assist_player_id == player_id and e.type == "goal")
    yellow_cards = sum(1 for e in events if e.player_id == player_id and e.type == "yellow")
    red_cards = sum(1 for e in events if e.player_id == player_id and e.type == "red")
    potm_awards = sum(1 for e in events if e.player_id == player_id and e.type == "potm")

    stats = await PlayerStatistics.find_one(PlayerStatistics.player_id == player_id)
    if stats is None:
        team = await Team.get(player.team_id)
        stats = PlayerStatistics(
            tournament_id=team.tournament_id, player_id=player_id, team_id=player.team_id
        )

    stats.team_id = player.team_id
    stats.appearances = appearances
    stats.goals = goals
    stats.assists = assists
    stats.yellow_cards = yellow_cards
    stats.red_cards = red_cards
    stats.potm_awards = potm_awards
    await stats.save()
    return stats
