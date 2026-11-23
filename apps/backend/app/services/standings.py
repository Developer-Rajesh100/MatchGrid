"""Recomputes the materialized TournamentStanding rows for a group.

Mirrors the standings formula from the reference prototype (see
docs/PROJECT_ANALYSIS.md §7): 3 points for a win, 1 for a draw, sorted by
Points desc, Goal Difference desc, Goals For desc (name tiebreak happens at
the API/read layer, not stored here). Called whenever a group-stage match's
result changes (created now for use by the seed script; wired into the
match-event/status endpoints in the API phase).
"""

from beanie import PydanticObjectId

from app.models import GroupTeam, Match, MatchEvent, Team, TournamentStanding


async def recalculate_group_standings(group_id: PydanticObjectId) -> list[TournamentStanding]:
    group_teams = await GroupTeam.find(GroupTeam.group_id == group_id).to_list()
    if not group_teams:
        return []

    tournament_id = group_teams[0].tournament_id
    team_ids = [gt.team_id for gt in group_teams]

    totals: dict[PydanticObjectId, dict[str, int]] = {
        team_id: {"P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0}
        for team_id in team_ids
    }

    completed_matches = await Match.find(
        Match.group_id == group_id,
        Match.stage == "group",
        Match.status == "full_time",
    ).to_list()

    # One query for every goal event across all of this group's completed
    # matches, instead of one query per match — this function re-runs on
    # every group-stage goal/card/POTM event, so the query count used to
    # scale with the group's match count on every single mutation. Found
    # during the Timer/Half-Time audit's Performance & Scalability follow-up.
    match_ids = [m.id for m in completed_matches]
    all_goal_events = (
        await MatchEvent.find({"match_id": {"$in": match_ids}, "type": "goal"}).to_list()
        if match_ids
        else []
    )
    goals_by_match: dict[PydanticObjectId, list[MatchEvent]] = {}
    for e in all_goal_events:
        goals_by_match.setdefault(e.match_id, []).append(e)

    for match in completed_matches:
        if match.team1_id not in totals or match.team2_id not in totals:
            continue
        events = goals_by_match.get(match.id, [])
        goals1 = sum(1 for e in events if e.team_id == match.team1_id)
        goals2 = sum(1 for e in events if e.team_id == match.team2_id)

        t1, t2 = totals[match.team1_id], totals[match.team2_id]
        t1["P"] += 1
        t2["P"] += 1
        t1["GF"] += goals1
        t1["GA"] += goals2
        t2["GF"] += goals2
        t2["GA"] += goals1
        if goals1 > goals2:
            t1["W"] += 1
            t2["L"] += 1
        elif goals2 > goals1:
            t2["W"] += 1
            t1["L"] += 1
        else:
            t1["D"] += 1
            t2["D"] += 1

    existing_standings = {
        s.team_id: s
        for s in await TournamentStanding.find(TournamentStanding.group_id == group_id).to_list()
    }

    results: list[TournamentStanding] = []
    for team_id, totalsRow in totals.items():
        points = totalsRow["W"] * 3 + totalsRow["D"]
        goal_difference = totalsRow["GF"] - totalsRow["GA"]

        standing = existing_standings.get(team_id)
        if standing is None:
            standing = TournamentStanding(
                tournament_id=tournament_id, group_id=group_id, team_id=team_id
            )

        standing.played = totalsRow["P"]
        standing.won = totalsRow["W"]
        standing.drawn = totalsRow["D"]
        standing.lost = totalsRow["L"]
        standing.goals_for = totalsRow["GF"]
        standing.goals_against = totalsRow["GA"]
        standing.goal_difference = goal_difference
        standing.points = points
        await standing.save()
        results.append(standing)

    # Defensive second line of defense (assign_team_group is the primary
    # fix): remove any row still tagged with this group_id for a team that
    # isn't a current member — e.g. left over from before this app version,
    # or from any other path that ever changes group membership without
    # going through assign_team_group.
    await TournamentStanding.find(
        TournamentStanding.group_id == group_id,
        {"team_id": {"$nin": list(totals.keys())}},
    ).delete()

    return results


async def sorted_group_standings(group_id: PydanticObjectId) -> list[TournamentStanding]:
    """Points desc, Goal Difference desc, Goals For desc, team name asc — same
    tiebreak order as the reference prototype (docs/PROJECT_ANALYSIS.md §7)."""
    rows = await TournamentStanding.find(TournamentStanding.group_id == group_id).to_list()
    if not rows:
        # No group-stage match has completed yet for this group, so no rows have
        # ever been materialized — build the all-zero baseline (one row per
        # assigned team) instead of returning an empty table.
        rows = await recalculate_group_standings(group_id)
    teams = {t.id: t for t in await Team.find({"_id": {"$in": [r.team_id for r in rows]}}).to_list()}
    rows.sort(
        key=lambda r: (
            -r.points,
            -r.goal_difference,
            -r.goals_for,
            teams[r.team_id].name if r.team_id in teams else "",
        )
    )
    return rows
