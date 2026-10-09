from datetime import datetime, timedelta, timezone
from typing import Optional

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError, NotFoundError
from app.core.websocket import broadcast
from app.models import Group, GroupTeam, Match, MatchEvent, MatchLineup, Team
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings, sorted_group_standings
from app.services.tournament_stage import get_match_winner, refresh_tournament_stage

STAGE_RANK = {"group": 0, "semi": 1, "final": 2, "extra": 3}


async def compute_score(match: Match) -> tuple[int, int]:
    if not match.team1_id or not match.team2_id:
        return 0, 0
    events = await MatchEvent.find(MatchEvent.match_id == match.id, MatchEvent.type == "goal").to_list()
    score1 = sum(1 for e in events if e.team_id == match.team1_id)
    score2 = sum(1 for e in events if e.team_id == match.team2_id)
    return score1, score2


async def compute_scores_and_winners(
    matches: list[Match],
) -> dict[PydanticObjectId, tuple[int, int, Optional[PydanticObjectId]]]:
    """Batched score+winner lookup for a whole list of matches.

    Every list endpoint (GET /matches and its /upcoming, /live, /completed
    shortcuts) used to call compute_score(match) and, for each full_time
    match, get_match_winner(match) separately — each of those independently
    re-fetching that match's goal events, so a page of N matches issued up to
    2N MongoDB round-trips for data that could be fetched in one query.
    Found and fixed during the Timer/Half-Time audit's Performance &
    Scalability follow-up. Single-match code paths (match detail, player
    detail history, etc.) still use compute_score()/get_match_winner()
    directly — this is only for the list-endpoint hot path.
    """
    match_ids = [m.id for m in matches if m.team1_id and m.team2_id]
    events = (
        await MatchEvent.find({"match_id": {"$in": match_ids}, "type": "goal"}).to_list()
        if match_ids
        else []
    )
    events_by_match: dict[PydanticObjectId, list[MatchEvent]] = {}
    for e in events:
        events_by_match.setdefault(e.match_id, []).append(e)

    results: dict[PydanticObjectId, tuple[int, int, Optional[PydanticObjectId]]] = {}
    for m in matches:
        if not m.team1_id or not m.team2_id:
            results[m.id] = (0, 0, None)
            continue
        match_events = events_by_match.get(m.id, [])
        score1 = sum(1 for e in match_events if e.team_id == m.team1_id)
        score2 = sum(1 for e in match_events if e.team_id == m.team2_id)
        winner_id: Optional[PydanticObjectId] = None
        if m.status == "full_time":
            if score1 > score2:
                winner_id = m.team1_id
            elif score2 > score1:
                winner_id = m.team2_id
            else:
                winner_id = m.winner_override_id
        results[m.id] = (score1, score2, winner_id)
    return results


async def get_match_or_404(match_id: PydanticObjectId) -> Match:
    match = await Match.get(match_id)
    if match is None:
        raise NotFoundError("Match not found")
    return match


async def start_match(match: Match) -> Match:
    if match.status != "upcoming":
        raise ConflictError("Only an upcoming match can be started")
    if not match.team1_id or not match.team2_id:
        raise ConflictError("Both teams must be assigned before starting a match")
    match.status = "live"
    match.is_half_time = False
    match.elapsed_seconds = 0
    match.started_at = datetime.now(timezone.utc)
    match.ended_at = None
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def end_match(match: Match) -> Match:
    if match.status != "live":
        raise ConflictError("Only a live match can be ended")
    was_half_time = getattr(match, "is_half_time", False)
    match.status = "full_time"
    match.is_half_time = False
    if was_half_time and match.elapsed_seconds is not None and match.started_at:
        match.ended_at = match.started_at + timedelta(seconds=match.elapsed_seconds)
    else:
        match.ended_at = datetime.now(timezone.utc)
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    if match.stage == "group" and match.group_id:
        await recalculate_group_standings(match.group_id)
    await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def pause_half_time(match: Match, elapsed_seconds: Optional[int] = None) -> Match:
    if match.status != "live":
        raise ConflictError("Only a live match can be paused for half time")
    match.is_half_time = True
    if elapsed_seconds is not None and elapsed_seconds >= 0:
        match.elapsed_seconds = int(elapsed_seconds)
    elif match.started_at:
        now = datetime.now(timezone.utc)
        match.elapsed_seconds = max(0, int((now - match.started_at).total_seconds()))
    else:
        match.elapsed_seconds = 0
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def resume_match(match: Match) -> Match:
    if match.status != "live":
        raise ConflictError("Only a live match can be resumed")
    match.is_half_time = False
    elapsed = match.elapsed_seconds or 0
    match.started_at = datetime.now(timezone.utc) - timedelta(seconds=elapsed)
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def reset_timer(match: Match) -> Match:
    if match.status == "live":
        match.started_at = datetime.now(timezone.utc)
        match.elapsed_seconds = 0
        match.updated_at = datetime.now(timezone.utc)
        await match.save()
        await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def reopen_match(match: Match) -> Match:
    if match.status != "full_time":
        raise ConflictError("Only a completed match can be reopened")
    match.status = "live"
    match.is_half_time = False
    if match.started_at and match.ended_at:
        elapsed = (match.ended_at - match.started_at).total_seconds()
        match.started_at = datetime.now(timezone.utc) - timedelta(seconds=elapsed)
        match.elapsed_seconds = int(elapsed)
    elif not match.started_at:
        match.started_at = datetime.now(timezone.utc)
        match.elapsed_seconds = 0
    match.ended_at = None
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    if match.stage == "group" and match.group_id:
        await recalculate_group_standings(match.group_id)
    await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def cancel_match(match: Match) -> Match:
    """Cancel a not-yet-started match (e.g. rained out, forfeited before kickoff).
    Restricted to 'upcoming' — a live/completed match already has recorded events,
    so it should be ended/reopened through the normal lifecycle instead of cancelled."""
    if match.status != "upcoming":
        raise ConflictError("Only an upcoming match can be cancelled")
    match.status = "cancelled"
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def uncancel_match(match: Match) -> Match:
    if match.status != "cancelled":
        raise ConflictError("Match is not cancelled")
    match.status = "upcoming"
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id)})
    return match


async def set_winner(match: Match, team_id: PydanticObjectId) -> Match:
    if match.status != "full_time" or match.stage == "group":
        raise ConflictError("A winner can only be set for a completed knockout match")
    if team_id not in (match.team1_id, match.team2_id):
        raise ConflictError("Winner must be one of the two teams in this match")
    score1, score2 = await compute_score(match)
    if score1 != score2:
        raise ConflictError("Match was not drawn — the winner is already determined by the score")
    match.winner_override_id = team_id
    await match.save()
    await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_updated", "match_id": str(match.id)})
    return match


async def _renumber_matches(tournament_id: PydanticObjectId) -> None:
    groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    group_rank = {g.id: i for i, g in enumerate(groups)}
    matches = await Match.find(Match.tournament_id == tournament_id).to_list()

    def sort_key(m: Match):
        return (STAGE_RANK.get(m.stage, 99), group_rank.get(m.group_id, 99), str(m.id))

    matches.sort(key=sort_key)
    # Pass 1: Assign temporary negative numbers to avoid unique index collision
    for i, m in enumerate(matches, start=1):
        m.match_number = -(50000 + i)
        await m.save()

    # Pass 2: Assign final 1-based sequential numbers
    for i, m in enumerate(matches, start=1):
        m.match_number = i
        await m.save()


async def generate_group_fixtures(group_id: PydanticObjectId, force: bool) -> list[Match]:
    group = await Group.get(group_id)
    if group is None:
        raise NotFoundError("Group not found")

    group_teams = await GroupTeam.find(GroupTeam.group_id == group_id).to_list()
    if len(group_teams) != 3:
        raise ConflictError("A group needs exactly 3 teams before fixtures can be generated")
    team_ids = [gt.team_id for gt in group_teams]

    existing_matches = await Match.find(Match.group_id == group_id, Match.stage == "group").to_list()
    existing_ids = [m.id for m in existing_matches]
    has_results = False
    if existing_ids:
        has_results = bool(
            await MatchEvent.find({"match_id": {"$in": existing_ids}}).count()
        )
    if has_results and not force:
        raise ConflictError(
            "This group already has recorded results — pass force=true to erase them and regenerate"
        )

    for m in existing_matches:
        await MatchEvent.find(MatchEvent.match_id == m.id).delete()
        await MatchLineup.find(MatchLineup.match_id == m.id).delete()
        await m.delete()

    pairs = [(0, 1), (0, 2), (1, 2)]
    new_matches: list[Match] = []
    for idx, (i, j) in enumerate(pairs, start=1):
        match = Match(
            tournament_id=group.tournament_id,
            match_number=-(10000 + idx),  # unique temporary match_number to avoid unique index violation
            group_id=group_id,
            stage="group",
            team1_id=team_ids[i],
            team2_id=team_ids[j],
            status="upcoming",
        )
        await match.insert()
        new_matches.append(match)

    await _renumber_matches(group.tournament_id)

    # _renumber_matches re-fetches and re-saves every match for this
    # tournament under its own independent Match objects, so the `new_matches`
    # list built above is left holding stale in-memory copies — still showing
    # each match's temporary negative match_number, not the real final one
    # _renumber_matches just assigned. Returning those stale objects directly
    # is a real bug: any caller that acts on the returned matches (e.g. starts
    # one) would re-save that temporary negative match_number, and since every
    # call to this function reuses the same temporary number range, two
    # different groups' fixtures could then collide on the unique
    # (tournament_id, match_number) index. Found via a test added during the
    # Timer/Half-Time audit's Test Coverage follow-up. Re-fetching fixes it.
    refreshed = await Match.find({"_id": {"$in": [m.id for m in new_matches]}}).to_list()
    refreshed.sort(key=lambda m: m.match_number)
    for m in refreshed:
        await broadcast({"type": "match_updated", "match_id": str(m.id)})
    return refreshed


async def generate_semis(tournament_id: PydanticObjectId) -> list[Match]:
    groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    if len(groups) != 2:
        raise ConflictError("Tournament must have exactly 2 groups")

    for group in groups:
        group_matches = await Match.find(Match.group_id == group.id, Match.stage == "group").to_list()
        if not group_matches or any(m.status != "full_time" for m in group_matches):
            raise ConflictError("Both groups must be complete before generating semi-finals")

    semis = await _ensure_semi_slots(tournament_id)
    if len(semis) != 2:
        raise ConflictError("Expected exactly 2 semi-final slots")
    if any(m.team1_id for m in semis):
        raise ConflictError("Semi-finals have already been generated")

    standings_a = await sorted_group_standings(groups[0].id)
    standings_b = await sorted_group_standings(groups[1].id)
    if len(standings_a) < 2 or len(standings_b) < 2:
        raise ConflictError("Each group needs at least 2 teams with standings computed")

    # Per the official DCL Season 5 schedule: SF1 = Group A (2nd) vs Group B (1st),
    # SF2 = Group B (2nd) vs Group A (1st).
    semis[0].team1_id, semis[0].team2_id = standings_a[1].team_id, standings_b[0].team_id
    semis[1].team1_id, semis[1].team2_id = standings_b[1].team_id, standings_a[0].team_id
    await semis[0].save()
    await semis[1].save()
    await refresh_tournament_stage(tournament_id)
    for m in semis:
        await broadcast({"type": "match_updated", "match_id": str(m.id)})
    return semis


async def assert_no_conflict(
    tournament_id: PydanticObjectId,
    team1_id: PydanticObjectId,
    team2_id: PydanticObjectId,
    date: Optional[str],
    time: Optional[str],
    exclude_id: Optional[PydanticObjectId] = None,
) -> None:
    """Rejects a duplicate fixture (same two teams, same date and time) and a team
    being booked into two matches at the same date and time. Cancelled matches
    don't count."""
    if not date:
        return
    others = await Match.find(
        Match.tournament_id == tournament_id, Match.date == date, Match.status != "cancelled"
    ).to_list()
    pair = {team1_id, team2_id}
    for other in others:
        if exclude_id is not None and other.id == exclude_id:
            continue
        if {other.team1_id, other.team2_id} == pair and other.time == time:
            raise ConflictError(
                f"A match between these teams is already scheduled on {date}"
                + (f" at {time}" if time else "")
            )
        if time and other.time == time and pair & {other.team1_id, other.team2_id}:
            raise ConflictError(f"A selected team already plays another match on {date} at {time}")


async def _validate_teams_exist(
    tournament_id: PydanticObjectId, team1_id: PydanticObjectId, team2_id: PydanticObjectId
) -> None:
    if team1_id == team2_id:
        raise ConflictError("A team cannot play against itself — pick two different teams")
    for team_id in (team1_id, team2_id):
        team = await Team.get(team_id)
        if team is None or team.tournament_id != tournament_id:
            raise NotFoundError("Selected team does not exist in this tournament")


async def create_extra_match(
    tournament_id: PydanticObjectId,
    team1_id: PydanticObjectId,
    team2_id: PydanticObjectId,
    *,
    date: str,
    time: Optional[str],
    venue: Optional[str],
    label: Optional[str],
    duration_minutes: Optional[int],
    notes: Optional[str],
) -> Match:
    """Creates an additional match outside the group/knockout structure."""
    await _validate_teams_exist(tournament_id, team1_id, team2_id)
    await assert_no_conflict(tournament_id, team1_id, team2_id, date, time)

    for _ in range(5):  # retry if two admins create at the same instant (unique match_number)
        last = await Match.find(Match.tournament_id == tournament_id).sort("-match_number").first_or_none()
        match = Match(
            tournament_id=tournament_id,
            match_number=(last.match_number if last else 0) + 1,
            stage="extra",
            label=label or "Friendly",
            date=date,
            time=time,
            venue=venue,
            duration_minutes=duration_minutes,
            notes=notes,
            team1_id=team1_id,
            team2_id=team2_id,
        )
        try:
            await match.insert()
            break
        except DuplicateKeyError:
            continue
    else:
        raise ConflictError("Could not allocate a match number — please try again")
    await broadcast({"type": "match_updated", "match_id": str(match.id)})
    return match


async def delete_match(match: Match) -> None:
    """Permanently deletes any match, whatever its status or stage, together with its
    events and lineup, then recomputes everything derived from it: the affected players'
    statistics, the group standings and the tournament stage.

    A deleted semi-final / final slot is re-created by "Generate semi-finals / final"."""
    events = await MatchEvent.find(MatchEvent.match_id == match.id).to_list()
    lineup = await MatchLineup.find(MatchLineup.match_id == match.id).to_list()
    affected = (
        {e.player_id for e in events}
        | {e.assist_player_id for e in events if e.assist_player_id}
        | {entry.player_id for entry in lineup}
    )
    match_id, group_id, tournament_id, stage = str(match.id), match.group_id, match.tournament_id, match.stage

    await MatchEvent.find(MatchEvent.match_id == match.id).delete()
    await MatchLineup.find(MatchLineup.match_id == match.id).delete()
    await match.delete()

    for player_id in affected:
        stats = await recalculate_player_statistics(player_id)
        if stats and not any(
            [stats.goals, stats.assists, stats.yellow_cards, stats.red_cards, stats.potm_awards, stats.appearances]
        ):
            await stats.delete()
    if stage == "group" and group_id:
        await recalculate_group_standings(group_id)
    await refresh_tournament_stage(tournament_id)
    await broadcast({"type": "match_updated", "match_id": match_id})


_SEMI_SLOTS = (
    ("Semi-final 1", "Group A (2nd) vs Group B (1st)"),
    ("Semi-final 2", "Group B (2nd) vs Group A (1st)"),
)


async def _next_match_number(tournament_id: PydanticObjectId) -> int:
    last = await Match.find(Match.tournament_id == tournament_id).sort("-match_number").first_or_none()
    return (last.match_number if last else 0) + 1


async def _ensure_semi_slots(tournament_id: PydanticObjectId) -> list[Match]:
    """Returns the 2 semi-final slots in order (SF1, SF2), re-creating any that were deleted."""
    semis = await Match.find(Match.tournament_id == tournament_id, Match.stage == "semi").to_list()
    used = {m.label for m in semis}
    for label, notes in _SEMI_SLOTS:
        if len(semis) >= 2:
            break
        if label in used:
            continue
        slot = Match(
            tournament_id=tournament_id, match_number=await _next_match_number(tournament_id),
            stage="semi", label=label, notes=notes,
            date=next((m.date for m in semis if m.date), None),
        )
        await slot.insert()
        semis.append(slot)
    semis.sort(key=lambda m: (m.label or "~", m.match_number))
    return semis


async def _ensure_final_slot(tournament_id: PydanticObjectId) -> Match:
    final = await Match.find_one(Match.tournament_id == tournament_id, Match.stage == "final")
    if final is None:
        final = Match(
            tournament_id=tournament_id, match_number=await _next_match_number(tournament_id),
            stage="final", label="Final", notes="Winner SF1 vs Winner SF2",
        )
        await final.insert()
    return final


async def assign_match_teams(
    match: Match, team1_id: PydanticObjectId, team2_id: PydanticObjectId
) -> Match:
    """Admin manual override: sets the two teams of any not-yet-started match.

    Group matches only accept teams of that match's group; semi-finals can't
    reuse a team already placed in the other semi-final. Played/live/cancelled
    matches are never touched, so results, scores and events stay intact.
    """
    if match.status != "upcoming":
        raise ConflictError("Teams can only be changed while the match is still upcoming")
    await _validate_teams_exist(match.tournament_id, team1_id, team2_id)
    if match.stage == "extra":
        await assert_no_conflict(
            match.tournament_id, team1_id, team2_id, match.date, match.time, exclude_id=match.id
        )

    if match.stage == "group":
        members = {
            gt.team_id for gt in await GroupTeam.find(GroupTeam.group_id == match.group_id).to_list()
        }
        if not {team1_id, team2_id} <= members:
            raise ConflictError("Both teams must belong to this match's group")
    elif match.stage == "semi":
        other_semis = await Match.find(
            Match.tournament_id == match.tournament_id, Match.stage == "semi", Match.id != match.id
        ).to_list()
        taken = {t for m in other_semis for t in (m.team1_id, m.team2_id) if t}
        if {team1_id, team2_id} & taken:
            raise ConflictError("A selected team is already assigned to the other semi-final")

    changed = (match.team1_id, match.team2_id) != (team1_id, team2_id)
    match.team1_id, match.team2_id = team1_id, team2_id
    await match.save()
    if changed:
        # Lineup entries are tied to the old teams' players.
        await MatchLineup.find(MatchLineup.match_id == match.id).delete()
    await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_updated", "match_id": str(match.id)})
    return match


async def generate_final(tournament_id: PydanticObjectId) -> Match:
    semis = sorted(
        await Match.find(Match.tournament_id == tournament_id, Match.stage == "semi").to_list(),
        key=lambda m: (m.label or "~", m.match_number),
    )
    if len(semis) != 2 or any(m.status != "full_time" for m in semis):
        raise ConflictError("Both semi-finals must be completed before generating the final")

    winners = [await get_match_winner(m) for m in semis]
    if any(w is None for w in winners):
        raise ConflictError("Both semi-finals must have a decided winner")

    final = await _ensure_final_slot(tournament_id)
    if final.team1_id:
        raise ConflictError("The final has already been generated")

    final.team1_id, final.team2_id = winners[0], winners[1]
    await final.save()
    await refresh_tournament_stage(tournament_id)
    await broadcast({"type": "match_updated", "match_id": str(final.id)})
    return final
