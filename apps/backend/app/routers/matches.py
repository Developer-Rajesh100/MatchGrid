from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import (
    check_match_operator,
    check_match_tournament_owner,
    check_tournament_ownership,
    get_current_admin,
    get_current_user,
)
from app.core.errors import ConflictError, NotFoundError
from app.core.websocket import broadcast
from app.models import Group, Match, MatchEvent, MatchLineup, Player, Team, Tournament, User
from app.schemas.match import (
    AssignTeamsRequest,
    BracketTreeOut,
    GenerateGroupFixturesRequest,
    HalfTimePayload,
    MatchCreate,
    MatchDetailOut,
    MatchOut,
    MatchUpdate,
    WinnerRequest,
)
from app.schemas.match_event import MatchEventCreate, MatchEventOut
from app.schemas.match_lineup import LineupEntryOut, LineupSetRequest
from app.services.lineups import set_lineup
from app.services.match_events import add_event, remove_event
from app.services.matches import (
    assign_match_teams,
    assert_no_conflict,
    build_tournament_bracket,
    cancel_match,
    compute_score,
    compute_scores_and_winners,
    create_new_match,
    delete_match,
    end_match,
    generate_final,
    generate_group_fixtures,
    generate_semis,
    get_match_or_404,
    pause_half_time,
    reopen_match,
    reset_timer,
    resume_match,
    seed_knockout_bracket,
    set_winner,
    start_match,
    uncancel_match,
)
from app.services.serializers import match_event_to_out, match_to_out
from app.services.tournament_scope import resolve_tournament_id
from app.services.tournament_stage import get_match_winner

router = APIRouter(prefix="/matches", tags=["matches"])


async def _teams_map(*matches: Match) -> dict:
    ids = {m.team1_id for m in matches} | {m.team2_id for m in matches}
    ids.discard(None)
    teams = await Team.find({"_id": {"$in": list(ids)}}).to_list()
    return {t.id: t for t in teams}


async def _groups_map(*matches: Match) -> dict:
    """Only the groups the given matches belong to (never the whole collection)."""
    ids = {m.group_id for m in matches if m.group_id}
    if not ids:
        return {}
    return {g.id: g for g in await Group.find({"_id": {"$in": list(ids)}}).to_list()}


async def _players_map(*matches: Match) -> dict:
    """Players of the matches' two teams only: every event, lineup entry and scorer in a
    match belongs to one of them."""
    team_ids = {t for m in matches for t in (m.team1_id, m.team2_id) if t}
    if not team_ids:
        return {}
    return {p.id: p for p in await Player.find({"team_id": {"$in": list(team_ids)}}).to_list()}


async def _to_out(match: Match, admin: bool = False) -> MatchOut:
    teams = await _teams_map(match)
    groups = await _groups_map(match)
    score1, score2 = await compute_score(match)
    winner_id = await get_match_winner(match) if match.status == "full_time" else None
    group_name = groups[match.group_id].name if match.group_id in groups else None
    tournament = await Tournament.get(match.tournament_id) if match.tournament_id else None
    t_name = tournament.name if tournament else None
    t_slug = tournament.slug if tournament else None
    return match_to_out(
        match,
        teams,
        score1,
        score2,
        winner_id,
        group_name,
        tournament_name=t_name,
        tournament_slug=t_slug,
        include_scorers=admin,
    )


async def _list_matches(
    team_id: Optional[str] = None,
    stage: Optional[str] = None,
    group_id: Optional[str] = None,
    status: Optional[str] = None,
    date: Optional[str] = None,
    tournament_id: Optional[str] = None,
    tournament_slug: Optional[str] = None,
    include_scorers: bool = False,
) -> list[MatchOut]:
    resolved_tid = await resolve_tournament_id(tournament_id, tournament_slug)
    filters: dict = {"tournament_id": resolved_tid}
    if team_id:
        tid = PydanticObjectId(team_id)
        filters["$or"] = [{"team1_id": tid}, {"team2_id": tid}]
    if stage:
        filters["stage"] = stage
    if group_id:
        filters["group_id"] = PydanticObjectId(group_id)
    if status:
        filters["status"] = status
    if date:
        filters["date"] = date

    matches = await Match.find(filters).sort("match_number").to_list()
    return await _matches_to_out(matches, include_scorers)


async def _matches_to_out(matches: list[Match], include_scorers: bool = False) -> list[MatchOut]:
    teams = await _teams_map(*matches)
    groups = await _groups_map(*matches)
    scores_and_winners = await compute_scores_and_winners(matches)
    tournament_ids = {m.tournament_id for m in matches if m.tournament_id}
    tournaments = {t.id: t for t in await Tournament.find({"_id": {"$in": list(tournament_ids)}}).to_list()}

    out = []
    for m in matches:
        score1, score2, winner_id = scores_and_winners[m.id]
        group_name = groups[m.group_id].name if m.group_id in groups else None
        t = tournaments.get(m.tournament_id)
        out.append(
            match_to_out(
                m,
                teams,
                score1,
                score2,
                winner_id,
                group_name,
                tournament_name=t.name if t else None,
                tournament_slug=t.slug if t else None,
                include_scorers=include_scorers,
            )
        )
    return out


@router.get("/featured", response_model=list[MatchOut])
async def list_featured_live(limit: int = Query(default=8, ge=1, le=24)) -> list[MatchOut]:
    """Matches in play right now across every tournament, for the public hub's "live now" strip.
    Deliberately platform-wide (live scores are public data); everything else stays tournament-scoped."""
    matches = await Match.find(Match.status == "live").sort("started_at").limit(limit).to_list()
    return await _matches_to_out(matches)


@router.get("", response_model=list[MatchOut])
async def list_matches(
    team_id: Optional[str] = Query(default=None),
    stage: Optional[str] = Query(default=None),
    group_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    date: Optional[str] = Query(default=None),
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> list[MatchOut]:
    return await _list_matches(team_id, stage, group_id, status, date, tournament_id, tournament_slug)


@router.get("/upcoming", response_model=list[MatchOut])
async def list_upcoming(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> list[MatchOut]:
    return await _list_matches(status="upcoming", tournament_id=tournament_id, tournament_slug=tournament_slug)


@router.get("/live", response_model=list[MatchOut])
async def list_live(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> list[MatchOut]:
    return await _list_matches(status="live", tournament_id=tournament_id, tournament_slug=tournament_slug)


@router.get("/completed", response_model=list[MatchOut])
async def list_completed(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> list[MatchOut]:
    return await _list_matches(status="full_time", tournament_id=tournament_id, tournament_slug=tournament_slug)


@router.get("/bracket", response_model=BracketTreeOut)
async def get_bracket(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
) -> BracketTreeOut:
    """Returns the visual bracket tree for the active or specified tournament."""
    tid = await resolve_tournament_id(tournament_id, tournament_slug)
    return await build_tournament_bracket(tid)


@router.get("/{match_id}", response_model=MatchDetailOut)
async def get_match(match_id: str) -> MatchDetailOut:
    match = await get_match_or_404(PydanticObjectId(match_id))
    base = await _to_out(match)

    events = await MatchEvent.find(MatchEvent.match_id == match.id).sort("minute").to_list()
    players = await _players_map(match)
    event_outs = [match_event_to_out(e, players) for e in events]

    lineup = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    return MatchDetailOut(
        **base.model_dump(), events=event_outs, lineup=[str(entry.player_id) for entry in lineup]
    )


@router.patch("/{match_id}", response_model=MatchOut)
async def update_match(
    match_id: str, payload: MatchUpdate, admin: User = Depends(get_current_admin)
) -> MatchOut:
    """Update a match's match number and scheduled date/time/venue/duration/notes. Does not change status or score.
    Tournament owner (or superadmin) only — assigned scorers cannot reschedule."""
    match = await check_match_tournament_owner(admin, match_id)
    changes = payload.model_dump(exclude_unset=True)
    if "match_number" in changes:
        new_number = changes.pop("match_number")
        if new_number is not None and new_number != match.match_number:
            clash = await Match.find_one(
                Match.tournament_id == match.tournament_id, Match.match_number == new_number
            )
            if clash is not None:
                raise ConflictError(f"Match number {new_number} is already used by another match")
            match.match_number = new_number
    if match.stage != "extra":
        changes.pop("label", None)  # labels of group/knockout matches are fixed
    elif {"date", "time"} & changes.keys() and match.team1_id and match.team2_id:
        await assert_no_conflict(
            match.tournament_id, match.team1_id, match.team2_id,
            changes.get("date", match.date), changes.get("time", match.time), exclude_id=match.id,
        )
    for field, value in changes.items():
        setattr(match, field, value)
    await match.save()
    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return await _to_out(match)


@router.post("", response_model=MatchOut, status_code=201)
async def create_match(payload: MatchCreate, admin: User = Depends(get_current_admin)) -> MatchOut:
    """Create a match between two existing teams (admin only): an additional "extra" match
    (never affects standings, the tournament stage or tournament statistics) or a real
    group-stage fixture (stage="group" + group_id)."""
    tournament = await check_tournament_ownership(admin, payload.tournament_id)
    tournament_id = tournament.id
    match = await create_new_match(
        tournament_id,
        PydanticObjectId(payload.team1_id),
        PydanticObjectId(payload.team2_id),
        stage=payload.stage,
        group_id=PydanticObjectId(payload.group_id) if payload.group_id else None,
        match_number=payload.match_number,
        date=payload.date,
        time=payload.time,
        venue=payload.venue,
        label=payload.label,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
    return await _to_out(match)


@router.delete("/{match_id}", status_code=204)
async def remove_match(match_id: str, admin: User = Depends(get_current_admin)) -> None:
    """Permanently delete any match (admin only), including its events and lineup, and recompute
    standings, player statistics and the tournament stage."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    await check_tournament_ownership(admin, match.tournament_id)
    await delete_match(match)


@router.put("/{match_id}/teams", response_model=MatchOut)
async def assign_teams(
    match_id: str, payload: AssignTeamsRequest, admin: User = Depends(get_current_admin)
) -> MatchOut:
    """Manually assign the two teams of an upcoming match — group, semi-final or final (admin only)."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    await check_tournament_ownership(admin, match.tournament_id)
    await assign_match_teams(
        match, PydanticObjectId(payload.team1_id), PydanticObjectId(payload.team2_id)
    )
    return await _to_out(match)


@router.post("/{match_id}/start", response_model=MatchOut)
async def start(match_id: str, user: User = Depends(get_current_user)) -> MatchOut:
    """upcoming -> live. Requires both teams to already be assigned."""
    match = await check_match_operator(user, match_id)
    match = await start_match(match)
    return await _to_out(match)


@router.post("/{match_id}/end", response_model=MatchOut)
async def end(match_id: str, user: User = Depends(get_current_user)) -> MatchOut:
    """live -> full_time. Triggers a standings/statistics/tournament-stage refresh."""
    match = await check_match_operator(user, match_id)
    match = await end_match(match)
    return await _to_out(match)


@router.post("/{match_id}/reopen", response_model=MatchOut)
async def reopen(match_id: str, user: User = Depends(get_current_admin)) -> MatchOut:
    """full_time -> live, to correct a mis-recorded event. Also refreshes standings/stage."""
    match = await check_match_tournament_owner(user, match_id)
    match = await reopen_match(match)
    return await _to_out(match)


@router.post("/{match_id}/half-time", response_model=MatchOut)
async def half_time(
    match_id: str,
    payload: Optional[HalfTimePayload] = None,
    user: User = Depends(get_current_user),
) -> MatchOut:
    """Pause live match for Half Time. Authorized match operator only."""
    match = await check_match_operator(user, match_id)
    elapsed = payload.elapsed_seconds if payload else None
    match = await pause_half_time(match, elapsed_seconds=elapsed)
    return await _to_out(match)


@router.post("/{match_id}/resume", response_model=MatchOut)
async def resume(match_id: str, user: User = Depends(get_current_user)) -> MatchOut:
    """Resume match from Half Time. Authorized match operator only."""
    match = await check_match_operator(user, match_id)
    match = await resume_match(match)
    return await _to_out(match)


@router.post("/{match_id}/reset-timer", response_model=MatchOut)
async def reset_match_timer(
    match_id: str, user: User = Depends(get_current_user)
) -> MatchOut:
    """Reset match timer to 00:00. Authorized match operator only."""
    match = await check_match_operator(user, match_id)
    match = await reset_timer(match)
    return await _to_out(match)


@router.post("/{match_id}/cancel", response_model=MatchOut)
async def cancel(match_id: str, user: User = Depends(get_current_admin)) -> MatchOut:
    """Cancel a not-yet-started match. Only valid while status is 'upcoming'. Authorized match operator only."""
    match = await check_match_tournament_owner(user, match_id)
    match = await cancel_match(match)
    return await _to_out(match)


@router.post("/{match_id}/uncancel", response_model=MatchOut)
async def uncancel(match_id: str, user: User = Depends(get_current_admin)) -> MatchOut:
    """Revert a cancelled match back to 'upcoming'. Authorized match operator only."""
    match = await check_match_tournament_owner(user, match_id)
    match = await uncancel_match(match)
    return await _to_out(match)


@router.post("/{match_id}/winner", response_model=MatchOut)
async def winner(
    match_id: str, payload: WinnerRequest, user: User = Depends(get_current_admin)
) -> MatchOut:
    """Manually record the winner of a drawn knockout match (e.g. on penalties).
    Only valid for a completed, tied, non-group match."""
    match = await check_match_tournament_owner(user, match_id)
    match = await set_winner(match, PydanticObjectId(payload.team_id))
    return await _to_out(match)


@router.post("/generate-group-fixtures", response_model=list[MatchOut])
async def generate_fixtures(
    payload: GenerateGroupFixturesRequest, admin: User = Depends(get_current_admin)
) -> list[MatchOut]:
    """(Re)generate a group's 3 round-robin matches from its 3 assigned teams.
    If the group already has recorded results, pass force=true to erase and regenerate."""
    group = await Group.get(PydanticObjectId(payload.group_id))
    if group:
        await check_tournament_ownership(admin, group.tournament_id)
    matches = await generate_group_fixtures(PydanticObjectId(payload.group_id), payload.force)
    teams = await _teams_map(*matches)
    groups = await _groups_map(*matches)
    return [
        match_to_out(m, teams, 0, 0, group_name=groups[m.group_id].name if m.group_id in groups else None)
        for m in matches
    ]


@router.post("/generate-semis", response_model=list[MatchOut])
async def do_generate_semis(
    tournament_id: str = Query(..., pattern=r"^[0-9a-fA-F]{24}$"),
    admin: User = Depends(get_current_admin),
) -> list[MatchOut]:
    """Seed the 2 semi-finals from final group standings: SF1 = A2 vs B1, SF2 = B2 vs A1.
    Requires both groups fully complete and no semis generated yet."""
    tid = (await check_tournament_ownership(admin, tournament_id)).id
    matches = await generate_semis(tid)
    return [await _to_out(m) for m in matches]


@router.post("/generate-final", response_model=MatchOut)
async def do_generate_final(
    tournament_id: str = Query(..., pattern=r"^[0-9a-fA-F]{24}$"),
    admin: User = Depends(get_current_admin),
) -> MatchOut:
    """Seed the final from the two semi-final winners. Requires both semis
    completed with a decided winner (score or manual override)."""
    tid = (await check_tournament_ownership(admin, tournament_id)).id
    match = await generate_final(tid)
    return await _to_out(match)


@router.post("/seed-knockout", response_model=list[MatchOut])
async def do_seed_knockout(
    tournament_id: str = Query(..., pattern=r"^[0-9a-fA-F]{24}$"),
    admin: User = Depends(get_current_admin),
) -> list[MatchOut]:
    """Universal knockout seeder: seeds Quarters, Semis, or crowns Champion based on tournament config."""
    tid = (await check_tournament_ownership(admin, tournament_id)).id
    matches = await seed_knockout_bracket(tid)
    return [await _to_out(m) for m in matches]


# ---- Match events ----


@router.get("/{match_id}/events", response_model=list[MatchEventOut])
async def list_events(match_id: str) -> list[MatchEventOut]:
    match = await get_match_or_404(PydanticObjectId(match_id))
    events = await MatchEvent.find(MatchEvent.match_id == match.id).sort("minute").to_list()
    players = await _players_map(match)
    return [match_event_to_out(e, players) for e in events]


@router.post("/{match_id}/events", response_model=MatchEventOut, status_code=201)
async def create_event(
    match_id: str, payload: MatchEventCreate, user: User = Depends(get_current_user)
) -> MatchEventOut:
    """Record a goal/yellow/red/player-of-the-match event. Recording a new potm
    replaces any existing one for this match (max one per match). Not allowed
    while the match is still 'upcoming'. Recalculates standings/statistics."""
    match = await check_match_operator(user, match_id)
    event = await add_event(match, payload, user.id)
    players = await _players_map(match)
    return match_event_to_out(event, players)


@router.delete("/{match_id}/events/{event_id}", status_code=204)
async def delete_event(
    match_id: str, event_id: str, user: User = Depends(get_current_user)
) -> None:
    match = await check_match_operator(user, match_id)
    await remove_event(match, PydanticObjectId(event_id))


# ---- Match lineup ----


@router.get("/{match_id}/lineup", response_model=list[LineupEntryOut])
async def get_lineup(match_id: str) -> list[LineupEntryOut]:
    match = await get_match_or_404(PydanticObjectId(match_id))
    entries = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    players = await _players_map(match)
    return [
        LineupEntryOut(
            player_id=str(e.player_id),
            player_name=players[e.player_id].name if e.player_id in players else "Unknown",
            team_id=str(e.team_id),
            is_starting=e.is_starting,
        )
        for e in entries
    ]


@router.put("/{match_id}/lineup", response_model=list[LineupEntryOut])
async def put_lineup(
    match_id: str, payload: LineupSetRequest, user: User = Depends(get_current_user)
) -> list[LineupEntryOut]:
    """Replace this match's full lineup with the given player list — this is
    what appearance statistics are computed from, not team roster membership."""
    match = await check_match_operator(user, match_id)
    entries = await set_lineup(match, payload.player_ids)
    players = await _players_map(match)
    return [
        LineupEntryOut(
            player_id=str(e.player_id),
            player_name=players[e.player_id].name if e.player_id in players else "Unknown",
            team_id=str(e.team_id),
            is_starting=e.is_starting,
        )
        for e in entries
    ]
