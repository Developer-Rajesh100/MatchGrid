import re

from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from app.core.deps import check_tournament_ownership, get_current_admin
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError
from app.core.security import hash_password
from app.models import Group, Match, Tournament, User, UserRole
from app.models.tournament import TournamentConfig
from app.routers.matches import _list_matches, _to_out
from app.schemas.auth import ScorerCreate, UserOut
from app.schemas.match import AssignScorerRequest, MatchAdminOut
from app.schemas.tournament import (
    TournamentConfigUpdate,
    TournamentCreate,
    TournamentOut,
    TournamentUpdate,
)
from app.services.media import release_media, validate_media_url
from app.services.serializers import tournament_to_out, user_to_out
from app.services.tournaments import delete_tournament_cascade
from app.services.users import unassign_scorer_everywhere

router = APIRouter(prefix="/organizer", tags=["organizer"])


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return cleaned or "tournament"


@router.get("/tournaments", response_model=list[TournamentOut])
async def list_my_tournaments(admin: User = Depends(get_current_admin)) -> list[TournamentOut]:
    if admin.role == UserRole.SUPER_ADMIN:
        tournaments = await Tournament.find_all().to_list()
    else:
        tournaments = await Tournament.find(Tournament.organizer_id == admin.id).to_list()
    return [tournament_to_out(t) for t in tournaments]


@router.post("/tournaments", response_model=TournamentOut, status_code=201)
async def create_tournament(
    payload: TournamentCreate, admin: User = Depends(get_current_admin)
) -> TournamentOut:
    base_slug = payload.slug or _slugify(payload.name)
    # Ensure slug uniqueness
    slug = base_slug
    counter = 1
    while await Tournament.find_one(Tournament.slug == slug):
        slug = f"{base_slug}-{counter}"
        counter += 1

    config = payload.config or TournamentConfig()
    # The tournament has no id yet, so no R2 media can belong to it: only plain URLs here.
    logo_url = validate_media_url(payload.logo_url, None)
    banner_url = validate_media_url(payload.banner_url, None)

    t = Tournament(
        name=payload.name,
        season=payload.season,
        format_description=payload.format_description or f"{config.num_groups} groups of {config.teams_per_group} teams",
        organizer_id=admin.id,
        slug=slug,
        status="active",
        logo_url=logo_url,
        banner_url=banner_url,
        config=config,
    )
    try:
        await t.insert()
    except DuplicateKeyError as exc:  # another tournament took the slug since the check above
        raise ConflictError(f"The tournament address '{slug}' is already taken, try again") from exc

    # Pre-create Groups dynamically based on config.num_groups (A, B, C, D...)
    num_groups = config.num_groups if config else 2
    for i in range(num_groups):
        gname = chr(ord("A") + i)
        await Group(tournament_id=t.id, name=gname).insert()

    return tournament_to_out(t)


@router.patch("/tournaments/{tournament_id}", response_model=TournamentOut)
async def update_tournament(
    tournament_id: str, payload: TournamentUpdate, admin: User = Depends(get_current_admin)
) -> TournamentOut:
    t = await check_tournament_ownership(admin, tournament_id)
    changes = payload.model_dump(exclude_unset=True)
    for media_field in ("logo_url", "banner_url"):
        if media_field in changes:
            changes[media_field] = validate_media_url(changes[media_field], t.id)

    old_media = {f: getattr(t, f) for f in ("logo_url", "banner_url") if f in changes}
    for field, value in changes.items():
        if field == "config":
            if value is not None:
                t.config = TournamentConfig(**value)
        else:
            setattr(t, field, value)
    await t.save()

    # Replaced/cleared logo or banner no longer needed: delete it from R2 (this tournament's folder only).
    for field, old in old_media.items():
        if old and getattr(t, field) != old:
            await release_media(old, t.id)
    return tournament_to_out(t)


@router.patch("/tournaments/{tournament_id}/config", response_model=TournamentOut)
async def update_tournament_config(
    tournament_id: str, payload: TournamentConfigUpdate, admin: User = Depends(get_current_admin)
) -> TournamentOut:
    t = await check_tournament_ownership(admin, tournament_id)
    config_dict = t.config.model_dump()
    for field, val in payload.model_dump(exclude_unset=True).items():
        if val is not None:
            config_dict[field] = val
    try:
        # The merged settings must still form a feasible tournament (e.g. qualifiers <= teams).
        t.config = TournamentConfig(**config_dict)
    except ValidationError as exc:
        raise UnprocessableEntityError("; ".join(e["msg"].removeprefix("Value error, ") for e in exc.errors()))
    await t.save()
    return tournament_to_out(t)


@router.get("/tournaments/{tournament_id}/matches", response_model=list[MatchAdminOut])
async def list_tournament_matches(
    tournament_id: str, admin: User = Depends(get_current_admin)
) -> list[MatchAdminOut]:
    """The tournament's matches including scorer assignments (staff only; the public list omits them)."""
    t = await check_tournament_ownership(admin, tournament_id)
    return await _list_matches(tournament_id=str(t.id), include_scorers=True, viewer=admin)


@router.get("/scorers", response_model=list[UserOut])
async def list_scorers(admin: User = Depends(get_current_admin)) -> list[UserOut]:
    if admin.role == UserRole.SUPER_ADMIN:
        scorers = await User.find(User.role == UserRole.SCORER).to_list()
    else:
        scorers = await User.find(User.role == UserRole.SCORER, User.created_by == admin.id).to_list()
    return [user_to_out(s) for s in scorers]


@router.post("/scorers", response_model=UserOut, status_code=201)
async def create_scorer(
    payload: ScorerCreate, admin: User = Depends(get_current_admin)
) -> UserOut:
    existing = await User.find_one(User.username == payload.username)
    if existing:
        raise ConflictError(f"Username '{payload.username}' is already in use")

    scorer = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=UserRole.SCORER,
        created_by=admin.id,
        is_active=True,
    )
    try:
        await scorer.insert()
    except DuplicateKeyError as exc:  # two requests raced past the check above
        raise ConflictError(f"Username '{payload.username}' is already in use") from exc
    return user_to_out(scorer)


@router.post("/matches/{match_id}/scorers", response_model=MatchAdminOut)
async def assign_scorer_to_match(
    match_id: str, payload: AssignScorerRequest, admin: User = Depends(get_current_admin)
) -> MatchAdminOut:
    try:
        mid = PydanticObjectId(match_id)
        sid = PydanticObjectId(payload.scorer_id)
    except InvalidId:
        raise NotFoundError("Invalid id format")

    match = await Match.get(mid)
    if not match:
        raise NotFoundError("Match not found")

    # Verify ownership
    await check_tournament_ownership(admin, match.tournament_id)

    scorer = await User.get(sid)
    if not scorer or scorer.role != UserRole.SCORER:
        raise NotFoundError("Scorer not found")
    if admin.role != UserRole.SUPER_ADMIN and scorer.created_by != admin.id:
        raise ForbiddenError("You can only assign scorers you created")

    if scorer.id not in (match.assigned_scorer_ids or []):
        match.assigned_scorer_ids.append(scorer.id)
        await match.save()

    return await _to_out(match, admin=True)


@router.delete("/matches/{match_id}/scorers/{scorer_id}", response_model=MatchAdminOut)
async def remove_scorer_from_match(
    match_id: str, scorer_id: str, admin: User = Depends(get_current_admin)
) -> MatchAdminOut:
    try:
        mid = PydanticObjectId(match_id)
        sid = PydanticObjectId(scorer_id)
    except InvalidId:
        raise NotFoundError("Invalid id format")

    match = await Match.get(mid)
    if not match:
        raise NotFoundError("Match not found")

    # Verify ownership
    await check_tournament_ownership(admin, match.tournament_id)

    if sid in (match.assigned_scorer_ids or []):
        match.assigned_scorer_ids.remove(sid)
        await match.save()

    return await _to_out(match, admin=True)


@router.delete("/tournaments/{tournament_id}", status_code=204)
async def delete_tournament(
    tournament_id: str, admin: User = Depends(get_current_admin)
) -> None:
    try:
        tid = PydanticObjectId(tournament_id)
    except InvalidId:
        raise NotFoundError("Tournament not found")

    t = await Tournament.get(tid)
    if not t:
        raise NotFoundError("Tournament not found")

    await check_tournament_ownership(admin, t.id)
    await delete_tournament_cascade(t)


@router.delete("/scorers/{scorer_id}", status_code=204)
async def delete_scorer(
    scorer_id: str, admin: User = Depends(get_current_admin)
) -> None:
    try:
        sid = PydanticObjectId(scorer_id)
    except InvalidId:
        raise NotFoundError("Invalid id format")

    scorer = await User.get(sid)
    if not scorer or scorer.role != UserRole.SCORER:
        raise NotFoundError("Scorer not found")

    if admin.role != UserRole.SUPER_ADMIN and scorer.created_by != admin.id:
        raise ForbiddenError("You cannot delete this scorer")

    await unassign_scorer_everywhere(sid)
    await scorer.delete()
