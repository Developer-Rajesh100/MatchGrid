"""Knockout bracket slots and progression.

`recompute_bracket` is the one place that moves winners forward (quarter -> semi -> final).
It is idempotent: it derives every downstream slot from the current results, so calling it after
any end / reopen / event / winner change always converges on the same bracket.
"""

import re
from typing import Optional

from beanie import PydanticObjectId

from app.core.errors import ConflictError
from app.core.websocket import broadcast
from app.models import Match, MatchLineup, Tournament
from app.services.tournament_stage import get_match_winner, match_goals, refresh_tournament_stage

# source slot -> (target slot, team field of the target it feeds)
SLOT_TARGETS: dict[str, tuple[str, str]] = {
    "QF1": ("SF1", "team1_id"),
    "QF2": ("SF1", "team2_id"),
    "QF3": ("SF2", "team1_id"),
    "QF4": ("SF2", "team2_id"),
    "SF1": ("FINAL", "team1_id"),
    "SF2": ("FINAL", "team2_id"),
}
_PROPAGATION_ORDER = ["QF1", "QF2", "QF3", "QF4", "SF1", "SF2"]
_KNOCKOUT_STAGES = ("quarter", "semi", "final")


def slot_of(match: Match) -> Optional[str]:
    """Bracket slot of a knockout match, falling back to its label for pre-slot legacy rows."""
    if match.bracket_slot:
        return match.bracket_slot
    if match.stage == "final":
        return "FINAL"
    digit = re.search(r"(\d)", match.label or "")
    if match.stage in ("quarter", "semi") and digit:
        return f"{'QF' if match.stage == 'quarter' else 'SF'}{digit.group(1)}"
    return None


_QUARTER_SLOTS = (
    ("Quarter-final 1", "QF1", 1),
    ("Quarter-final 2", "QF2", 1),
    ("Quarter-final 3", "QF3", 1),
    ("Quarter-final 4", "QF4", 1),
)

async def _next_match_number(tournament_id: PydanticObjectId) -> int:
    last = await Match.find(Match.tournament_id == tournament_id).sort("-match_number").first_or_none()
    return (last.match_number if last else 0) + 1


async def _ensure_quarter_slots(tournament_id: PydanticObjectId) -> list[Match]:
    """Returns the 4 quarter-final slots in order (QF1..QF4), creating any missing."""
    quarters = await Match.find(Match.tournament_id == tournament_id, Match.stage == "quarter").to_list()
    used = {m.bracket_slot or m.label for m in quarters}
    for label, slot_name, round_ord in _QUARTER_SLOTS:
        if len(quarters) >= 4:
            break
        if slot_name in used or label in used:
            continue
        slot = Match(
            tournament_id=tournament_id,
            match_number=await _next_match_number(tournament_id),
            stage="quarter",
            bracket_slot=slot_name,
            round_order=round_ord,
            label=label,
        )
        await slot.insert()
        quarters.append(slot)
    quarters.sort(key=lambda m: (m.bracket_slot or m.label or "~", m.match_number))
    return quarters


async def _ensure_semi_slots(tournament_id: PydanticObjectId) -> list[Match]:
    """Returns the 2 semi-final slots in order (SF1, SF2), re-creating any that were deleted."""
    semis = await Match.find(Match.tournament_id == tournament_id, Match.stage == "semi").to_list()
    used = {m.bracket_slot or m.label for m in semis}
    tournament = await Tournament.get(tournament_id)
    has_quarters = (
        tournament.config.knockout_format == "quarters_semis_final"
        if tournament and getattr(tournament, "config", None)
        else False
    )
    round_ord = 2 if has_quarters else 1

    for label, slot_name, notes in (
        ("Semi-final 1", "SF1", "Winner QF1 vs Winner QF2" if has_quarters else "Group A (2nd) vs Group B (1st)"),
        ("Semi-final 2", "SF2", "Winner QF3 vs Winner QF4" if has_quarters else "Group B (2nd) vs Group A (1st)"),
    ):
        if len(semis) >= 2:
            break
        if slot_name in used or label in used:
            continue
        slot = Match(
            tournament_id=tournament_id,
            match_number=await _next_match_number(tournament_id),
            stage="semi",
            bracket_slot=slot_name,
            round_order=round_ord,
            label=label,
            notes=notes,
            date=next((m.date for m in semis if m.date), None),
        )
        await slot.insert()
        semis.append(slot)

    for i, s in enumerate(semis):
        changed = False
        if getattr(s, "bracket_slot", None) is None:
            s.bracket_slot = "SF1" if i == 0 or "1" in (s.label or "") else "SF2"
            changed = True
        if getattr(s, "round_order", None) is None:
            s.round_order = round_ord
            changed = True
        if changed:
            await s.save()

    semis.sort(key=lambda m: (m.bracket_slot or m.label or "~", m.match_number))
    return semis


async def _ensure_final_slot(tournament_id: PydanticObjectId) -> Match:
    final = await Match.find_one(Match.tournament_id == tournament_id, Match.stage == "final")
    tournament = await Tournament.get(tournament_id)
    has_quarters = (
        tournament.config.knockout_format == "quarters_semis_final"
        if tournament and getattr(tournament, "config", None)
        else False
    )
    round_ord = 3 if has_quarters else 2

    if final is None:
        final = Match(
            tournament_id=tournament_id,
            match_number=await _next_match_number(tournament_id),
            stage="final",
            bracket_slot="FINAL",
            round_order=round_ord,
            label="Final",
            notes="Winner SF1 vs Winner SF2",
        )
        await final.insert()
    else:
        changed = False
        if getattr(final, "bracket_slot", None) is None:
            final.bracket_slot = "FINAL"
            changed = True
        if getattr(final, "round_order", None) is None:
            final.round_order = round_ord
            changed = True
        if changed:
            await final.save()
    return final


async def _knockout_by_slot(tournament_id: PydanticObjectId) -> dict[str, Match]:
    matches = await Match.find(
        Match.tournament_id == tournament_id, {"stage": {"$in": list(_KNOCKOUT_STAGES)}}
    ).to_list()
    return {slot_of(m): m for m in matches if slot_of(m)}


async def assert_downstream_unstarted(match: Match) -> None:
    """Refuses to change a quarter/semi result once the next round's match that it feeds has
    started (or finished): rewriting history under a live match would corrupt the bracket."""
    slot = slot_of(match)
    if match.stage not in ("quarter", "semi") or slot not in SLOT_TARGETS:
        return
    target_slot, field = SLOT_TARGETS[slot]
    target = (await _knockout_by_slot(match.tournament_id)).get(target_slot)
    if target is not None and getattr(target, field) is not None and target.status in ("live", "full_time"):
        raise ConflictError(
            f"The {target.label or target_slot} match has already started, so this result can no longer be changed"
        )


async def recompute_bracket(
    tournament_id: PydanticObjectId, trigger_match: Optional[Match] = None
) -> list[Match]:
    """Brings the knockout bracket in line with the current results. Returns changed matches.

    - A decided quarter/semi sets its winner into the slot it feeds; a changed winner replaces it.
    - A stale manual winner override is cleared once the score is no longer level.
    - Only the match that triggered the recompute may *clear* its downstream slot (e.g. it was
      reopened); other slots are never blanked, so manual team assignments survive.
    - Downstream matches that are live/finished are never rewritten (see assert_downstream_unstarted).
    """
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        return []
    fmt = tournament.config.knockout_format if getattr(tournament, "config", None) else "semis_final"
    if fmt == "none":
        return []

    by_slot = await _knockout_by_slot(tournament_id)
    changed: dict[PydanticObjectId, Match] = {}

    for match in by_slot.values():
        if match.winner_override_id is not None and (
            match.status != "full_time" or len(set(await match_goals(match))) != 1
        ):
            match.winner_override_id = None
            await match.save()
            changed[match.id] = match

    trigger_slot = slot_of(trigger_match) if trigger_match is not None else None
    for src_slot in _PROPAGATION_ORDER:
        source = by_slot.get(src_slot)
        if source is None or (src_slot.startswith("QF") and fmt != "quarters_semis_final"):
            continue
        target_slot, field = SLOT_TARGETS[src_slot]
        desired = await get_match_winner(source)
        target = by_slot.get(target_slot)
        if target is None:
            if desired is None or target_slot != "FINAL":
                continue
            target = await _ensure_final_slot(tournament_id)
            by_slot["FINAL"] = target
        if desired is None and src_slot != trigger_slot:
            continue
        if getattr(target, field) == desired or target.status in ("live", "full_time"):
            continue
        setattr(target, field, desired)
        target.winner_override_id = None
        await MatchLineup.find(MatchLineup.match_id == target.id).delete()
        await target.save()
        changed[target.id] = target

    await refresh_tournament_stage(tournament_id)
    for m in changed.values():
        await broadcast({"type": "match_updated", "match_id": str(m.id), "tournament_id": str(tournament_id)})
    return list(changed.values())
