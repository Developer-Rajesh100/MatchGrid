from typing import Any
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends

from app.core.deps import require_superadmin
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import hash_password
from app.models import Match, Tournament, User, UserRole
from app.schemas.auth import OrganizerCreate, UserOut, UserStatusUpdate
from app.schemas.tournament import TournamentOut

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        organization_name=user.organization_name,
        created_by=str(user.created_by) if user.created_by else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(_admin: User = Depends(require_superadmin)) -> list[UserOut]:
    users = await User.find_all().to_list()
    return [_to_user_out(u) for u in users]


@router.post("/organizers", response_model=UserOut, status_code=201)
async def create_organizer(
    payload: OrganizerCreate, admin: User = Depends(require_superadmin)
) -> UserOut:
    existing = await User.find_one(User.username == payload.username)
    if existing:
        raise ConflictError(f"Username '{payload.username}' is already in use")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=UserRole.ORGANIZER,
        organization_name=payload.organization_name,
        created_by=admin.id,
        is_active=True,
    )
    await user.insert()
    return _to_user_out(user)


@router.patch("/users/{user_id}/status", response_model=UserOut)
async def update_user_status(
    user_id: str, payload: UserStatusUpdate, admin: User = Depends(require_superadmin)
) -> UserOut:
    try:
        oid = PydanticObjectId(user_id)
    except InvalidId:
        raise NotFoundError("User not found")

    user = await User.get(oid)
    if not user:
        raise NotFoundError("User not found")

    if user.id == admin.id and not payload.is_active:
        raise ValidationAppError("Cannot deactivate your own account")

    user.is_active = payload.is_active
    await user.save()
    return _to_user_out(user)


@router.get("/tournaments", response_model=list[TournamentOut])
async def list_all_tournaments(_admin: User = Depends(require_superadmin)) -> list[TournamentOut]:
    tournaments = await Tournament.find_all().to_list()
    return [
        TournamentOut(
            id=str(t.id),
            name=t.name,
            season=t.season,
            format_description=t.format_description,
            stage=t.stage,
            champion_team_id=str(t.champion_team_id) if t.champion_team_id else None,
            organizer_id=str(t.organizer_id) if t.organizer_id else None,
            slug=t.slug,
            status=t.status,
            logo_url=t.logo_url,
        )
        for t in tournaments
    ]


@router.get("/stats")
async def platform_stats(_admin: User = Depends(require_superadmin)) -> dict[str, int]:
    total_users = await User.count()
    total_organizers = await User.find(User.role == UserRole.ORGANIZER).count()
    total_scorers = await User.find(User.role == UserRole.SCORER).count()
    total_tournaments = await Tournament.count()
    total_matches = await Match.count()
    return {
        "total_users": total_users,
        "total_organizers": total_organizers,
        "total_scorers": total_scorers,
        "total_tournaments": total_tournaments,
        "total_matches": total_matches,
    }


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: User = Depends(require_superadmin)) -> None:
    try:
        oid = PydanticObjectId(user_id)
    except InvalidId:
        raise NotFoundError("User not found")

    user = await User.get(oid)
    if not user:
        raise NotFoundError("User not found")

    if user.id == admin.id:
        raise ValidationAppError("Cannot delete your own account")

    await user.delete()
