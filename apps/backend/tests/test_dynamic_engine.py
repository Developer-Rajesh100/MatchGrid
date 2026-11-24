"""Unit & Integration tests for Phase 3 Dynamic Tournament, Group Draw & Knockout Bracket Engine."""

import pytest
from beanie import PydanticObjectId

from app.core.errors import ConflictError, NotFoundError
from app.models import Group, GroupTeam, Match, MatchEvent, Team, Tournament, TournamentConfig
from app.services.groups import random_draw
from app.services.matches import (
    build_tournament_bracket,
    compute_circle_method_pairs,
    end_match,
    generate_group_fixtures,
    seed_knockout_bracket,
    set_winner,
    start_match,
)
from app.services.standings import recalculate_group_standings, sorted_group_standings


# ---- 1. TournamentConfig Validation ----


def test_tournament_config_valid_and_defaults():
    cfg = TournamentConfig()
    assert cfg.num_groups == 2
    assert cfg.teams_per_group == 3
    assert cfg.qualifiers_per_group == 2
    assert cfg.knockout_format == "semis_final"
    assert cfg.points_win == 3
    assert cfg.points_draw == 1
    assert cfg.points_loss == 0
    assert cfg.half_duration_minutes == 25


def test_tournament_config_rejects_insufficient_qualifiers_for_quarters():
    with pytest.raises(ValueError, match="Quarters format requires at least 8 qualifiers"):
        TournamentConfig(
            num_groups=2,
            teams_per_group=3,
            qualifiers_per_group=2,  # 2 * 2 = 4 < 8
            knockout_format="quarters_semis_final",
        )


def test_tournament_config_rejects_qualifiers_exceeding_teams_per_group():
    with pytest.raises(ValueError, match="qualifiers_per_group cannot exceed teams_per_group"):
        TournamentConfig(num_groups=2, teams_per_group=2, qualifiers_per_group=3)


# ---- 2. Dynamic Group Draw ----


async def test_random_draw_balances_teams_across_dynamic_groups(tournament):
    tournament.config.num_groups = 4
    tournament.config.teams_per_group = 2
    await tournament.save()

    # Create 8 teams
    for i in range(8):
        await Team(tournament_id=tournament.id, name=f"Team {i+1}", color="#123456").insert()

    drawn = await random_draw(tournament.id, num_groups=4)
    assert len(drawn) == 8

    groups = await Group.find(Group.tournament_id == tournament.id).sort("name").to_list()
    assert len(groups) == 4
    assert [g.name for g in groups] == ["A", "B", "C", "D"]

    for g in groups:
        g_teams = await GroupTeam.find(GroupTeam.group_id == g.id).to_list()
        assert len(g_teams) == 2


async def test_random_draw_handles_odd_team_counts_evenly(tournament):
    tournament.config.num_groups = 2
    await tournament.save()

    # Create 7 teams
    for i in range(7):
        await Team(tournament_id=tournament.id, name=f"Odd Team {i+1}", color="#abcdef").insert()

    await random_draw(tournament.id, num_groups=2)
    groups = await Group.find(Group.tournament_id == tournament.id).sort("name").to_list()
    assert len(groups) == 2
    counts = [await GroupTeam.find(GroupTeam.group_id == g.id).count() for g in groups]
    assert sorted(counts) == [3, 4]  # diff at most 1


# ---- 3. Circle-Method Round-Robin Scheduler ----


def test_compute_circle_method_pairs_even_teams():
    t_ids = [PydanticObjectId() for _ in range(4)]
    pairs = compute_circle_method_pairs(t_ids)
    assert len(pairs) == 6  # 4 * 3 / 2
    unique_pairs = {frozenset(p) for p in pairs}
    assert len(unique_pairs) == 6


def test_compute_circle_method_pairs_odd_teams_with_virtual_bye():
    t_ids = [PydanticObjectId() for _ in range(5)]
    pairs = compute_circle_method_pairs(t_ids)
    assert len(pairs) == 10  # 5 * 4 / 2
    unique_pairs = {frozenset(p) for p in pairs}
    assert len(unique_pairs) == 10


async def test_generate_group_fixtures_circle_method_4_teams(tournament):
    tournament.config.teams_per_group = 4
    await tournament.save()

    group = Group(tournament_id=tournament.id, name="X")
    await group.insert()

    team_ids = []
    for i in range(4):
        t = Team(tournament_id=tournament.id, name=f"Group X Team {i+1}", color="#000000")
        await t.insert()
        team_ids.append(t.id)
        await GroupTeam(tournament_id=tournament.id, group_id=group.id, team_id=t.id).insert()

    matches = await generate_group_fixtures(group.id, force=False)
    assert len(matches) == 6
    assert all(m.stage == "group" for m in matches)
    assert all(m.group_id == group.id for m in matches)


# ---- 4. Custom Points Standings Engine ----


async def test_standings_use_custom_point_rules(tournament):
    tournament.config.points_win = 4
    tournament.config.points_draw = 2
    tournament.config.points_loss = 0
    await tournament.save()

    group = Group(tournament_id=tournament.id, name="P")
    await group.insert()

    t1 = await Team(tournament_id=tournament.id, name="Team Win", color="#111").insert()
    t2 = await Team(tournament_id=tournament.id, name="Team Loss", color="#222").insert()
    t3 = await Team(tournament_id=tournament.id, name="Team Draw", color="#333").insert()

    for t in (t1, t2, t3):
        await GroupTeam(tournament_id=tournament.id, group_id=group.id, team_id=t.id).insert()

    # Match 1: t1 beats t2 (2-0)
    m1 = Match(
        tournament_id=tournament.id,
        group_id=group.id,
        match_number=1,
        stage="group",
        team1_id=t1.id,
        team2_id=t2.id,
        status="full_time",
    )
    await m1.insert()
    await MatchEvent(match_id=m1.id, type="goal", team_id=t1.id, player_id=PydanticObjectId(), minute=10).insert()
    await MatchEvent(match_id=m1.id, type="goal", team_id=t1.id, player_id=PydanticObjectId(), minute=20).insert()

    # Match 2: t1 draws with t3 (1-1)
    m2 = Match(
        tournament_id=tournament.id,
        group_id=group.id,
        match_number=2,
        stage="group",
        team1_id=t1.id,
        team2_id=t3.id,
        status="full_time",
    )
    await m2.insert()
    await MatchEvent(match_id=m2.id, type="goal", team_id=t1.id, player_id=PydanticObjectId(), minute=5).insert()
    await MatchEvent(match_id=m2.id, type="goal", team_id=t3.id, player_id=PydanticObjectId(), minute=15).insert()

    standings = await sorted_group_standings(group.id)
    s_map = {s.team_id: s for s in standings}

    # t1: 1 win (4 pts) + 1 draw (2 pts) = 6 pts
    assert s_map[t1.id].points == 6
    assert s_map[t1.id].played == 2
    assert s_map[t1.id].won == 1
    assert s_map[t1.id].drawn == 1
    assert s_map[t1.id].goal_difference == 2

    # t3: 1 draw (2 pts)
    assert s_map[t3.id].points == 2
    # t2: 1 loss (0 pts)
    assert s_map[t2.id].points == 0


# ---- 5. Dynamic Knockout Seeder: Quarters & Penalty Override ----


async def test_quarters_semis_final_bracket_seeding_and_penalty_advancement(tournament):
    tournament.config.num_groups = 4
    tournament.config.teams_per_group = 2
    tournament.config.qualifiers_per_group = 2
    tournament.config.knockout_format = "quarters_semis_final"
    await tournament.save()

    # Create 4 groups with 2 teams each
    teams_by_group = {}
    for letter in ["A", "B", "C", "D"]:
        g = await Group(tournament_id=tournament.id, name=letter).insert()
        t1 = await Team(tournament_id=tournament.id, name=f"{letter}1_Team", color="#111").insert()
        t2 = await Team(tournament_id=tournament.id, name=f"{letter}2_Team", color="#222").insert()
        await GroupTeam(tournament_id=tournament.id, group_id=g.id, team_id=t1.id).insert()
        await GroupTeam(tournament_id=tournament.id, group_id=g.id, team_id=t2.id).insert()
        teams_by_group[letter] = (t1, t2)

        # Mark 1 match per group full time: t1 wins 1-0
        m = await Match(
            tournament_id=tournament.id,
            group_id=g.id,
            match_number=len(teams_by_group),
            stage="group",
            team1_id=t1.id,
            team2_id=t2.id,
            status="full_time",
        ).insert()
        await MatchEvent(match_id=m.id, type="goal", team_id=t1.id, player_id=PydanticObjectId(), minute=10).insert()
        await recalculate_group_standings(g.id)

    # Seed Knockout
    seeded_quarters = await seed_knockout_bracket(tournament.id)
    assert len(seeded_quarters) == 4
    q1, q2, q3, q4 = seeded_quarters

    # QF1: A1 vs B2
    assert q1.team1_id == teams_by_group["A"][0].id
    assert q1.team2_id == teams_by_group["B"][1].id
    assert q1.bracket_slot == "QF1"

    # Play QF1 and end it tied 1-1, then set winner_override_id
    q1 = await start_match(q1)
    await MatchEvent(match_id=q1.id, type="goal", team_id=q1.team1_id, player_id=PydanticObjectId(), minute=10).insert()
    await MatchEvent(match_id=q1.id, type="goal", team_id=q1.team2_id, player_id=PydanticObjectId(), minute=20).insert()
    q1 = await end_match(await Match.get(q1.id))
    assert q1.status == "full_time"

    # Record penalty winner as team2 (B2)
    await set_winner(q1, q1.team2_id)

    # Verify downstream SF1 team1_id is automatically B2!
    sf1 = await Match.find_one(
        Match.tournament_id == tournament.id, Match.stage == "semi", Match.bracket_slot == "SF1"
    )
    assert sf1 is not None
    assert sf1.team1_id == teams_by_group["B"][1].id


# ---- 6. League-Only Format (No Knockout) ----


async def test_league_only_format_crowns_champion_directly(tournament):
    tournament.config.num_groups = 1
    tournament.config.teams_per_group = 3
    tournament.config.knockout_format = "none"
    await tournament.save()

    g = await Group(tournament_id=tournament.id, name="A").insert()
    t1 = await Team(tournament_id=tournament.id, name="Champ Team", color="#gold").insert()
    t2 = await Team(tournament_id=tournament.id, name="Runner Up", color="#silver").insert()
    t3 = await Team(tournament_id=tournament.id, name="Third Place", color="#bronze").insert()

    for t in (t1, t2, t3):
        await GroupTeam(tournament_id=tournament.id, group_id=g.id, team_id=t.id).insert()

    m = await Match(
        tournament_id=tournament.id,
        group_id=g.id,
        match_number=1,
        stage="group",
        team1_id=t1.id,
        team2_id=t2.id,
        status="full_time",
    ).insert()
    await MatchEvent(match_id=m.id, type="goal", team_id=t1.id, player_id=PydanticObjectId(), minute=10).insert()
    await recalculate_group_standings(g.id)

    # Seed knockout in league-only format directly refreshes stage
    res = await seed_knockout_bracket(tournament.id)
    assert res == []

    refreshed_t = await Tournament.get(tournament.id)
    assert refreshed_t.stage == "champions"
    assert refreshed_t.champion_team_id == t1.id


# ---- 7. Bracket Visual Tree Structure ----


async def test_build_tournament_bracket_returns_tree(tournament):
    tournament.config.knockout_format = "semis_final"
    await tournament.save()

    # Insert 2 semis and 1 final
    s1 = await Match(
        tournament_id=tournament.id,
        match_number=10,
        stage="semi",
        bracket_slot="SF1",
        round_order=1,
        label="Semi-final 1",
    ).insert()
    s2 = await Match(
        tournament_id=tournament.id,
        match_number=11,
        stage="semi",
        bracket_slot="SF2",
        round_order=1,
        label="Semi-final 2",
    ).insert()
    f = await Match(
        tournament_id=tournament.id,
        match_number=12,
        stage="final",
        bracket_slot="FINAL",
        round_order=2,
        label="Final",
    ).insert()

    tree = await build_tournament_bracket(tournament.id)
    assert tree.tournament_id == str(tournament.id)
    assert tree.knockout_format == "semis_final"
    assert len(tree.rounds) == 2
    assert tree.rounds[0].round_name == "Semi-finals"
    assert len(tree.rounds[0].matches) == 2
    assert tree.rounds[1].round_name == "Final"
    assert len(tree.rounds[1].matches) == 1
