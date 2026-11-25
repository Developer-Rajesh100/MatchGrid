"""Tournament scoping for public list endpoints.

There is no "default tournament": every public list endpoint must say which tournament it means,
by id or by slug, so one tenant's data can never be served as another's.
"""

from typing import Optional

from beanie import PydanticObjectId

from app.core.errors import NotFoundError, UnprocessableEntityError
from app.models import Tournament


async def resolve_tournament_id(
    tournament_id: Optional[str] = None,
    tournament_slug: Optional[str] = None,
) -> PydanticObjectId:
    """Resolves the target tournament id from an explicit id or slug (one of them is required)."""
    if tournament_id:
        try:
            tid = PydanticObjectId(tournament_id)
        except Exception:
            raise NotFoundError("Invalid tournament ID")
        if await Tournament.get(tid) is None:
            raise NotFoundError("Tournament not found")
        return tid
    if tournament_slug:
        t = await Tournament.find_one(Tournament.slug == tournament_slug)
        if not t:
            raise NotFoundError(f"Tournament with slug '{tournament_slug}' not found")
        return t.id
    raise UnprocessableEntityError("tournament_id or tournament_slug is required")
