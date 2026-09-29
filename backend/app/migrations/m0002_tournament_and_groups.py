"""Creates the singleton Tournament document and its two groups (A, B) if
they don't already exist. Idempotent — safe to run against an existing DB."""

from app.core.config import get_settings
from app.models import Group, Tournament

NAME = "0002_tournament_and_groups"


async def up() -> None:
    settings = get_settings()

    tournament = await Tournament.find_one(Tournament.name == settings.tournament_name)
    if tournament is None:
        tournament = Tournament(name=settings.tournament_name, season=settings.tournament_season)
        await tournament.insert()

    for group_name in ("A", "B"):
        existing = await Group.find_one(
            Group.tournament_id == tournament.id, Group.name == group_name
        )
        if existing is None:
            await Group(tournament_id=tournament.id, name=group_name).insert()
