from app.models.group import Group
from app.models.group_team import GroupTeam
from app.models.match import Match
from app.models.match_event import MatchEvent
from app.models.match_lineup import MatchLineup
from app.models.player import Player
from app.models.player_statistics import PlayerStatistics
from app.models.team import Team
from app.models.tournament import Tournament, TournamentConfig
from app.models.tournament_standing import TournamentStanding
from app.models.user import User, UserRole

DOCUMENT_MODELS = [
    User,
    Tournament,
    Team,
    Group,
    GroupTeam,
    Player,
    Match,
    MatchEvent,
    MatchLineup,
    TournamentStanding,
    PlayerStatistics,
]

__all__ = [
    "User",
    "UserRole",
    "Tournament",
    "TournamentConfig",
    "Team",
    "Group",
    "GroupTeam",
    "Player",
    "Match",
    "MatchEvent",
    "MatchLineup",
    "TournamentStanding",
    "PlayerStatistics",
    "DOCUMENT_MODELS",
]
