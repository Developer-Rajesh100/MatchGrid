"""Shared helper for scoping list queries to the one real Tournament.

This app has exactly one Tournament document by design (see
app/models/tournament.py). Before this fix, every list endpoint queried its
collection unconditionally (Team.find_all(), Match.find(filters) with no
tournament_id, etc.), which meant a single stray document with a wrong or
missing tournament_id was indistinguishable from real data and leaked
straight into the public API — exactly what happened in the Timer/Half-Time
audit's C-2 finding (an orphaned test match briefly appeared on the live
public site). Found and fixed as part of that audit's Medium-severity
follow-up (M-4 / ARCH-1: "no tournament-scoping enforcement").
"""

from beanie import PydanticObjectId

from app.core.errors import NotFoundError
from app.models import Tournament


async def get_active_tournament() -> Tournament:
    """Fetches the one real Tournament document.

    Consolidates a fetch-the-singleton-or-404 pattern that used to be
    duplicated across routers/tournament.py, routers/statistics.py, and
    routers/groups.py, each with its own slightly different copy. Found
    during the Timer/Half-Time audit's Dead/Duplicate Code follow-up.
    """
    tournament = await Tournament.find_one()
    if tournament is None:
        raise NotFoundError("Tournament has not been created yet — run migrations first")
    return tournament


async def get_active_tournament_id() -> PydanticObjectId:
    return (await get_active_tournament()).id
