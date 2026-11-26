from datetime import datetime, timedelta, timezone
from typing import Optional

from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError, NotFoundError
from app.core.websocket import broadcast
from app.models import Group, GroupTeam, Match, MatchEvent, MatchLineup, Team, Tournament
from app.schemas.match import (
    BracketChampionNode,
    BracketMatchNode,
    BracketRoundNode,
    BracketTeamNode,
    BracketTreeOut,
)
from app.services.bracket import (
    _ensure_final_slot,
    _ensure_quarter_slots,
    _ensure_semi_slots,
    _next_match_number,
    assert_downstream_unstarted,
    recompute_bracket,
)
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings
from app.services.tournament_stage import (
    KNOCKOUT_SIZES,
    compute_knockout_pairings,
    get_match_winner,
    refresh_tournament_stage,
)

STAGE_RANK = {"group": 0, "quarter": 1, "semi": 2, "final": 3, "extra": 4}


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
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
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
    if match.stage in ("quarter", "semi", "final"):
        await recompute_bracket(match.tournament_id, trigger_match=match)
    else:
        await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
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
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def resume_match(match: Match) -> Match:
    if match.status != "live":
        raise ConflictError("Only a live match can be resumed")
    match.is_half_time = False
    elapsed = match.elapsed_seconds or 0
    match.started_at = datetime.now(timezone.utc) - timedelta(seconds=elapsed)
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def reset_timer(match: Match) -> Match:
    if match.status != "live":
        raise ConflictError("The timer can only be reset while the match is live")
    match.started_at = datetime.now(timezone.utc)
    match.elapsed_seconds = 0
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def reopen_match(match: Match) -> Match:
    if match.status != "full_time":
        raise ConflictError("Only a completed match can be reopened")
    await assert_downstream_unstarted(match)
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
    if match.stage in ("quarter", "semi", "final"):
        # No longer a decided result: the slot it fed is cleared again.
        await recompute_bracket(match.tournament_id, trigger_match=match)
    else:
        await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def cancel_match(match: Match) -> Match:
    """Cancel a not-yet-started match (e.g. rained out, forfeited before kickoff).
    Restricted to 'upcoming' — a live/completed match already has recorded events,
    so it should be ended/reopened through the normal lifecycle instead of cancelled."""
    if match.status != "upcoming":
        raise ConflictError("Only an upcoming match can be cancelled")
    match.status = "cancelled"
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def uncancel_match(match: Match) -> Match:
    if match.status != "cancelled":
        raise ConflictError("Match is not cancelled")
    match.status = "upcoming"
    match.updated_at = datetime.now(timezone.utc)
    await match.save()
    await broadcast({"type": "match_status_changed", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def set_winner(match: Match, team_id: PydanticObjectId) -> Match:
    if match.status != "full_time" or match.stage == "group":
        raise ConflictError("A winner can only be set for a completed knockout match")
    if team_id not in (match.team1_id, match.team2_id):
        raise ConflictError("Winner must be one of the two teams in this match")
    score1, score2 = await compute_score(match)
    if score1 != score2:
        raise ConflictError("Match was not drawn — the winner is already determined by the score")
    await assert_downstream_unstarted(match)
    match.winner_override_id = team_id
    await match.save()
    await recompute_bracket(match.tournament_id, trigger_match=match)
    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


def compute_circle_method_pairs(
    team_ids: list[PydanticObjectId],
) -> list[tuple[PydanticObjectId, PydanticObjectId]]:
    """Generates round-robin fixtures using Berger's Circle Method.
    Supports even and odd team counts with balanced home/away alternation.
    """
    n = len(team_ids)
    if n < 2:
        return []

    teams: list[Optional[PydanticObjectId]] = list(team_ids)
    if n % 2 != 0:
        teams.append(None)  # Virtual BYE slot
        n += 1

    num_rounds = n - 1
    half = n // 2
    fixtures: list[tuple[PydanticObjectId, PydanticObjectId]] = []

    # Rotation: teams[0] stays fixed at pivot; teams[1:] rotate cyclically
    for r in range(num_rounds):
        for i in range(half):
            t1 = teams[i]
            t2 = teams[n - 1 - i]
            if t1 is not None and t2 is not None:
                if (r + i) % 2 == 0:
                    fixtures.append((t1, t2))
                else:
                    fixtures.append((t2, t1))
        # Rotate circle elements clockwise
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]

    return fixtures


async def purge_matches(matches: list[Match]) -> None:
    """Deletes matches with their events and lineups, then recomputes everything derived from
    them exactly once: affected players' statistics, the touched groups' standings and the
    tournament stage."""
    if not matches:
        return
    match_ids = [m.id for m in matches]
    events = await MatchEvent.find({"match_id": {"$in": match_ids}}).to_list()
    lineup = await MatchLineup.find({"match_id": {"$in": match_ids}}).to_list()
    affected = (
        {e.player_id for e in events}
        | {e.assist_player_id for e in events if e.assist_player_id}
        | {entry.player_id for entry in lineup}
    )
    group_ids = {m.group_id for m in matches if m.stage == "group" and m.group_id}
    tournament_ids = {m.tournament_id for m in matches}

    await MatchEvent.find({"match_id": {"$in": match_ids}}).delete()
    await MatchLineup.find({"match_id": {"$in": match_ids}}).delete()
    await Match.find({"_id": {"$in": match_ids}}).delete()

    for player_id in affected:
        stats = await recalculate_player_statistics(player_id)
        if stats and not any(
            [stats.goals, stats.assists, stats.yellow_cards, stats.red_cards, stats.potm_awards, stats.appearances]
        ):
            await stats.delete()
    for group_id in group_ids:
        await recalculate_group_standings(group_id)
    for tournament_id in tournament_ids:
        await refresh_tournament_stage(tournament_id)


async def generate_group_fixtures(group_id: PydanticObjectId, force: bool) -> list[Match]:
    group = await Group.get(group_id)
    if group is None:
        raise NotFoundError("Group not found")

    tournament = await Tournament.get(group.tournament_id)
    target_teams = (
        tournament.config.teams_per_group
        if tournament and getattr(tournament, "config", None)
        else 3
    )

    group_teams = await GroupTeam.find(GroupTeam.group_id == group_id).to_list()
    if len(group_teams) != target_teams:
        raise ConflictError(f"A group needs exactly {target_teams} teams before fixtures can be generated")
    team_ids = [gt.team_id for gt in group_teams]

    existing_matches = await Match.find(Match.group_id == group_id, Match.stage == "group").to_list()
    existing_ids = [m.id for m in existing_matches]
    has_results = False
    if existing_ids:
        has_results = bool(
            await MatchEvent.find({"match_id": {"$in": existing_ids}}).count()
        ) or any(m.status in ("live", "full_time") for m in existing_matches)
    if has_results and not force:
        raise ConflictError(
            "This group already has recorded results — pass force=true to erase them and regenerate"
        )
    if existing_matches and await _knockout_is_seeded(group.tournament_id):
        raise ConflictError(
            "The knockout stage has already been seeded from these groups — delete the knockout "
            "matches before regenerating group fixtures"
        )

    # The replaced matches' numbers are reused so every other match keeps its number (and a
    # played match is never renumbered); extra fixtures continue after the highest number.
    freed_numbers = sorted(m.match_number for m in existing_matches)
    await purge_matches(existing_matches)

    pairs = compute_circle_method_pairs(team_ids)
    new_matches: list[Match] = []
    for t1, t2 in pairs:
        number = freed_numbers.pop(0) if freed_numbers else await _next_match_number(group.tournament_id)
        match = Match(
            tournament_id=group.tournament_id,
            match_number=number,
            group_id=group_id,
            stage="group",
            team1_id=t1,
            team2_id=t2,
            status="upcoming",
        )
        await match.insert()
        new_matches.append(match)

    new_matches.sort(key=lambda m: m.match_number)
    for m in new_matches:
        await broadcast({"type": "match_updated", "match_id": str(m.id), "tournament_id": str(m.tournament_id)})
    return new_matches


async def _knockout_is_seeded(tournament_id: PydanticObjectId) -> bool:
    return bool(
        await Match.find(
            Match.tournament_id == tournament_id, {"stage": {"$in": ["quarter", "semi", "final"]}}
        ).count()
        and await Match.find(
            Match.tournament_id == tournament_id,
            {"stage": {"$in": ["quarter", "semi", "final"]}, "team1_id": {"$ne": None}},
        ).count()
    )


async def _assert_group_stage_complete(tournament_id: PydanticObjectId, what: str) -> None:
    groups = await Group.find(Group.tournament_id == tournament_id).to_list()
    checked = 0
    for group in groups:
        if not await GroupTeam.find(GroupTeam.group_id == group.id).count():
            continue
        group_matches = await Match.find(Match.group_id == group.id, Match.stage == "group").to_list()
        live_matches = [m for m in group_matches if m.status != "cancelled"]
        if not live_matches or any(m.status != "full_time" for m in live_matches):
            raise ConflictError(f"All groups must be complete before {what}")
        checked += 1
    if not checked:
        raise ConflictError(f"All groups must be complete before {what}")


async def _config_of(tournament_id: PydanticObjectId) -> tuple[str, int]:
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        raise NotFoundError("Tournament not found")
    return tournament.config.knockout_format, tournament.config.qualifiers_per_group


async def generate_semis(tournament_id: PydanticObjectId) -> list[Match]:
    fmt, qualifiers = await _config_of(tournament_id)
    if fmt != "semis_final":
        raise ConflictError("This tournament's knockout format does not start with semi-finals")
    await _assert_group_stage_complete(tournament_id, "generating semi-finals")

    semis = await _ensure_semi_slots(tournament_id)
    if len(semis) != 2:
        raise ConflictError("Expected exactly 2 semi-final slots")
    if any(m.team1_id for m in semis):
        raise ConflictError("Semi-finals have already been generated")

    pairings = await compute_knockout_pairings(tournament_id, fmt, qualifiers)
    for slot, (team1, team2) in zip(semis, pairings):
        slot.team1_id, slot.team2_id = team1, team2
        await slot.save()
    await refresh_tournament_stage(tournament_id)
    for m in semis:
        await broadcast({"type": "match_updated", "match_id": str(m.id), "tournament_id": str(m.tournament_id)})
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


async def create_new_match(
    tournament_id: PydanticObjectId,
    team1_id: PydanticObjectId,
    team2_id: PydanticObjectId,
    *,
    stage: str = "extra",
    group_id: Optional[PydanticObjectId] = None,
    match_number: Optional[int] = None,
    date: str,
    time: Optional[str],
    venue: Optional[str],
    label: Optional[str],
    duration_minutes: Optional[int],
    notes: Optional[str],
) -> Match:
    """Creates a match: either an additional "extra" match, or a real group-stage fixture
    (e.g. to restore one that was deleted)."""
    await _validate_teams_exist(tournament_id, team1_id, team2_id)

    if stage == "group":
        if group_id is None:
            raise ConflictError("Choose the group for a group-stage fixture")
        group = await Group.get(group_id)
        if group is None or group.tournament_id != tournament_id:
            raise NotFoundError("Group not found")
        members = {gt.team_id for gt in await GroupTeam.find(GroupTeam.group_id == group_id).to_list()}
        if not {team1_id, team2_id} <= members:
            raise ConflictError(f"Both teams must belong to Group {group.name}")
        for other in await Match.find(Match.group_id == group_id, Match.stage == "group").to_list():
            if {other.team1_id, other.team2_id} == {team1_id, team2_id} and other.status != "cancelled":
                raise ConflictError(f"These two teams already have a fixture in Group {group.name} (Match #{other.match_number})")
        label = None  # group fixtures have no custom title
    else:
        group_id = None
        label = label or "Friendly"

    await assert_no_conflict(tournament_id, team1_id, team2_id, date, time)

    if match_number is not None and await Match.find_one(
        Match.tournament_id == tournament_id, Match.match_number == match_number
    ):
        raise ConflictError(f"Match number {match_number} is already used by another match")

    for _ in range(5):  # retry if two admins create at the same instant (unique match_number)
        match = Match(
            tournament_id=tournament_id,
            match_number=match_number if match_number is not None else await _next_match_number(tournament_id),
            stage=stage,
            group_id=group_id,
            label=label,
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
            if match_number is not None:
                raise ConflictError(f"Match number {match_number} is already used by another match")
            continue
    else:
        raise ConflictError("Could not allocate a match number — please try again")
    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def delete_match(match: Match) -> None:
    """Permanently deletes any match, whatever its status or stage, together with its
    events and lineup, then recomputes everything derived from it (see purge_matches).

    A deleted semi-final / final slot is re-created by "Generate semi-finals / final"."""
    match_id, tournament_id = str(match.id), match.tournament_id
    await purge_matches([match])
    await broadcast({"type": "match_updated", "match_id": match_id, "tournament_id": str(tournament_id)})


async def assign_match_teams(
    match: Match, team1_id: PydanticObjectId, team2_id: PydanticObjectId
) -> Match:
    """Admin manual override: sets the two teams of any not-yet-started match.

    Group matches only accept teams of that match's group; knockout matches can't
    reuse a team already placed in another match in that same stage. Played/live/cancelled
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
    elif match.stage in ("quarter", "semi"):
        other_matches = await Match.find(
            Match.tournament_id == match.tournament_id, Match.stage == match.stage, Match.id != match.id
        ).to_list()
        taken = {t for m in other_matches for t in (m.team1_id, m.team2_id) if t}
        if {team1_id, team2_id} & taken:
            raise ConflictError(f"A selected team is already assigned to another {match.stage}-final")

    changed = (match.team1_id, match.team2_id) != (team1_id, team2_id)
    match.team1_id, match.team2_id = team1_id, team2_id
    await match.save()
    if changed:
        # Lineup entries are tied to the old teams' players.
        await MatchLineup.find(MatchLineup.match_id == match.id).delete()
    await refresh_tournament_stage(match.tournament_id)
    await broadcast({"type": "match_updated", "match_id": str(match.id), "tournament_id": str(match.tournament_id)})
    return match


async def generate_final(tournament_id: PydanticObjectId) -> Match:
    """Seeds the final from the semi-final winners. Normally this already happened when the
    second semi-final ended; calling it again is harmless and returns the seeded final."""
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
    await recompute_bracket(tournament_id)
    final = await Match.get(final.id)
    final.bracket_slot = "FINAL"
    await final.save()
    return final


async def seed_knockout_bracket(tournament_id: PydanticObjectId) -> list[Match]:
    """Seeds the first knockout round according to the tournament's knockout_format and
    qualifier settings. Later rounds fill in by themselves as results come in."""
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        raise NotFoundError("Tournament not found")

    fmt, qualifiers = tournament.config.knockout_format, tournament.config.qualifiers_per_group

    if fmt == "none":
        await refresh_tournament_stage(tournament_id)
        return []

    if fmt == "semis_final":
        return await generate_semis(tournament_id)

    if fmt in KNOCKOUT_SIZES:  # quarters_semis_final
        await _assert_group_stage_complete(tournament_id, "seeding knockout rounds")
        quarters = await _ensure_quarter_slots(tournament_id)
        await _ensure_semi_slots(tournament_id)
        await _ensure_final_slot(tournament_id)
        if any(m.team1_id for m in quarters):
            raise ConflictError("Quarter-finals have already been generated")

        pairings = await compute_knockout_pairings(tournament_id, fmt, qualifiers)
        for quarter, (team1, team2) in zip(quarters, pairings):
            quarter.team1_id, quarter.team2_id = team1, team2
            await quarter.save()
            await broadcast({"type": "match_updated", "match_id": str(quarter.id), "tournament_id": str(quarter.tournament_id)})
        await refresh_tournament_stage(tournament_id)
        return quarters
    return []


async def build_tournament_bracket(tournament_id: PydanticObjectId) -> BracketTreeOut:
    """Builds a structured bracket tree for visual display on the frontend."""
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        raise NotFoundError("Tournament not found")

    fmt = tournament.config.knockout_format if getattr(tournament, "config", None) else "semis_final"

    matches = await Match.find(
        Match.tournament_id == tournament_id,
        {"stage": {"$in": ["quarter", "semi", "final"]}},
    ).sort("match_number").to_list()

    teams = {t.id: t for t in await Team.find(Team.tournament_id == tournament_id).to_list()}
    scores_and_winners = await compute_scores_and_winners(matches)

    rounds_map: dict[int, list[BracketMatchNode]] = {}
    round_names = {1: "Quarter-finals", 2: "Semi-finals", 3: "Final"}
    if fmt == "semis_final":
        round_names = {1: "Semi-finals", 2: "Final"}

    for m in matches:
        score1, score2, winner_id = scores_and_winners[m.id]
        t1 = teams.get(m.team1_id)
        t2 = teams.get(m.team2_id)
        slot = m.bracket_slot or m.label or f"M{m.match_number}"

        t1_node = (
            BracketTeamNode(id=str(t1.id), name=t1.name, crest_url=t1.crest_url or t1.logo_url, color=t1.color)
            if t1
            else None
        )
        t2_node = (
            BracketTeamNode(id=str(t2.id), name=t2.name, crest_url=t2.crest_url or t2.logo_url, color=t2.color)
            if t2
            else None
        )

        round_idx = m.round_order or (1 if m.stage == "semi" else 2 if m.stage == "final" else 1)
        if fmt == "semis_final":
            round_idx = 1 if m.stage == "semi" else 2

        match_node = BracketMatchNode(
            bracket_slot=slot,
            match_id=str(m.id),
            match_number=m.match_number,
            stage=m.stage,
            label=m.label,
            team1=t1_node,
            team2=t2_node,
            score1=score1,
            score2=score2,
            winner_id=str(winner_id) if winner_id else None,
            status=m.status,
            notes=m.notes,
        )
        rounds_map.setdefault(round_idx, []).append(match_node)

    round_nodes = [
        BracketRoundNode(
            round_order=r_order,
            round_name=round_names.get(r_order, f"Round {r_order}"),
            matches=match_list,
        )
        for r_order, match_list in sorted(rounds_map.items())
    ]

    champ_node = None
    if tournament.champion_team_id and tournament.champion_team_id in teams:
        champ_team = teams[tournament.champion_team_id]
        champ_node = BracketChampionNode(
            team_id=str(champ_team.id),
            name=champ_team.name,
            crest_url=champ_team.crest_url or champ_team.logo_url,
        )

    return BracketTreeOut(
        tournament_id=str(tournament_id),
        knockout_format=fmt,
        rounds=round_nodes,
        champion=champ_node,
    )

