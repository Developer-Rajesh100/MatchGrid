import hashlib

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Request
from pymongo.errors import DuplicateKeyError

from app.core.deps import require_superadmin
from app.core.config import get_settings
from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.rate_limit import client_ip_headers, resolve_client
from app.core.security import hash_password
from app.models import DOCUMENT_MODELS, Match, Tournament, User, UserRole
from app.schemas.auth import OrganizerCreate, UserOut, UserStatusUpdate
from app.schemas.tournament import TournamentOut
from app.services.serializers import tournament_to_out, user_to_out
from app.services.users import unassign_scorer_everywhere

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(_admin: User = Depends(require_superadmin)) -> list[UserOut]:
    users = await User.find_all().to_list()
    return [user_to_out(u) for u in users]


@router.post("/organizers", response_model=UserOut, status_code=201)
async def create_organizer(
    payload: OrganizerCreate, admin: User = Depends(require_superadmin)
) -> UserOut:
    existing = await User.find_one(User.username == payload.username)
    if existing:
        raise ConflictError(f"Username '{payload.username}' is already in use")

    clean_email = payload.email.strip() if payload.email and payload.email.strip() else None
    clean_org = payload.organization_name.strip() if payload.organization_name and payload.organization_name.strip() else None

    user = User(
        username=payload.username,
        email=clean_email,
        password_hash=hash_password(payload.password),
        role=UserRole.ORGANIZER,
        organization_name=clean_org,
        created_by=admin.id,
        is_active=True,
    )
    try:
        await user.insert()
    except DuplicateKeyError as exc:
        raise ConflictError(f"A user with username '{payload.username}' or email already exists") from exc
    return user_to_out(user)


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
    return user_to_out(user)


@router.get("/tournaments", response_model=list[TournamentOut])
async def list_all_tournaments(_admin: User = Depends(require_superadmin)) -> list[TournamentOut]:
    return [tournament_to_out(t) for t in await Tournament.find_all().to_list()]


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


@router.get("/db-stats")
async def database_stats(_admin: User = Depends(require_superadmin)) -> dict[str, dict[str, int]]:
    """Document count per collection. Moved here from the public /health/db probe so that
    internal data volumes are only visible to the platform owner."""
    return {"collections": {model.Settings.name: await model.find_all().count() for model in DOCUMENT_MODELS}}


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

    if user.role == UserRole.ORGANIZER:
        owned = await Tournament.find(Tournament.organizer_id == user.id).count()
        if owned:
            raise ConflictError(
                f"Organizer still owns {owned} tournament(s) — delete or reassign them first"
            )
    elif user.role == UserRole.SCORER:
        await unassign_scorer_everywhere(user.id)

    await user.delete()


@router.delete("/tournaments/{tournament_id}", status_code=204)
async def delete_any_tournament(
    tournament_id: str, admin: User = Depends(require_superadmin)
) -> None:
    """Superadmin can permanently delete any tournament on the platform with cascade cleanup."""
    from app.routers.organizer import delete_tournament as org_delete_tournament

    await org_delete_tournament(tournament_id, admin)



@router.get("/debug/client-ip")
async def debug_client_ip(request: Request, _admin: User = Depends(require_superadmin)) -> dict:
    """Which value keys the login throttle for THIS request, so a deployment can be verified
    (is CLIENT_IP_HEADER reaching the app? does the key stay the same across requests?).

    The address itself is never returned: only a short hash of it (`key_id`, equal for equal
    keys) and the source. Call it twice from the same machine: the same `key_id` means one stable
    throttle bucket; a changing one means the key is not stable behind your proxies."""
    key, source = resolve_client(request)
    configured = client_ip_headers()
    forwarded = [p for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
    return {
        "key_id": hashlib.sha256(key.encode()).hexdigest()[:12],
        "source": source,
        "configured_headers": {name: bool(request.headers.get(name, "").strip()) for name in configured},
        "x_forwarded_for_entries": len(forwarded),
        "trusted_proxy_hops": get_settings().trusted_proxy_hops,
        "forwarding_headers_present": sorted(
            h for h in request.headers.keys() if h in {"x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip", "forwarded"}
        ),
    }
