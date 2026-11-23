import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  createTestTeam,
  createTestPlayer,
  createTestMatch,
  teardownEntities,
  createEntityTracker,
} from '../fixtures/api';

test.describe('MatchGrid Live Match Lifecycle & Real-Time Sync', () => {
  test('creates match, controls live clock, logs goal, and syncs score to spectator via WebSocket', async ({
    page,
    browser,
    request,
  }) => {
    const tracker = createEntityTracker();
    const token = await loginAsAdmin(request);

    let spectatorContext;
    try {
      // 1. Create temporary test teams
      const team1 = await createTestTeam(request, token, {
        name: `E2E Tigers ${Date.now().toString().slice(-4)}`,
        color: '#10B981',
      });
      tracker.teamIds.push(team1.id);

      const team2 = await createTestTeam(request, token, {
        name: `E2E Eagles ${Date.now().toString().slice(-4)}`,
        color: '#34D399',
      });
      tracker.teamIds.push(team2.id);

      // 2. Create test players for both teams
      const player1 = await createTestPlayer(request, token, {
        team_id: team1.id,
        name: 'Striker One',
        number: 9,
      });
      tracker.playerIds.push(player1.id);

      const player2 = await createTestPlayer(request, token, {
        team_id: team2.id,
        name: 'Keeper Two',
        number: 1,
      });
      tracker.playerIds.push(player2.id);

      // 3. Create a test match
      const match = await createTestMatch(request, token, {
        team1_id: team1.id,
        team2_id: team2.id,
        label: 'E2E Final Showcase',
        stage: 'extra',
      });
      tracker.matchIds.push(match.id);

      // 4. Authenticate Admin browser context
      await page.goto('/');
      await page.evaluate((t) => {
        localStorage.setItem('matchgrid_admin_token', t);
        localStorage.setItem('dcl_admin_token', t);
      }, token);

      // Navigate to Admin Live Scorer
      await page.goto(`/admin/matches/${match.id}/live`);
      await expect(page.locator(`text=${team1.name}`).first()).toBeVisible();
      await expect(page.locator(`text=${team2.name}`).first()).toBeVisible();

      // 5. Open separate Spectator browser context
      spectatorContext = await browser.newContext();
      const spectatorPage = await spectatorContext.newPage();
      await spectatorPage.goto(`/matches/${match.id}`);
      await expect(spectatorPage.locator(`text=${team1.name}`).first()).toBeVisible();
      await expect(spectatorPage.locator('.pill-upcoming')).toBeVisible();

      // 6. Admin starts the match
      const startBtn = page.getByRole('button', { name: /Start Match \(Kick Off\)/i });
      await expect(startBtn).toBeVisible();
      await startBtn.click();

      // Verify admin sees LIVE status
      await expect(page.locator('[data-testid="timer-status"]')).toContainText(/LIVE/i, { timeout: 6000 });

      // Verify spectator receives live state without manual reload
      await expect(spectatorPage.locator('.pill-live')).toBeVisible({ timeout: 6000 });

      // 7. Admin logs a goal for Team 1
      await page.selectOption('#event-player', player1.id);
      await page.fill('#event-minute', '15');
      const submitEventBtn = page.getByRole('button', { name: /Submit Event/i });
      await submitEventBtn.click();

      // Verify admin header score updates to 1 - 0
      await expect(page.locator('.hero-score')).toContainText('1', { timeout: 6000 });

      // Verify spectator page reflects score "1" via WebSocket broadcast
      await expect(spectatorPage.locator('.hero-score')).toContainText('1', { timeout: 6000 });

      // 8. Admin ends match (Full Time)
      const endBtn = page.getByRole('button', { name: /End Match \(Full Time\)/i });
      await expect(endBtn).toBeVisible();
      await endBtn.click();

      // Spectator sees Full Time
      await expect(spectatorPage.locator('.pill-full-time').filter({ hasText: 'FT' })).toBeVisible({ timeout: 6000 });
    } finally {
      // 9. Mandatory Teardown: Clean up all created test entities
      if (spectatorContext) {
        await spectatorContext.close().catch(() => {});
      }
      await teardownEntities(request, token, tracker);
    }
  });
});
