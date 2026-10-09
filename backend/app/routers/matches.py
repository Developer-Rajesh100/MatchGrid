from typing import Optional

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_admin
from app.core.websocket import broadcast
from app.models import Admin, Group, Match, MatchEvent, MatchLineup, Player, Team, Tournament
from app.schemas.match import (
    AssignTeamsRequest,
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
    cancel_match,
    compute_score,
    compute_scores_and_winners,
    create_extra_match,
    delete_extra_match,
    end_match,
    generate_final,
    generate_group_fixtures,
    generate_semis,
    get_match_or_404,
    pause_half_time,
    reopen_match,
    reset_timer,
    resume_match,
    set_winner,
    start_match,
    uncancel_match,
)
from app.services.serializers import match_event_to_out, match_to_out
from app.services.tournament_scope import get_active_tournament_id
from app.services.tournament_stage import get_match_winner

router = APIRouter(prefix="/matches", tags=["matches"])


async def _teams_map(*matches: Match) -> dict:
    ids = {m.team1_id for m in matches} | {m.team2_id for m in matches}
    ids.discard(None)
    teams = await Team.find({"_id": {"$in": list(ids)}}).to_list()
    return {t.id: t for t in teams}


async def _groups_map() -> dict:
    return {g.id: g for g in await Group.find_all().to_list()}


async def _to_out(match: Match) -> MatchOut:
    teams = await _teams_map(match)
    groups = await _groups_map()
    score1, score2 = await compute_score(match)
    winner_id = await get_match_winner(match) if match.status == "full_time" else None
    group_name = groups[match.group_id].name if match.group_id in groups else None
    return match_to_out(match, teams, score1, score2, winner_id, group_name)


async def _list_matches(
    team_id: Optional[str] = None,
    stage: Optional[str] = None,
    group_id: Optional[str] = None,
    status: Optional[str] = None,
    date: Optional[str] = None,
) -> list[MatchOut]:
    """Plain-Python filtering helper, shared by the general list endpoint and
    the /upcoming, /live, /completed shortcuts below. Deliberately NOT the
    route handler itself — FastAPI's Query(default=...) sentinels only get
    resolved to real values when a route runs through the ASGI request
    pipeline, so calling a `Query(...)`-decorated function directly (e.g.
    `list_matches(status="upcoming")`) leaves the *other* parameters bound to
    the Query object itself, not None, which breaks filtering downstream."""
    filters: dict = {"tournament_id": await get_active_tournament_id()}
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
    teams = await _teams_map(*matches)
    groups = await _groups_map()
    scores_and_winners = await compute_scores_and_winners(matches)

    out = []
    for m in matches:
        score1, score2, winner_id = scores_and_winners[m.id]
        group_name = groups[m.group_id].name if m.group_id in groups else None
        out.append(match_to_out(m, teams, score1, score2, winner_id, group_name))
    return out


@router.get("", response_model=list[MatchOut])
async def list_matches(
    team_id: Optional[str] = Query(default=None, description="Filter to matches involving this team"),
    stage: Optional[str] = Query(default=None, description="group | semi | final"),
    group_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None, description="upcoming | live | full_time | cancelled"),
    date: Optional[str] = Query(default=None, description="Exact match date, YYYY-MM-DD"),
) -> list[MatchOut]:
    """List matches, optionally filtered by team, stage, group, status, and/or date."""
    return await _list_matches(team_id, stage, group_id, status, date)


@router.get("/upcoming", response_model=list[MatchOut])
async def list_upcoming() -> list[MatchOut]:
    """Scheduled matches that haven't started yet, soonest first."""
    return await _list_matches(status="upcoming")


@router.get("/live", response_model=list[MatchOut])
async def list_live() -> list[MatchOut]:
    """Matches currently in progress."""
    return await _list_matches(status="live")


@router.get("/completed", response_model=list[MatchOut])
async def list_completed() -> list[MatchOut]:
    """Matches that have finished (full time)."""
    return await _list_matches(status="full_time")


@router.get("/{match_id}", response_model=MatchDetailOut)
async def get_match(match_id: str) -> MatchDetailOut:
    match = await get_match_or_404(PydanticObjectId(match_id))
    base = await _to_out(match)

    events = await MatchEvent.find(MatchEvent.match_id == match.id).sort("minute").to_list()
    players = {p.id: p for p in await Player.find_all().to_list()}
    event_outs = [match_event_to_out(e, players) for e in events]

    lineup = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    return MatchDetailOut(
        **base.model_dump(), events=event_outs, lineup=[str(entry.player_id) for entry in lineup]
    )


@router.patch("/{match_id}", response_model=MatchOut)
async def update_match(
    match_id: str, payload: MatchUpdate, _admin: Admin = Depends(get_current_admin)
) -> MatchOut:
    """Update a match's scheduled date/time/venue/duration/notes. Does not change status or score."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    changes = payload.model_dump(exclude_unset=True)
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
    await broadcast({"type": "match_updated", "match_id": str(match.id)})
    return await _to_out(match)


@router.post("", response_model=MatchOut, status_code=201)
async def create_match(payload: MatchCreate, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """Create an additional match (stage "extra") between two existing teams (admin only).
    Never affects group standings, the tournament stage or tournament statistics."""
    match = await create_extra_match(
        await get_active_tournament_id(),
        PydanticObjectId(payload.team1_id),
        PydanticObjectId(payload.team2_id),
        date=payload.date,
        time=payload.time,
        venue=payload.venue,
        label=payload.label,
        duration_minutes=payload.duration_minutes,
        notes=payload.notes,
    )
    return await _to_out(match)


@router.delete("/{match_id}", status_code=204)
async def delete_match(match_id: str, _admin: Admin = Depends(get_current_admin)) -> None:
    """Delete an unplayed admin-created match. Group/knockout and played matches are protected."""
    await delete_extra_match(await get_match_or_404(PydanticObjectId(match_id)))


@router.put("/{match_id}/teams", response_model=MatchOut)
async def assign_teams(
    match_id: str, payload: AssignTeamsRequest, _admin: Admin = Depends(get_current_admin)
) -> MatchOut:
    """Manually assign the two teams of an upcoming match — group, semi-final or final (admin only)."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    await assign_match_teams(
        match, PydanticObjectId(payload.team1_id), PydanticObjectId(payload.team2_id)
    )
    return await _to_out(match)


@router.post("/{match_id}/start", response_model=MatchOut)
async def start(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """upcoming -> live. Requires both teams to already be assigned."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await start_match(match)
    return await _to_out(match)


@router.post("/{match_id}/end", response_model=MatchOut)
async def end(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """live -> full_time. Triggers a standings/statistics/tournament-stage refresh."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await end_match(match)
    return await _to_out(match)


@router.post("/{match_id}/reopen", response_model=MatchOut)
async def reopen(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """full_time -> live, to correct a mis-recorded event. Also refreshes standings/stage."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await reopen_match(match)
    return await _to_out(match)


@router.post("/{match_id}/half-time", response_model=MatchOut)
async def half_time(
    match_id: str,
    payload: Optional[HalfTimePayload] = None,
    _admin: Admin = Depends(get_current_admin),
) -> MatchOut:
    """Pause live match for Half Time. Admin only."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    elapsed = payload.elapsed_seconds if payload else None
    match = await pause_half_time(match, elapsed_seconds=elapsed)
    return await _to_out(match)


@router.post("/{match_id}/resume", response_model=MatchOut)
async def resume(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """Resume match from Half Time. Admin only."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await resume_match(match)
    return await _to_out(match)


@router.post("/{match_id}/reset-timer", response_model=MatchOut)
async def reset_match_timer(
    match_id: str, _admin: Admin = Depends(get_current_admin)
) -> MatchOut:
    """Reset match timer to 00:00. Admin only."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await reset_timer(match)
    return await _to_out(match)


@router.post("/{match_id}/cancel", response_model=MatchOut)
async def cancel(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """Cancel a not-yet-started match. Only valid while status is 'upcoming'."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await cancel_match(match)
    return await _to_out(match)


@router.post("/{match_id}/uncancel", response_model=MatchOut)
async def uncancel(match_id: str, _admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """Revert a cancelled match back to 'upcoming'."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await uncancel_match(match)
    return await _to_out(match)


@router.post("/{match_id}/winner", response_model=MatchOut)
async def winner(
    match_id: str, payload: WinnerRequest, _admin: Admin = Depends(get_current_admin)
) -> MatchOut:
    """Manually record the winner of a drawn knockout match (e.g. on penalties).
    Only valid for a completed, tied, non-group match."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    match = await set_winner(match, PydanticObjectId(payload.team_id))
    return await _to_out(match)


@router.post("/generate-group-fixtures", response_model=list[MatchOut])
async def generate_fixtures(
    payload: GenerateGroupFixturesRequest, _admin: Admin = Depends(get_current_admin)
) -> list[MatchOut]:
    """(Re)generate a group's 3 round-robin matches from its 3 assigned teams.
    If the group already has recorded results, pass force=true to erase and regenerate."""
    matches = await generate_group_fixtures(PydanticObjectId(payload.group_id), payload.force)
    teams = await _teams_map(*matches)
    groups = await _groups_map()
    return [
        match_to_out(m, teams, 0, 0, group_name=groups[m.group_id].name if m.group_id in groups else None)
        for m in matches
    ]


@router.post("/generate-semis", response_model=list[MatchOut])
async def do_generate_semis(_admin: Admin = Depends(get_current_admin)) -> list[MatchOut]:
    """Seed the 2 semi-finals from final group standings: SF1 = A2 vs B1, SF2 = B2 vs A1.
    Requires both groups fully complete and no semis generated yet."""
    tournament = await Tournament.find_one()
    matches = await generate_semis(tournament.id)
    return [await _to_out(m) for m in matches]


@router.post("/generate-final", response_model=MatchOut)
async def do_generate_final(_admin: Admin = Depends(get_current_admin)) -> MatchOut:
    """Seed the final from the two semi-final winners. Requires both semis
    completed with a decided winner (score or manual override)."""
    tournament = await Tournament.find_one()
    match = await generate_final(tournament.id)
    return await _to_out(match)


# ---- Match events ----


@router.get("/{match_id}/events", response_model=list[MatchEventOut])
async def list_events(match_id: str) -> list[MatchEventOut]:
    match = await get_match_or_404(PydanticObjectId(match_id))
    events = await MatchEvent.find(MatchEvent.match_id == match.id).sort("minute").to_list()
    players = {p.id: p for p in await Player.find_all().to_list()}
    return [match_event_to_out(e, players) for e in events]


@router.post("/{match_id}/events", response_model=MatchEventOut, status_code=201)
async def create_event(
    match_id: str, payload: MatchEventCreate, admin: Admin = Depends(get_current_admin)
) -> MatchEventOut:
    """Record a goal/yellow/red/player-of-the-match event. Recording a new potm
    replaces any existing one for this match (max one per match). Not allowed
    while the match is still 'upcoming'. Recalculates standings/statistics."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    event = await add_event(match, payload, admin.id)
    players = {p.id: p for p in await Player.find_all().to_list()}
    return match_event_to_out(event, players)


@router.delete("/{match_id}/events/{event_id}", status_code=204)
async def delete_event(
    match_id: str, event_id: str, _admin: Admin = Depends(get_current_admin)
) -> None:
    match = await get_match_or_404(PydanticObjectId(match_id))
    await remove_event(match, PydanticObjectId(event_id))


# ---- Match lineup ----


@router.get("/{match_id}/lineup", response_model=list[LineupEntryOut])
async def get_lineup(match_id: str) -> list[LineupEntryOut]:
    match = await get_match_or_404(PydanticObjectId(match_id))
    entries = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    players = {p.id: p for p in await Player.find_all().to_list()}
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
    match_id: str, payload: LineupSetRequest, _admin: Admin = Depends(get_current_admin)
) -> list[LineupEntryOut]:
    """Replace this match's full lineup with the given player list — this is
    what appearance statistics are computed from, not team roster membership."""
    match = await get_match_or_404(PydanticObjectId(match_id))
    entries = await set_lineup(match, payload.player_ids)
    players = {p.id: p for p in await Player.find_all().to_list()}
    return [
        LineupEntryOut(
            player_id=str(e.player_id),
            player_name=players[e.player_id].name if e.player_id in players else "Unknown",
            team_id=str(e.team_id),
            is_starting=e.is_starting,
        )
        for e in entries
    ]
