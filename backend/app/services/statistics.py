from beanie import PydanticObjectId

from app.models import Player, PlayerStatistics, Team
from app.schemas.statistics import LeaderboardEntryOut, LeaderboardsOut


async def get_leaderboards(tournament_id: PydanticObjectId) -> LeaderboardsOut:
    rows = await PlayerStatistics.find(PlayerStatistics.tournament_id == tournament_id).to_list()
    players = {p.id: p for p in await Player.find_all().to_list()}
    teams = {t.id: t for t in await Team.find_all().to_list()}

    def entry(row: PlayerStatistics, value: int) -> LeaderboardEntryOut | None:
        player = players.get(row.player_id)
        team = teams.get(row.team_id)
        if player is None or team is None:
            return None
        return LeaderboardEntryOut(
            player_id=str(row.player_id),
            player_name=player.name,
            team_id=str(row.team_id),
            team_name=team.name,
            value=value,
        )

    def top(rows_: list[PlayerStatistics], attr: str, require_positive: bool) -> list[LeaderboardEntryOut]:
        filtered = [r for r in rows_ if not require_positive or getattr(r, attr) > 0]
        filtered.sort(key=lambda r: getattr(r, attr), reverse=True)
        out = [entry(r, getattr(r, attr)) for r in filtered[:10]]
        return [e for e in out if e is not None]

    return LeaderboardsOut(
        top_scorers=top(rows, "goals", True),
        top_assists=top(rows, "assists", True),
        top_potm=top(rows, "potm_awards", True),
        most_appearances=top(rows, "appearances", True),
    )
