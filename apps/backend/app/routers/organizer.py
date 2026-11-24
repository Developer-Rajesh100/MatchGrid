import re
from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends

from app.core.deps import check_tournament_ownership, get_current_admin
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import hash_password
from app.models import Group, Match, Player, Team, Tournament, User, UserRole
from app.routers.matches import _to_out
from app.schemas.auth import ScorerCreate, UserOut
from app.schemas.match import AssignScorerRequest, MatchOut
from app.schemas.tournament import TournamentCreate, TournamentOut

router = APIRouter(prefix="/organizer", tags=["organizer"])


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return cleaned or "tournament"


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


def _to_tournament_out(t: Tournament) -> TournamentOut:
    return TournamentOut(
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


@router.get("/tournaments", response_model=list[TournamentOut])
async def list_my_tournaments(admin: User = Depends(get_current_admin)) -> list[TournamentOut]:
    if admin.role == UserRole.SUPER_ADMIN:
        tournaments = await Tournament.find_all().to_list()
    else:
        tournaments = await Tournament.find(Tournament.organizer_id == admin.id).to_list()
    return [_to_tournament_out(t) for t in tournaments]


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

    t = Tournament(
        name=payload.name,
        season=payload.season,
        format_description=payload.format_description or "2 groups of 3 teams, top 2 advance to semi-finals",
        organizer_id=admin.id,
        slug=slug,
        status="ACTIVE",
        logo_url=payload.logo_url,
    )
    await t.insert()

    # Pre-create Groups A and B
    for gname in ("A", "B"):
        await Group(tournament_id=t.id, name=gname).insert()

    return _to_tournament_out(t)


@router.get("/scorers", response_model=list[UserOut])
async def list_scorers(admin: User = Depends(get_current_admin)) -> list[UserOut]:
    if admin.role == UserRole.SUPER_ADMIN:
        scorers = await User.find(User.role == UserRole.SCORER).to_list()
    else:
        scorers = await User.find(User.role == UserRole.SCORER, User.created_by == admin.id).to_list()
    return [_to_user_out(s) for s in scorers]


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
    await scorer.insert()
    return _to_user_out(scorer)


@router.post("/matches/{match_id}/scorers", response_model=MatchOut)
async def assign_scorer_to_match(
    match_id: str, payload: AssignScorerRequest, admin: User = Depends(get_current_admin)
) -> MatchOut:
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

    if scorer.id not in (match.assigned_scorer_ids or []):
        match.assigned_scorer_ids.append(scorer.id)
        await match.save()

    return await _to_out(match)


@router.delete("/matches/{match_id}/scorers/{scorer_id}", response_model=MatchOut)
async def remove_scorer_from_match(
    match_id: str, scorer_id: str, admin: User = Depends(get_current_admin)
) -> MatchOut:
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

    return await _to_out(match)


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

    # Clean up associated entities
    await Match.find(Match.tournament_id == t.id).delete()
    await Player.find(Player.tournament_id == t.id).delete()
    await Team.find(Team.tournament_id == t.id).delete()
    await Group.find(Group.tournament_id == t.id).delete()
    await t.delete()


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

    matches = await Match.find({"assigned_scorer_ids": sid}).to_list()
    for m in matches:
        if sid in m.assigned_scorer_ids:
            m.assigned_scorer_ids.remove(sid)
            await m.save()

    await scorer.delete()
