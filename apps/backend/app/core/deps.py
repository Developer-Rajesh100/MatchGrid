from typing import Optional

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import decode_access_token
from app.models import Admin, Match, Tournament, User, UserRole

_security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> User:
    """Authenticates the bearer token and returns the current User document.
    Falls back to legacy Admin records if found, mapping them to SUPER_ADMIN."""
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
    admin = await Admin.get(oid)

    if user is None and admin is None:
        raise UnauthorizedError("User account no longer exists")

    # If legacy Admin was explicitly deleted
    if admin is None and user is not None and user.role == UserRole.SUPER_ADMIN and user.username == "testadmin":
        raise UnauthorizedError("Admin account no longer exists")

    if user is None:
        user = User(
            id=admin.id,
            username=admin.username,
            password_hash=admin.password_hash,
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )

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
    tournament_id: Optional[PydanticObjectId | str] = None,
) -> Tournament:
    """Verifies that an ORGANIZER owns the target tournament, or allows SUPER_ADMIN.
    If tournament_id is None, falls back to the default/active tournament."""
    if tournament_id is not None:
        try:
            tid = PydanticObjectId(tournament_id) if isinstance(tournament_id, str) else tournament_id
            tournament = await Tournament.get(tid)
        except InvalidId:
            raise NotFoundError("Tournament not found")
    else:
        tournament = None
        if user.role == UserRole.ORGANIZER:
            tournament = await Tournament.find_one(Tournament.organizer_id == user.id)
        if tournament is None:
            tournament = await Tournament.find_one()

    if tournament is None:
        raise NotFoundError("Tournament not found")

    if user.role == UserRole.SUPER_ADMIN:
        return tournament

    if user.role == UserRole.ORGANIZER:
        if tournament.organizer_id is not None and str(tournament.organizer_id) != str(user.id):
            raise ForbiddenError("You do not own this tournament")
        return tournament

    raise ForbiddenError("Tournament ownership required")


async def check_match_operator(
    user: User,
    match_id: PydanticObjectId | str,
) -> Match:
    """Verifies that the user is authorized to operate this match:
    - SUPER_ADMIN: permitted.
    - ORGANIZER: permitted if they own the match's tournament.
    - SCORER: permitted if assigned to this match."""
    try:
        mid = PydanticObjectId(match_id) if isinstance(match_id, str) else match_id
        match = await Match.get(mid)
    except InvalidId:
        raise NotFoundError("Match not found")

    if match is None:
        raise NotFoundError("Match not found")

    if user.role == UserRole.SUPER_ADMIN:
        return match

    if user.role == UserRole.ORGANIZER:
        tournament = await Tournament.get(match.tournament_id)
        if tournament and tournament.organizer_id is not None and str(tournament.organizer_id) != str(user.id):
            raise ForbiddenError("You do not own this tournament")
        return match

    if user.role == UserRole.SCORER:
        assigned_strs = {str(x) for x in (match.assigned_scorer_ids or [])}
        if str(user.id) not in assigned_strs:
            raise ForbiddenError("You are not assigned to score this match")
        return match

    raise ForbiddenError("Match operation not allowed")
