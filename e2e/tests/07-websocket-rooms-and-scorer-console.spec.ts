import { test, expect, Page } from '@playwright/test';
import {
  API_BASE_URL,
  createEntityTracker,
  createOrganizer,
  createScorer,
  createTournament,
  createTestTeam,
  createTestMatch,
  assignScorerToMatch,
  loginAsAdmin,
  loginUser,
  teardownEntities,
} from '../fixtures/api';

test.describe('MatchGrid Phase 4: Room-Scoped WebSockets & Scoped Scorer Console', () => {
  test('verifies room isolation, scorer cockpit scoping, and 403 live console lockout', async ({
    page,
    browser,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);

    const org1Creds = { username: `e2e_org1_${suffix}`, password: `Pass!${suffix}1` };
    const org2Creds = { username: `e2e_org2_${suffix}`, password: `Pass!${suffix}2` };
    const scorer1Creds = { username: `e2e_sc1_${suffix}`, password: `Scorer!${suffix}1` };
    const scorer2Creds = { username: `e2e_sc2_${suffix}`, password: `Scorer!${suffix}2` };

    let contextA;
    let contextB;

    try {
      // 1. Create two distinct organizers
      const org1 = await createOrganizer(request, superadminToken, {
        username: org1Creds.username,
        password: org1Creds.password,
        organization_name: `Premier League Org ${suffix}`,
        email: `${org1Creds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(org1.id);

      const org2 = await createOrganizer(request, superadminToken, {
        username: org2Creds.username,
        password: org2Creds.password,
        organization_name: `La Liga Org ${suffix}`,
        email: `${org2Creds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(org2.id);

      const org1Token = await loginUser(request, org1Creds);
      const org2Token = await loginUser(request, org2Creds);

      // 2. Create Tournament 1 (Org 1) and Tournament 2 (Org 2)
      const t1 = await createTournament(request, org1Token, {
        name: `Champions Cup ${suffix}`,
        season: '2026',
        slug: `ucl-${suffix}`,
      });
      tracker.tournamentIds.push(t1.id);

      const t2 = await createTournament(request, org2Token, {
        name: `Super Cup ${suffix}`,
        season: '2026',
        slug: `usc-${suffix}`,
      });
      tracker.tournamentIds.push(t2.id);

      // 3. Create Teams
      const team1A = await createTestTeam(request, org1Token, {
        name: `Madrid ${suffix}`,
        color: '#FFFFFF',
        tournament_id: t1.id,
      });
      const team1B = await createTestTeam(request, org1Token, {
        name: `Munich ${suffix}`,
        color: '#DC052D',
        tournament_id: t1.id,
      });
      tracker.teamIds.push(team1A.id, team1B.id);

      const team2A = await createTestTeam(request, org2Token, {
        name: `Milan ${suffix}`,
        color: '#FB090B',
        tournament_id: t2.id,
      });
      const team2B = await createTestTeam(request, org2Token, {
        name: `Inter ${suffix}`,
        color: '#001489',
        tournament_id: t2.id,
      });
      tracker.teamIds.push(team2A.id, team2B.id);

      // 4. Create Matches: Match 1 in T1, Match 2 in T2
      const match1 = await createTestMatch(request, org1Token, {
        team1_id: team1A.id,
        team2_id: team1B.id,
        tournament_id: t1.id,
        stage: 'extra',
        label: `T1 Match ${suffix}`,
        match_number: 101,
      });
      tracker.matchIds.push(match1.id);

      const match2 = await createTestMatch(request, org2Token, {
        team1_id: team2A.id,
        team2_id: team2B.id,
        tournament_id: t2.id,
        stage: 'extra',
        label: `T2 Match ${suffix}`,
        match_number: 202,
      });
      tracker.matchIds.push(match2.id);

      // 5. Create Scorers: Scorer 1 (Org 1) and Scorer 2 (Org 2)
      const scorer1 = await createScorer(request, org1Token, {
        username: scorer1Creds.username,
        password: scorer1Creds.password,
      });
      tracker.scorerIds.push(scorer1.id);

      const scorer2 = await createScorer(request, org2Token, {
        username: scorer2Creds.username,
        password: scorer2Creds.password,
      });
      tracker.scorerIds.push(scorer2.id);

      // 6. Assign Scorer 1 -> Match 1, Scorer 2 -> Match 2
      await assignScorerToMatch(request, org1Token, match1.id, scorer1.id);
      await assignScorerToMatch(request, org2Token, match2.id, scorer2.id);

      const scorer1Token = await loginUser(request, scorer1Creds);
      const scorer2Token = await loginUser(request, scorer2Creds);

      // -----------------------------------------------------------------
      // SECTION A: WebSocket Room Partitioning & Strict Traffic Isolation
      // -----------------------------------------------------------------
      contextA = await browser.newContext();
      contextB = await browser.newContext();
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // Page A subscribes strictly to Tournament 1 room
      await pageA.goto('/');
      await pageA.evaluate((tid) => {
        return new Promise((resolve, reject) => {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${proto}//${window.location.host}/ws/live?tournament_id=${tid}`);
          (window as any).__wsMessages = [];
          ws.onopen = () => resolve(true);
          ws.onerror = (e) => reject(e);
          ws.onmessage = (event) => {
            try {
              (window as any).__wsMessages.push(JSON.parse(event.data));
            } catch {}
          };
          (window as any).__ws = ws;
        });
      }, t1.id);

      // Page B subscribes strictly to Tournament 2 room
      await pageB.goto('/');
      await pageB.evaluate((tid) => {
        return new Promise((resolve, reject) => {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${proto}//${window.location.host}/ws/live?tournament_id=${tid}`);
          (window as any).__wsMessages = [];
          ws.onopen = () => resolve(true);
          ws.onerror = (e) => reject(e);
          ws.onmessage = (event) => {
            try {
              (window as any).__wsMessages.push(JSON.parse(event.data));
            } catch {}
          };
          (window as any).__ws = ws;
        });
      }, t2.id);

      // Scorer 1 mutates Match 1 (starts match in Tournament 1)
      const startRes = await request.post(`${API_BASE_URL}/api/matches/${match1.id}/start`, {
        headers: { Authorization: `Bearer ${scorer1Token}` },
      });
      expect(startRes.status()).toBe(200);

      // Verify Page A (Tournament 1 subscriber) receives match_status_changed
      await expect.poll(async () => {
        return await pageA.evaluate((mid) => {
          const msgs = (window as any).__wsMessages || [];
          return msgs.some((m: any) => m.match_id === mid && m.type === 'match_status_changed');
        }, match1.id);
      }, { timeout: 8000 }).toBe(true);

      // Verify Page B (Tournament 2 subscriber) receives ZERO frames for Match 1
      const leakCheck = await pageB.evaluate((mid) => {
        const msgs = (window as any).__wsMessages || [];
        return msgs.filter((m: any) => m.match_id === mid);
      }, match1.id);
      expect(leakCheck.length).toBe(0);

      // -----------------------------------------------------------------
      // SECTION B: Scorer Cockpit Scoping (/scorer)
      // -----------------------------------------------------------------
      // Authenticate browser as Scorer 1
      await page.goto('/');
      await page.evaluate(
        ({ token, username }) => {
          localStorage.setItem('matchgrid_admin_token', token);
          localStorage.setItem('matchgrid_admin_username', username);
          localStorage.setItem('matchgrid_role', 'SCORER');
          window.dispatchEvent(new Event('matchgrid-auth-changed'));
        },
        { token: scorer1Token, username: scorer1Creds.username }
      );

      // Navigate to /scorer
      await page.goto('/scorer');

      // Verify Scorer Cockpit header and operator badge
      await expect(page.locator('h1')).toContainText('Scorer Cockpit');
      await expect(page.getByText(scorer1Creds.username)).toBeVisible();

      // Scorer 1 must see Match 1 card
      const match1Card = page.locator(`[data-testid="scorer-match-card-${match1.id}"]`);
      await expect(match1Card).toBeVisible();
      await expect(match1Card).toContainText(team1A.name);
      await expect(match1Card).toContainText(team1B.name);
      await expect(match1Card).toContainText(`Champions Cup ${suffix}`);

      // Scorer 1 must NOT see Match 2
      const match2Card = page.locator(`[data-testid="scorer-match-card-${match2.id}"]`);
      await expect(match2Card).not.toBeVisible();

      // Click "Open Live Console" for Match 1
      const openConsoleBtn = page.locator(`[data-testid="scorer-open-console-${match1.id}"]`);
      await expect(openConsoleBtn).toBeVisible();
      await openConsoleBtn.click();

      // Verify navigation to live match control page
      await expect(page).toHaveURL(`/admin/matches/${match1.id}/live`);
      await expect(page.locator(`text=${team1A.name}`).first()).toBeVisible();

      // -----------------------------------------------------------------
      // SECTION C: Cross-Tenant / Unassigned Lockout (403 Forbidden Access Denied)
      // -----------------------------------------------------------------
      // Scorer 1 attempts to open live control console for Match 2 (assigned to Scorer 2 in T2)
      await page.goto(`/admin/matches/${match2.id}/live`);

      // Match 2 details load (public info)
      await expect(page.locator(`text=${team2A.name}`).first()).toBeVisible();

      // Scorer 1 attempts to start Match 2
      const startMatch2Btn = page.getByRole('button', { name: /Start Match \(Kick Off\)/i });
      await expect(startMatch2Btn).toBeVisible();
      await startMatch2Btn.click();

      // Verify access denied banner displays with 403 Forbidden message
      const accessDeniedBanner = page.locator('[data-testid="access-denied-banner"]');
      await expect(accessDeniedBanner).toBeVisible({ timeout: 6000 });
      await expect(accessDeniedBanner).toContainText(/Access Denied|not assigned to score this match/i);
    } finally {
      // -----------------------------------------------------------------
      // Clean Teardown Invariant
      // -----------------------------------------------------------------
      if (contextA) await contextA.close().catch(() => {});
      if (contextB) await contextB.close().catch(() => {});
      await teardownEntities(request, superadminToken, tracker);
    }
  });
});
