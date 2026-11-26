"""Refreshes the materialized Tournament.stage / champion_team_id fields.

Mirrors the reference prototype's tournamentStage() derivation (see
docs/PROJECT_ANALYSIS.md §7): group -> semis (once any semi has a team
assigned) -> final (once the final has both teams assigned) -> champions
(once the final is full_time).
"""

from beanie import PydanticObjectId

from app.core.errors import ConflictError
from app.models import Group, GroupTeam, Match, MatchEvent, Tournament
from app.services.scoring import count_goals, winner_from_score
from app.services.standings import sorted_group_standings

KNOCKOUT_SIZES = {"semis_final": 4, "quarters_semis_final": 8}


async def _determine_league_champion(tournament_id: PydanticObjectId) -> PydanticObjectId | None:
    """A league has one champion only when it is a single table. With several groups and no
    knockout there is no fair way to compare teams across groups, so nobody is crowned."""
    groups = await Group.find(Group.tournament_id == tournament_id).to_list()
    populated = [g for g in groups if await GroupTeam.find(GroupTeam.group_id == g.id).count()]
    if len(populated) != 1:
        return None
    standings = await sorted_group_standings(populated[0].id)
    return standings[0].team_id if standings else None


async def refresh_tournament_stage(tournament_id: PydanticObjectId) -> Tournament | None:
    tournament = await Tournament.get(tournament_id)
    if tournament is None:
        return None

    knockout_format = (
        tournament.config.knockout_format
        if getattr(tournament, "config", None)
        else "semis_final"
    )

    if knockout_format == "none":
        group_matches = await Match.find(
            Match.tournament_id == tournament_id, Match.stage == "group"
        ).to_list()
        # A cancelled fixture will never be played, so it must not block the league from finishing.
        if any(m.status == "full_time" for m in group_matches) and all(
            m.status in ("full_time", "cancelled") for m in group_matches
        ):
            stage = "champions"
            champion_team_id = await _determine_league_champion(tournament_id)
        else:
            stage = "group"
            champion_team_id = None
        tournament.stage = stage
        tournament.champion_team_id = champion_team_id
        _sync_status(tournament)
        await tournament.save()
        return tournament

    final_match = await Match.find_one(
        Match.tournament_id == tournament_id, Match.stage == "final"
    )
    semi_matches = await Match.find(
        Match.tournament_id == tournament_id, Match.stage == "semi"
    ).to_list()
    quarter_matches = await Match.find(
        Match.tournament_id == tournament_id, Match.stage == "quarter"
    ).to_list()

    stage = "group"
    champion_team_id = None

    if quarter_matches and any(m.team1_id for m in quarter_matches):
        stage = "quarters"
    if semi_matches and any(m.team1_id for m in semi_matches):
        stage = "semis"
    if final_match and final_match.team1_id and final_match.team2_id:
        stage = "final"
    if final_match and final_match.status == "full_time":
        stage = "champions"
        champion_team_id = await get_match_winner(final_match)

    tournament.stage = stage
    tournament.champion_team_id = champion_team_id
    _sync_status(tournament)
    await tournament.save()
    return tournament


def _sync_status(tournament: Tournament) -> None:
    """A crowned champion completes the tournament; reopening a result reactivates it.
    A draft tournament is the organizer's explicit choice and is never changed here."""
    if tournament.status == "draft":
        return
    tournament.status = "completed" if tournament.stage == "champions" else "active"


async def match_goals(match: Match) -> tuple[int, int]:
    if not match.team1_id or not match.team2_id:
        return 0, 0
    events = await MatchEvent.find(MatchEvent.match_id == match.id, MatchEvent.type == "goal").to_list()
    return count_goals(match, events)


async def get_match_winner(match: Match) -> PydanticObjectId | None:
    if match.status != "full_time" or not match.team1_id or not match.team2_id:
        return None
    return winner_from_score(match, *await match_goals(match))


# ---------------------------------------------------------------------------
# Knockout seeding, generalised from num_groups x qualifiers_per_group
# ---------------------------------------------------------------------------

# Historical fixtures for the shapes the app always supported. Entries are (group_index, rank_index)
# pairs in slot order (QF1..QF4 / SF1..SF2); keeping them means existing brackets seed identically.
_LEGACY_PAIRINGS = {
    (4, 2, 2): [((0, 1), (1, 0)), ((1, 1), (0, 0))],
    (8, 4, 2): [((0, 0), (1, 1)), ((2, 0), (3, 1)), ((1, 0), (0, 1)), ((3, 0), (2, 1))],
    (8, 2, 4): [((0, 0), (1, 3)), ((1, 1), (0, 2)), ((1, 0), (0, 3)), ((0, 1), (1, 2))],
}


def _fold_order(size: int) -> list[tuple[int, int]]:
    """Standard seeded-bracket order of seed index pairs (0 = best): high vs low, with the
    top two seeds on opposite halves. 4 -> (0,3),(1,2); 8 -> (0,7),(3,4),(1,6),(2,5)."""
    if size == 4:
        return [(0, 3), (1, 2)]
    return [(0, 7), (3, 4), (1, 6), (2, 5)]


async def compute_knockout_pairings(tournament_id: PydanticObjectId, fmt: str, qualifiers_per_group: int):
    """Returns the first-round pairings [(team1_id, team2_id), ...] in slot order.

    The qualifier pool is the top `qualifiers_per_group` of every populated group; if it holds
    more than the bracket needs, the best `size` are kept (rank first, then points / goal
    difference / goals for). Every shortfall is a 409 with an explanation, never an IndexError."""
    size = KNOCKOUT_SIZES[fmt]
    groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    ranked: list[list] = []
    for g in groups:
        if not await GroupTeam.find(GroupTeam.group_id == g.id).count():
            continue  # an empty group contributes nobody
        rows = await sorted_group_standings(g.id)
        if len(rows) < qualifiers_per_group:
            raise ConflictError(
                f"Group {g.name} has {len(rows)} team(s) but {qualifiers_per_group} qualify from each group"
            )
        ranked.append(rows)
    if not ranked:
        raise ConflictError("No groups with teams were found")

    pool = [
        (rank, -row.points, -row.goal_difference, -row.goals_for, g_idx, row)
        for g_idx, rows in enumerate(ranked)
        for rank, row in enumerate(rows[:qualifiers_per_group])
    ]
    if len(pool) < size:
        raise ConflictError(
            f"The {fmt.replace('_', ' ')} bracket needs {size} qualifiers but only {len(pool)} are available "
            f"({len(ranked)} group(s) x {qualifiers_per_group} per group)"
        )

    legacy = _LEGACY_PAIRINGS.get((size, len(ranked), qualifiers_per_group)) if len(pool) == size else None
    if legacy is not None:
        return [(ranked[g1][r1].team_id, ranked[g2][r2].team_id) for (g1, r1), (g2, r2) in legacy]

    # Keep the best `size` qualifiers (finishing position first, then points / goal difference /
    # goals for), then seed them rank-major: all group winners, then all runners-up, ...
    pool.sort(key=lambda t: t[:5])
    chosen = sorted(pool[:size], key=lambda t: (t[0], t[4]))
    seeds = [row.team_id for *_rest, row in chosen]
    return [(seeds[a], seeds[b]) for a, b in _fold_order(size)]
