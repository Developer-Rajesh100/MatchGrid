"""Tournament lifecycle helpers shared by the organizer and superadmin routers."""

from beanie import PydanticObjectId

from app.models import (
    Group,
    GroupTeam,
    Match,
    MatchEvent,
    MatchLineup,
    Player,
    PlayerStatistics,
    Team,
    Tournament,
    TournamentStanding,
)
from app.services.storage import get_storage_service


async def delete_tournament_cascade(tournament: Tournament) -> None:
    """Permanently deletes a tournament and everything that hangs off it.

    Database rows go first (children before the tournament); the tournament's R2
    folder is purged only after that, so a storage failure can never leave rows
    pointing at deleted images."""
    tid: PydanticObjectId = tournament.id

    match_ids = [m.id for m in await Match.find(Match.tournament_id == tid).to_list()]
    if match_ids:
        await MatchEvent.find({"match_id": {"$in": match_ids}}).delete()
        await MatchLineup.find({"match_id": {"$in": match_ids}}).delete()
    await Match.find(Match.tournament_id == tid).delete()
    await PlayerStatistics.find(PlayerStatistics.tournament_id == tid).delete()
    await TournamentStanding.find(TournamentStanding.tournament_id == tid).delete()
    await GroupTeam.find(GroupTeam.tournament_id == tid).delete()
    await Player.find(Player.tournament_id == tid).delete()
    team_ids = [t.id for t in await Team.find(Team.tournament_id == tid).to_list()]
    if team_ids:
        # Players created before m0005 may lack tournament_id; catch them via their team.
        await Player.find({"team_id": {"$in": team_ids}}).delete()
    await Team.find(Team.tournament_id == tid).delete()
    await Group.find(Group.tournament_id == tid).delete()
    await tournament.delete()

    await get_storage_service().delete_prefix(f"tournaments/{tid}/")
