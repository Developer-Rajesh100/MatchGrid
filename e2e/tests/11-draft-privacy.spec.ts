import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  createEntityTracker,
  createOrganizer,
  createTournament,
  loginAsAdmin,
  loginUser,
  signInBrowser,
  teardownEntities,
} from '../fixtures/api';

// A draft tournament is private while its organizer sets it up: not in the public hub, and its
// pages read as "not found" to anyone but its organizer (or the superadmin / its scorers).
test.describe('Draft tournaments stay private until published', () => {
  test('hidden from the public hub and pages, visible to the organizer, public once active', async ({
    page,
    browser,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-6);
    const creds = { username: `e2e_draft_org_${suffix}`, password: `DraftOrg!${suffix}x` };
    const slug = `e2e-draft-${suffix}`;
    const name = `E2E Draft Cup ${suffix}`;
    const spectator = await browser.newContext();

    try {
      const organizer = await createOrganizer(request, superadminToken, creds);
      tracker.userIds.push(organizer.id);
      const orgToken = await loginUser(request, creds);
      const tournament = await createTournament(request, orgToken, { name, season: '2026', slug });
      tracker.tournamentIds.push(tournament.id);

      const setStatus = (status: string) =>
        request.patch(`${API_BASE_URL}/api/organizer/tournaments/${tournament.id}`, {
          headers: { Authorization: `Bearer ${orgToken}` },
          data: { status },
        });
      expect((await setStatus('draft')).ok()).toBeTruthy();

      // Public: not in the hub, and the direct link is a not-found.
      const pub = await spectator.newPage();
      await pub.goto('/');
      await expect(pub.locator('.tournament-card').first()).toBeVisible();
      await expect(pub.getByText(name)).toHaveCount(0);
      await pub.goto(`/t/${slug}`);
      await expect(pub.getByText('Tournament not found')).toBeVisible();
      expect((await request.get(`${API_BASE_URL}/api/tournaments/slug/${slug}`)).status()).toBe(404);

      // Its organizer can still open it.
      await signInBrowser(page, { token: orgToken, role: 'ORGANIZER', username: creds.username });
      await page.goto(`/t/${slug}`);
      await expect(page.getByText(name).first()).toBeVisible();
      await expect(page.getByText('Tournament not found')).toHaveCount(0);

      // Publishing makes it public.
      expect((await setStatus('active')).ok()).toBeTruthy();
      await pub.goto('/');
      await expect(pub.getByText(name).first()).toBeVisible();
      await pub.goto(`/t/${slug}`);
      await expect(pub.getByText('Tournament not found')).toHaveCount(0);
    } finally {
      await spectator.close();
      await teardownEntities(request, superadminToken, tracker);
    }
  });
});
