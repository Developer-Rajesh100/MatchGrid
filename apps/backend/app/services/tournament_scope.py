"""Tournament scoping and visibility for public read endpoints.

There is no "default tournament": every public list endpoint must say which tournament it means,
by id or by slug, so one tenant's data can never be served as another's.

A `draft` tournament is private while its organizer sets it up. It is visible only to the
superadmin, its own organizer and the scorers assigned to one of its matches; everybody else gets
the same 404 as for a tournament that does not exist, so its existence is not revealed.
"""

from typing import Optional

from beanie import PydanticObjectId
from bson.errors import InvalidId

from app.core.errors import NotFoundError, UnprocessableEntityError
from app.models import Match, Tournament, User, UserRole


async def can_view_tournament(tournament: Tournament, viewer: Optional[User]) -> bool:
    if tournament.status != "draft":
        return True
    if viewer is None:
        return False
    if viewer.role == UserRole.SUPER_ADMIN:
        return True
    if viewer.role == UserRole.ORGANIZER:
        return tournament.organizer_id is not None and tournament.organizer_id == viewer.id
    if viewer.role == UserRole.SCORER:
        return (
            await Match.find_one({"tournament_id": tournament.id, "assigned_scorer_ids": viewer.id})
        ) is not None
    return False


async def ensure_visible(tournament: Optional[Tournament], viewer: Optional[User]) -> Tournament:
    """Returns the tournament, or raises 404 when it does not exist or the viewer may not see it."""
    if tournament is None or not await can_view_tournament(tournament, viewer):
        raise NotFoundError("Tournament not found")
    return tournament


async def ensure_tournament_visible(
    tournament_id: Optional[PydanticObjectId], viewer: Optional[User]
) -> Tournament:
    """Visibility check for endpoints addressed by a child entity (match, team, player, group)."""
    tournament = await Tournament.get(tournament_id) if tournament_id else None
    return await ensure_visible(tournament, viewer)


async def resolve_tournament(
    tournament_id: Optional[str] = None,
    tournament_slug: Optional[str] = None,
    viewer: Optional[User] = None,
) -> Tournament:
    """Resolves the target tournament from an explicit id or slug (one of them is required)."""
    if tournament_id:
        try:
            tid = PydanticObjectId(tournament_id)
        except (InvalidId, TypeError):
            raise NotFoundError("Invalid tournament ID")
        return await ensure_visible(await Tournament.get(tid), viewer)
    if tournament_slug:
        return await ensure_visible(await Tournament.find_one(Tournament.slug == tournament_slug), viewer)
    raise UnprocessableEntityError("tournament_id or tournament_slug is required")


async def resolve_tournament_id(
    tournament_id: Optional[str] = None,
    tournament_slug: Optional[str] = None,
    viewer: Optional[User] = None,
) -> PydanticObjectId:
    return (await resolve_tournament(tournament_id, tournament_slug, viewer)).id


async def hidden_tournament_ids() -> list[PydanticObjectId]:
    """Ids of every draft tournament, for platform-wide public lists (e.g. live-now matches)."""
    return [t.id for t in await Tournament.find(Tournament.status == "draft").to_list()]
