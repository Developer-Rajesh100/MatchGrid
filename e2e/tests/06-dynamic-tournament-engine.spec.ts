import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  addMatchGoal,
  createEntityTracker,
  createTestPlayer,
  createTestTeam,
  createTournament,
  endMatch,
  generateFinal,
  generateGroupFixtures,
  getBracketTree,
  loginAsAdmin,
  recordMatchWinner,
  seedKnockoutBracket,
  startMatch,
  teardownEntities,
  triggerRandomDraw,
  updateTournamentConfig,
} from '../fixtures/api';

test.describe('MatchGrid Dynamic Tournament, Group Draw & Knockout Bracket Engine', () => {
  test('configures 8-team format, runs dynamic draw, generates fixtures, executes knockout with penalty override, and crowns champion in UI', async ({
    page,
    request,
  }) => {
    const tracker = createEntityTracker();
    const token = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-4);
    // Its own tournament (groups A and B are created with it): mutating endpoints always name one,
    // and teardown cascades through it.
    const tournament = await createTournament(request, token, { name: `E2E Engine ${suffix}`, season: '1' });
    tracker.tournamentIds.push(tournament.id);
    const tournamentId: string = tournament.id;

    try {
      // -------------------------------------------------------------
      // 1. Update Tournament Config: 2 groups of 4, top 2 advance to semis
      // -------------------------------------------------------------
      const updatedTournament = await updateTournamentConfig(request, token, tournamentId, {
        num_groups: 2,
        teams_per_group: 4,
        qualifiers_per_group: 2,
        knockout_format: 'semis_final',
        points_win: 3,
        points_draw: 1,
        points_loss: 0,
        half_duration_minutes: 20,
      });

      expect(updatedTournament.config).toBeDefined();
      expect(updatedTournament.config.num_groups).toBe(2);
      expect(updatedTournament.config.teams_per_group).toBe(4);
      expect(updatedTournament.config.qualifiers_per_group).toBe(2);
      expect(updatedTournament.config.knockout_format).toBe('semis_final');
      expect(updatedTournament.config.half_duration_minutes).toBe(20);

      // -------------------------------------------------------------
      // 2. Register 8 Teams & 8 Players
      // -------------------------------------------------------------
      const teams = [];
      const players = [];
      const teamColors = [
        '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
        '#F59E0B', '#EF4444', '#14B8A6', '#6366F1'
      ];

      for (let i = 1; i <= 8; i++) {
        const team = await createTestTeam(request, token, {
          name: `Dyn FC ${i}-${suffix}`,
          color: teamColors[i - 1],
          tournament_id: tournamentId,
        });
        teams.push(team);
        tracker.teamIds.push(team.id);

        const player = await createTestPlayer(request, token, {
          team_id: team.id,
          name: `Player ${i}`,
          number: 10,
        });
        players.push(player);
        tracker.playerIds.push(player.id);
      }

      expect(teams).toHaveLength(8);

      // -------------------------------------------------------------
      // 3. Dynamic Balanced Group Draw (8 teams distributed across 2 groups: 4 each)
      // -------------------------------------------------------------
      const groups = await triggerRandomDraw(request, token, tournamentId);
      expect(groups).toHaveLength(2);
      expect(groups[0].name).toBe('A');
      expect(groups[0].teams).toHaveLength(4);
      expect(groups[1].name).toBe('B');
      expect(groups[1].teams).toHaveLength(4);

      const groupAId = groups[0].id;
      const groupBId = groups[1].id;

      // -------------------------------------------------------------
      // 4. Circle-Method Round-Robin Schedule Generation
      // -------------------------------------------------------------
      const groupAMatches = await generateGroupFixtures(request, token, groupAId, true);
      const groupBMatches = await generateGroupFixtures(request, token, groupBId, true);

      // 4 teams -> n*(n-1)/2 = 6 round-robin fixtures per group
      expect(groupAMatches).toHaveLength(6);
      expect(groupBMatches).toHaveLength(6);

      for (const m of [...groupAMatches, ...groupBMatches]) {
        tracker.matchIds.push(m.id);
        expect(m.stage).toBe('group');
      }

      // -------------------------------------------------------------
      // 5. Spectator UI: Navigate to /matches and inspect Bracket tab (Pending State)
      // -------------------------------------------------------------
      await page.goto(`/t/${tournament.slug}/matches`);
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Match Fixtures & Results');

      const bracketTab = page.locator('[data-testid="tab-bracket"]');
      await expect(bracketTab).toBeVisible();
      await bracketTab.click();

      // Prior to knockout seeding, empty state is rendered
      const emptyState = page.locator('[data-testid="bracket-empty"]');
      await expect(emptyState).toBeVisible({ timeout: 10000 });
      await expect(emptyState.getByText('Knockout Stage Pending')).toBeVisible();

      // -------------------------------------------------------------
      // 6. Complete Group Matches (Simulate results for deterministic standings)
      // -------------------------------------------------------------
      // Map team IDs to players for goal attribution
      const teamPlayerMap = new Map();
      for (let i = 0; i < 8; i++) {
        teamPlayerMap.set(teams[i].id, players[i].id);
      }

      // Group A simulation: team1 in groupA wins all 3 games, team2 wins other 2
      const groupATeams = groups[0].teams;
      const topTeamAId = groupATeams[0].id;
      const runnerUpTeamAId = groupATeams[1].id;

      for (const m of groupAMatches) {
        await startMatch(request, token, m.id);
        // Decide winner
        const t1 = m.team1_id;
        const t2 = m.team2_id;
        let winnerTeamId = t1;
        if (t1 === topTeamAId || t2 === topTeamAId) {
          winnerTeamId = topTeamAId;
        } else if (t1 === runnerUpTeamAId || t2 === runnerUpTeamAId) {
          winnerTeamId = runnerUpTeamAId;
        }

        const scoringPlayerId = teamPlayerMap.get(winnerTeamId) || players[0].id;
        await addMatchGoal(request, token, m.id, {
          team_id: winnerTeamId,
          player_id: scoringPlayerId,
          minute: 12,
        });
        await endMatch(request, token, m.id);
      }

      // Group B simulation: team1 in groupB wins all 3 games, team2 wins other 2
      const groupBTeams = groups[1].teams;
      const topTeamBId = groupBTeams[0].id;
      const runnerUpTeamBId = groupBTeams[1].id;

      for (const m of groupBMatches) {
        await startMatch(request, token, m.id);
        const t1 = m.team1_id;
        const t2 = m.team2_id;
        let winnerTeamId = t1;
        if (t1 === topTeamBId || t2 === topTeamBId) {
          winnerTeamId = topTeamBId;
        } else if (t1 === runnerUpTeamBId || t2 === runnerUpTeamBId) {
          winnerTeamId = runnerUpTeamBId;
        }

        const scoringPlayerId = teamPlayerMap.get(winnerTeamId) || players[0].id;
        await addMatchGoal(request, token, m.id, {
          team_id: winnerTeamId,
          player_id: scoringPlayerId,
          minute: 15,
        });
        await endMatch(request, token, m.id);
      }

      // -------------------------------------------------------------
      // 7. Seed Knockout Stage (Semi-Finals)
      // -------------------------------------------------------------
      const semiMatches = await seedKnockoutBracket(request, token, tournamentId, 'semi', true);
      expect(semiMatches).toHaveLength(2);
      for (const sm of semiMatches) {
        tracker.matchIds.push(sm.id);
        expect(sm.stage).toBe('semi');
      }

      const sf1 = semiMatches.find((m: any) => m.bracket_slot === 'SF1') || semiMatches[0];
      const sf2 = semiMatches.find((m: any) => m.bracket_slot === 'SF2') || semiMatches[1];

      expect(sf1.team1_id).toBeTruthy();
      expect(sf1.team2_id).toBeTruthy();
      expect(sf2.team1_id).toBeTruthy();
      expect(sf2.team2_id).toBeTruthy();

      // -------------------------------------------------------------
      // 8. Semi-Final 1: Tied 0-0 -> Penalty Shootout Override
      // -------------------------------------------------------------
      await startMatch(request, token, sf1.id);
      await endMatch(request, token, sf1.id);

      // Record penalty winner override for sf1.team1_id
      const sf1WinnerId = sf1.team1_id;
      const updatedSf1 = await recordMatchWinner(request, token, sf1.id, sf1WinnerId);
      expect(updatedSf1.winner_id).toBe(sf1WinnerId);

      // -------------------------------------------------------------
      // 9. Semi-Final 2: Decided 1-0 in regular time
      // -------------------------------------------------------------
      await startMatch(request, token, sf2.id);
      const sf2WinnerId = sf2.team2_id;
      const sf2Player = teamPlayerMap.get(sf2WinnerId) || players[0].id;
      await addMatchGoal(request, token, sf2.id, {
        team_id: sf2WinnerId,
        player_id: sf2Player,
        minute: 33,
      });
      await endMatch(request, token, sf2.id);

      // -------------------------------------------------------------
      // 10. Generate Final & Verify Seeding from Semi Winners (including penalty override)
      // -------------------------------------------------------------
      const finalMatch = await generateFinal(request, token, tournamentId);
      tracker.matchIds.push(finalMatch.id);
      expect(finalMatch.stage).toBe('final');
      expect(finalMatch.bracket_slot).toBe('FINAL');
      expect(finalMatch.team1_id).toBe(sf1WinnerId); // Penalty winner advanced!
      expect(finalMatch.team2_id).toBe(sf2WinnerId); // SF2 winner advanced!

      // -------------------------------------------------------------
      // 11. Complete Final & Crown Champion
      // -------------------------------------------------------------
      await startMatch(request, token, finalMatch.id);
      const championTeamId = sf1WinnerId;
      const champPlayer = teamPlayerMap.get(championTeamId) || players[0].id;
      await addMatchGoal(request, token, finalMatch.id, {
        team_id: championTeamId,
        player_id: champPlayer,
        minute: 40,
      });
      await endMatch(request, token, finalMatch.id);

      // Check backend tournament stage
      const tournamentRes = await request.get(`${API_BASE_URL}/api/tournaments/${tournamentId}`);
      const tournamentData = await tournamentRes.json();
      expect(tournamentData.stage).toBe('champions');
      expect(tournamentData.champion_team_id).toBe(championTeamId);

      // -------------------------------------------------------------
      // 12. Frontend UI: Verify Champion Banner & Bracket Node Hierarchy
      // -------------------------------------------------------------
      await page.goto(`/t/${tournament.slug}/matches`);
      await page.locator('[data-testid="tab-bracket"]').click();

      // Verify Champion Banner is prominently rendered
      const championBanner = page.locator('[data-testid="champion-banner"]');
      await expect(championBanner).toBeVisible({ timeout: 10000 });
      await expect(championBanner).toContainText('TOURNAMENT CHAMPION');

      const crownedTeam = teams.find((t) => t.id === championTeamId);
      if (crownedTeam) {
        await expect(championBanner.locator('.champion-name')).toContainText(crownedTeam.name);
      }

      // Verify Grand Final match card reflects completed state
      const finalCard = page.locator('[data-testid="match-card-FINAL"]');
      await expect(finalCard).toBeVisible();
      await expect(finalCard.locator('.status-full_time')).toBeVisible();
      await expect(finalCard.locator('.winner-row')).toBeVisible();

      // Verify tree API returns clean data structure
      const bracketTree = await getBracketTree(request, tournamentId);
      expect(bracketTree.champion).toBeDefined();
      expect(bracketTree.champion.team_id).toBe(championTeamId);
      expect(bracketTree.rounds).toHaveLength(2);
    } finally {
      // -------------------------------------------------------------
      // 13. Mandatory Cleanup & Invariant Restoration
      // -------------------------------------------------------------
      // Reset tournament config back to defaults
      await updateTournamentConfig(request, token, tournamentId, {
        num_groups: 2,
        teams_per_group: 3,
        qualifiers_per_group: 2,
        knockout_format: 'semis_final',
        points_win: 3,
        points_draw: 1,
        points_loss: 0,
        half_duration_minutes: 25,
      }).catch(() => {});

      // Delete all created test matches, players, and teams
      await teardownEntities(request, token, tracker);
    }
  });
});
