import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  createEntityTracker,
  createOrganizer,
  createScorer,
  createTestMatch,
  createTestPlayer,
  createTestTeam,
  createTournament,
  assignScorerToMatch,
  loginAsAdmin,
  loginUser,
  teardownEntities,
} from '../fixtures/api';

test.describe('MatchGrid Four-Tier RBAC & Multi-Tenant Data Isolation', () => {
  test('verifies Superadmin, Organizer, and Scorer isolation, permissions, and clean teardown', async ({
    page,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);

    const organizerCreds = {
      username: `e2e_org_${suffix}`,
      password: `OrgPass!${suffix}123`,
    };
    const scorerCreds = {
      username: `e2e_scorer_${suffix}`,
      password: `ScorerPass!${suffix}123`,
    };

    try {
      // -------------------------------------------------------------
      // 1. Superadmin creates an Organizer account
      // -------------------------------------------------------------
      const organizer = await createOrganizer(request, superadminToken, {
        username: organizerCreds.username,
        password: organizerCreds.password,
        organization_name: `Premier League ${suffix}`,
        email: `${organizerCreds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(organizer.id);

      expect(organizer.username).toBe(organizerCreds.username);
      expect(organizer.role).toBe('ORGANIZER');
      expect(organizer.is_active).toBe(true);

      // -------------------------------------------------------------
      // 2. Organizer logs in, sees only their tournaments, blocked on Superadmin API
      // -------------------------------------------------------------
      const organizerToken = await loginUser(request, organizerCreds);
      expect(organizerToken).toBeTruthy();

      // Verify Organizer is blocked (403 Forbidden) from /api/superadmin/*
      const forbiddenUsersRes = await request.get(`${API_BASE_URL}/api/superadmin/users`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      });
      expect(forbiddenUsersRes.status()).toBe(403);

      const forbiddenTournamentsRes = await request.get(`${API_BASE_URL}/api/superadmin/tournaments`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      });
      expect(forbiddenTournamentsRes.status()).toBe(403);

      const forbiddenStatsRes = await request.get(`${API_BASE_URL}/api/superadmin/stats`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      });
      expect(forbiddenStatsRes.status()).toBe(403);

      // Organizer creates their own tournament
      const tournament = await createTournament(request, organizerToken, {
        name: `Championship ${suffix}`,
        season: '2026',
        slug: `champ-${suffix}`,
        format_description: 'E2E Multi-Tenant Championship',
      });
      tracker.tournamentIds.push(tournament.id);

      expect(tournament.name).toBe(`Championship ${suffix}`);
      expect(tournament.organizer_id).toBe(organizer.id);

      // Organizer queries /api/organizer/tournaments -> sees only their tournament
      const myTournamentsRes = await request.get(`${API_BASE_URL}/api/organizer/tournaments`, {
        headers: { Authorization: `Bearer ${organizerToken}` },
      });
      expect(myTournamentsRes.ok()).toBeTruthy();
      const myTournaments = await myTournamentsRes.json();
      expect(myTournaments.length).toBeGreaterThanOrEqual(1);
      expect(myTournaments.every((t: any) => t.organizer_id === organizer.id)).toBe(true);

      // -------------------------------------------------------------
      // 3. Organizer creates Teams, Matches, and Scorer
      // -------------------------------------------------------------
      const team1 = await createTestTeam(request, organizerToken, {
        name: `Org Lions ${suffix}`,
        color: '#2563EB',
        tournament_id: tournament.id,
      });
      tracker.teamIds.push(team1.id);

      const team2 = await createTestTeam(request, organizerToken, {
        name: `Org Hawks ${suffix}`,
        color: '#DC2626',
        tournament_id: tournament.id,
      });
      tracker.teamIds.push(team2.id);

      const team3 = await createTestTeam(request, organizerToken, {
        name: `Org Wolves ${suffix}`,
        color: '#059669',
        tournament_id: tournament.id,
      });
      tracker.teamIds.push(team3.id);

      const player1 = await createTestPlayer(request, organizerToken, {
        team_id: team1.id,
        name: `Captain ${suffix}`,
        number: 10,
      });
      tracker.playerIds.push(player1.id);

      const match1 = await createTestMatch(request, organizerToken, {
        team1_id: team1.id,
        team2_id: team2.id,
        label: 'Match 1 - Assigned',
        tournament_id: tournament.id,
      });
      tracker.matchIds.push(match1.id);

      const match2 = await createTestMatch(request, organizerToken, {
        team1_id: team1.id,
        team2_id: team3.id,
        label: 'Match 2 - Unassigned',
        tournament_id: tournament.id,
      });
      tracker.matchIds.push(match2.id);

      // Organizer creates Scorer
      const scorer = await createScorer(request, organizerToken, scorerCreds);
      tracker.scorerIds.push(scorer.id);
      expect(scorer.role).toBe('SCORER');
      expect(scorer.created_by).toBe(organizer.id);

      // Organizer assigns Scorer to Match 1, leaves Match 2 unassigned
      const assignedMatch1 = await assignScorerToMatch(request, organizerToken, match1.id, scorer.id);
      expect(assignedMatch1.assigned_scorer_ids).toContain(scorer.id);

      // -------------------------------------------------------------
      // 4. Scorer logs in, sees only Match 1, operates Match 1, blocked on Match 2
      // -------------------------------------------------------------
      const scorerToken = await loginUser(request, scorerCreds);
      expect(scorerToken).toBeTruthy();

      // Scorer endpoint /api/scorer/matches returns ONLY Match 1
      const scorerMatchesRes = await request.get(`${API_BASE_URL}/api/scorer/matches`, {
        headers: { Authorization: `Bearer ${scorerToken}` },
      });
      expect(scorerMatchesRes.ok()).toBeTruthy();
      const scorerMatches = await scorerMatchesRes.json();
      const matchIds = scorerMatches.map((m: any) => m.id);
      expect(matchIds).toContain(match1.id);
      expect(matchIds).not.toContain(match2.id);

      // Scorer accesses Live Scorer UI for Match 1
      await page.goto('/');
      await page.evaluate((token) => {
        localStorage.setItem('matchgrid_admin_token', token);
        localStorage.setItem('dcl_admin_token', token);
        localStorage.setItem('matchgrid_role', 'SCORER'); // a session without a role is not trusted
      }, scorerToken);

      await page.goto(`/scorer/matches/${match1.id}/live`);
      await expect(page.locator(`text=${team1.name}`).first()).toBeVisible({ timeout: 8000 });
      await expect(page.locator(`text=${team2.name}`).first()).toBeVisible({ timeout: 8000 });

      // Scorer kicks off Match 1
      const startBtn = page.getByRole('button', { name: /Start Match \(Kick Off\)/i });
      await expect(startBtn).toBeVisible();
      await startBtn.click();
      await expect(page.locator('[data-testid="timer-status"]')).toContainText(/LIVE/i, { timeout: 6000 });

      // Scorer attempts mutation on unassigned Match 2 -> 403 Forbidden
      const blockedStartRes = await request.post(`${API_BASE_URL}/api/matches/${match2.id}/start`, {
        headers: { Authorization: `Bearer ${scorerToken}` },
      });
      expect(blockedStartRes.status()).toBe(403);

      const blockedEventRes = await request.post(`${API_BASE_URL}/api/matches/${match2.id}/events`, {
        headers: { Authorization: `Bearer ${scorerToken}` },
        data: {
          minute: 5,
          type: 'goal',
          team_id: team1.id,
          player_id: player1.id,
        },
      });
      expect(blockedEventRes.status()).toBe(403);
    } finally {
      // -------------------------------------------------------------
      // 5. Mandatory Teardown removes all created test records
      // -------------------------------------------------------------
      await teardownEntities(request, superadminToken, tracker);

      // Confirm DB health endpoint responds successfully
      const healthDbRes = await request.get(`${API_BASE_URL}/health/db`);
      expect(healthDbRes.ok()).toBeTruthy();
    }
  });
});
