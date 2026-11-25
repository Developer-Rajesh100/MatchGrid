from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import decode_access_token
from app.models import Match, Tournament, User, UserRole

_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> User:
    """Authenticates the bearer token and returns the current active User document."""
    if credentials is None:
        raise UnauthorizedError("Not authenticated")

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise UnauthorizedError("Invalid or expired token")

    try:
        oid = PydanticObjectId(user_id)
    except InvalidId:
        raise UnauthorizedError("Invalid token subject")

    user = await User.get(oid)
    if user is None:
        raise UnauthorizedError("User account no longer exists")
    if not user.is_active:
        raise UnauthorizedError("Account is inactive")

    return user


async def require_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Guards endpoints restricted to platform SUPER_ADMIN."""
    if current_user.role != UserRole.SUPER_ADMIN:
        raise ForbiddenError("Super-admin access required")
    return current_user


async def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Backward-compatible admin guard. Allows SUPER_ADMIN or ORGANIZER."""
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ORGANIZER):
        raise ForbiddenError("Admin access required")
    return current_user


async def check_tournament_ownership(
    user: User,
    tournament_id: PydanticObjectId | str,
) -> Tournament:
    """Verifies the user may manage the given tournament and returns it.

    - The tournament id is mandatory: there is no "default tournament" fallback.
    - SUPER_ADMIN may manage any tournament.
    - ORGANIZER must be the tournament's `organizer_id`. A tournament with no
      owner (`organizer_id is None`) is superadmin-only.
    - Any other role is rejected.
    """
    if tournament_id is None:
        raise NotFoundError("Tournament not found")
    try:
        tid = PydanticObjectId(tournament_id) if isinstance(tournament_id, str) else tournament_id
        tournament = await Tournament.get(tid)
    except InvalidId:
        raise NotFoundError("Tournament not found")

    if tournament is None:
        raise NotFoundError("Tournament not found")

    if user.role == UserRole.SUPER_ADMIN:
        return tournament

    if user.role == UserRole.ORGANIZER:
        if tournament.organizer_id is None or str(tournament.organizer_id) != str(user.id):
            raise ForbiddenError("You do not own this tournament")
        return tournament

    raise ForbiddenError("Tournament ownership required")


async def _load_match(match_id: PydanticObjectId | str) -> Match:
    try:
        mid = PydanticObjectId(match_id) if isinstance(match_id, str) else match_id
        match = await Match.get(mid)
    except InvalidId:
        raise NotFoundError("Match not found")
    if match is None:
        raise NotFoundError("Match not found")
    return match


async def check_match_tournament_owner(
    user: User,
    match_id: PydanticObjectId | str,
) -> Match:
    """Match-level management (schedule edits, cancel, winner, reopen): requires
    ownership of the match's tournament. Scorers are rejected even if assigned."""
    match = await _load_match(match_id)
    await check_tournament_ownership(user, match.tournament_id)
    return match


async def check_match_operator(
    user: User,
    match_id: PydanticObjectId | str,
) -> Match:
    """Verifies that the user is authorized to operate this match live:
    - SUPER_ADMIN: permitted.
    - ORGANIZER: permitted if they own the match's tournament.
    - SCORER: permitted if assigned to this match."""
    match = await _load_match(match_id)

    if user.role in (UserRole.SUPER_ADMIN, UserRole.ORGANIZER):
        await check_tournament_ownership(user, match.tournament_id)
        return match

    if user.role == UserRole.SCORER:
        assigned_strs = {str(x) for x in (match.assigned_scorer_ids or [])}
        if str(user.id) not in assigned_strs:
            raise ForbiddenError("You are not assigned to score this match")
        return match

    raise ForbiddenError("Match operation not allowed")
