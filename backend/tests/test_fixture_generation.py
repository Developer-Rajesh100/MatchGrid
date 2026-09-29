"""Coverage for generate_group_fixtures/generate_semis/generate_final in
app/services/matches.py — zero automated test coverage before this
(confirmed via `pytest --cov` during the Timer/Half-Time audit's Test
Coverage follow-up), despite being core tournament-setup logic with real
edge cases: round-robin pairing, the "already has results" force-erase
guard, knockout seeding from computed standings, and the "already
generated" idempotency guards. `reference/plan.txt` records that this exact
area (fixture/knockout generation) has had real bugs before
(`generateGroupFixtures` missing group_id, `setWinner` wrong field name),
which is exactly the kind of area that most needed test coverage.
"""

import pytest

from app.core.errors import ConflictError, NotFoundError
from app.models import Match, MatchEvent
from app.services.matches import (
    end_match,
    generate_final,
    generate_group_fixtures,
    generate_semis,
    start_match,
)


def _semi_slots(tournament):
    return [
        Match(tournament_id=tournament.id, match_number=7, stage="semi", label="Semi-final 1", status="upcoming"),
        Match(tournament_id=tournament.id, match_number=8, stage="semi", label="Semi-final 2", status="upcoming"),
    ]


def _final_slot(tournament):
    return Match(tournament_id=tournament.id, match_number=9, stage="final", label="Final", status="upcoming")


# ---- generate_group_fixtures ----


async def test_generate_group_fixtures_creates_a_full_round_robin_for_3_teams(tournament, groups, teams):
    matches = await generate_group_fixtures(groups["A"].id, force=False)

    assert len(matches) == 3
    team_ids = {teams["Red Dragons"].id, teams["Golden Hawks"].id, teams["White Lions"].id}
    seen_pairs = set()
    for m in matches:
        assert m.group_id == groups["A"].id
        assert m.stage == "group"
        assert m.status == "upcoming"
        assert {m.team1_id, m.team2_id} <= team_ids
        seen_pairs.add(frozenset({m.team1_id, m.team2_id}))
    assert len(seen_pairs) == 3  # every one of the 3 possible pairs appears exactly once


async def test_generate_group_fixtures_raises_for_a_nonexistent_group(tournament):
    from beanie import PydanticObjectId

    with pytest.raises(NotFoundError):
        await generate_group_fixtures(PydanticObjectId(), force=False)


async def test_generate_group_fixtures_rejects_a_group_without_exactly_3_teams(tournament, groups, teams):
    from app.services.groups import assign_team_group

    # Move a Group A team out, leaving only 2.
    await assign_team_group(teams["Red Dragons"].id, groups["B"].id)
    with pytest.raises(ConflictError):
        await generate_group_fixtures(groups["A"].id, force=False)


async def test_generate_group_fixtures_blocks_regeneration_when_results_exist_without_force(
    tournament, groups, teams, players
):
    matches = await generate_group_fixtures(groups["A"].id, force=False)
    m = matches[0]
    m.status = "live"
    await m.save()
    await MatchEvent(match_id=m.id, type="goal", team_id=m.team1_id, player_id=players["Red Dragons"][3].id, minute=10).insert()

    with pytest.raises(ConflictError):
        await generate_group_fixtures(groups["A"].id, force=False)


async def test_generate_group_fixtures_with_force_erases_old_results_and_regenerates(
    tournament, groups, teams, players
):
    matches = await generate_group_fixtures(groups["A"].id, force=False)
    old_ids = {m.id for m in matches}
    m = matches[0]
    m.status = "live"
    await m.save()
    await MatchEvent(match_id=m.id, type="goal", team_id=m.team1_id, player_id=players["Red Dragons"][3].id, minute=10).insert()

    new_matches = await generate_group_fixtures(groups["A"].id, force=True)

    assert len(new_matches) == 3
    new_ids = {nm.id for nm in new_matches}
    assert old_ids.isdisjoint(new_ids)  # entirely new Match documents
    for old_id in old_ids:
        assert await Match.get(old_id) is None  # old docs (and their events) are gone
        assert await MatchEvent.find(MatchEvent.match_id == old_id).count() == 0
    assert all(nm.status == "upcoming" for nm in new_matches)


# ---- generate_semis ----


async def test_generate_semis_requires_exactly_2_groups(tournament, groups, teams):
    from app.models import Group

    await Group(tournament_id=tournament.id, name="C").insert()
    for slot in _semi_slots(tournament):
        await slot.insert()
    with pytest.raises(ConflictError):
        await generate_semis(tournament.id)


async def test_generate_semis_requires_both_groups_complete(tournament, groups, teams):
    for slot in _semi_slots(tournament):
        await slot.insert()
    # No group matches generated/completed at all.
    with pytest.raises(ConflictError):
        await generate_semis(tournament.id)


async def test_generate_semis_requires_the_2_semi_slots_to_already_exist(tournament, groups, teams, players):
    group_a_matches = await generate_group_fixtures(groups["A"].id, force=False)
    group_b_matches = await generate_group_fixtures(groups["B"].id, force=False)
    for m in group_a_matches + group_b_matches:
        m = await start_match(m)
        await end_match(m)
    # No semi slots inserted at all.
    with pytest.raises(ConflictError):
        await generate_semis(tournament.id)


async def test_generate_semis_seeds_correctly_from_group_standings(tournament, groups, teams, players):
    group_a_matches = await generate_group_fixtures(groups["A"].id, force=False)
    group_b_matches = await generate_group_fixtures(groups["B"].id, force=False)

    async def _play(match, winner_team_id, loser_team_id):
        match = await start_match(match)
        scorer_team = winner_team_id
        # Find a player on the winning team to score.
        for team_name, squad in players.items():
            if teams[team_name].id == scorer_team:
                scorer = squad[3]
                break
        await MatchEvent(match_id=match.id, type="goal", team_id=scorer_team, player_id=scorer.id, minute=10).insert()
        await end_match(await Match.get(match.id))

    # Red Dragons beat both Golden Hawks and White Lions -> Group A: 1st Red Dragons.
    for m in group_a_matches:
        if teams["Red Dragons"].id in (m.team1_id, m.team2_id):
            other = m.team2_id if m.team1_id == teams["Red Dragons"].id else m.team1_id
            await _play(m, teams["Red Dragons"].id, other)
        else:
            m = await start_match(m)
            await end_match(await Match.get(m.id))  # 0-0 draw between the other two

    # Blue Whales beat both Black Panthers and Green Alligators -> Group B: 1st Blue Whales.
    for m in group_b_matches:
        if teams["Blue Whales"].id in (m.team1_id, m.team2_id):
            other = m.team2_id if m.team1_id == teams["Blue Whales"].id else m.team1_id
            await _play(m, teams["Blue Whales"].id, other)
        else:
            m = await start_match(m)
            await end_match(await Match.get(m.id))

    for slot in _semi_slots(tournament):
        await slot.insert()

    semis = await generate_semis(tournament.id)

    assert len(semis) == 2
    semi1, semi2 = sorted(semis, key=lambda m: m.match_number)
    # Semi-final 1: Group A winner vs Group B runner-up; Semi-final 2: Group B winner vs Group A runner-up.
    assert semi1.team1_id == teams["Red Dragons"].id
    assert semi2.team1_id == teams["Blue Whales"].id


async def test_generate_semis_rejects_regenerating_once_already_seeded(tournament, groups, teams, players):
    group_a_matches = await generate_group_fixtures(groups["A"].id, force=False)
    group_b_matches = await generate_group_fixtures(groups["B"].id, force=False)
    for m in group_a_matches + group_b_matches:
        m = await start_match(m)
        await end_match(m)
    for slot in _semi_slots(tournament):
        await slot.insert()

    await generate_semis(tournament.id)
    with pytest.raises(ConflictError):
        await generate_semis(tournament.id)


# ---- generate_final ----


async def test_generate_final_requires_a_final_slot_to_exist(tournament, teams, players):
    semi1, semi2 = _semi_slots(tournament)
    semi1.team1_id, semi1.team2_id, semi1.status = teams["Red Dragons"].id, teams["Golden Hawks"].id, "full_time"
    semi2.team1_id, semi2.team2_id, semi2.status = teams["Blue Whales"].id, teams["Black Panthers"].id, "full_time"
    await semi1.insert()
    await semi2.insert()
    await MatchEvent(
        match_id=semi1.id, type="goal", team_id=teams["Red Dragons"].id, player_id=players["Red Dragons"][3].id, minute=1
    ).insert()
    await MatchEvent(
        match_id=semi2.id, type="goal", team_id=teams["Blue Whales"].id, player_id=players["Blue Whales"][3].id, minute=1
    ).insert()

    with pytest.raises(NotFoundError):
        await generate_final(tournament.id)


async def test_generate_final_requires_both_semis_full_time_with_decided_winners(tournament, teams, players):
    semi1, semi2 = _semi_slots(tournament)
    semi1.team1_id, semi1.team2_id = teams["Red Dragons"].id, teams["Golden Hawks"].id
    semi2.team1_id, semi2.team2_id = teams["Blue Whales"].id, teams["Black Panthers"].id
    await semi1.insert()
    await semi2.insert()
    await _final_slot(tournament).insert()

    with pytest.raises(ConflictError):  # neither semi is full_time yet
        await generate_final(tournament.id)


async def test_generate_final_seeds_correctly_from_semi_winners(tournament, teams, players):
    semi1, semi2 = _semi_slots(tournament)
    semi1.team1_id, semi1.team2_id = teams["Red Dragons"].id, teams["Golden Hawks"].id
    semi2.team1_id, semi2.team2_id = teams["Blue Whales"].id, teams["Black Panthers"].id
    await semi1.insert()
    await semi2.insert()
    await _final_slot(tournament).insert()

    semi1 = await start_match(semi1)
    await MatchEvent(
        match_id=semi1.id, type="goal", team_id=teams["Red Dragons"].id, player_id=players["Red Dragons"][3].id, minute=10
    ).insert()
    await end_match(await Match.get(semi1.id))

    semi2 = await start_match(semi2)
    await MatchEvent(
        match_id=semi2.id, type="goal", team_id=teams["Black Panthers"].id, player_id=players["Black Panthers"][3].id, minute=10
    ).insert()
    await end_match(await Match.get(semi2.id))

    final = await generate_final(tournament.id)
    assert final.team1_id == teams["Red Dragons"].id
    assert final.team2_id == teams["Black Panthers"].id


async def test_generate_final_rejects_regenerating_once_already_seeded(tournament, teams, players):
    semi1, semi2 = _semi_slots(tournament)
    semi1.team1_id, semi1.team2_id = teams["Red Dragons"].id, teams["Golden Hawks"].id
    semi2.team1_id, semi2.team2_id = teams["Blue Whales"].id, teams["Black Panthers"].id
    await semi1.insert()
    await semi2.insert()
    await _final_slot(tournament).insert()

    for semi, scorer_team, scorer in (
        (semi1, teams["Red Dragons"].id, players["Red Dragons"][3]),
        (semi2, teams["Blue Whales"].id, players["Blue Whales"][3]),
    ):
        semi = await start_match(semi)
        await MatchEvent(match_id=semi.id, type="goal", team_id=scorer_team, player_id=scorer.id, minute=10).insert()
        await end_match(await Match.get(semi.id))

    await generate_final(tournament.id)
    with pytest.raises(ConflictError):
        await generate_final(tournament.id)
