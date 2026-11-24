import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  createEntityTracker,
  createOrganizer,
  createTournament,
  createTestTeam,
  createTestMatch,
  loginAsAdmin,
  loginUser,
  teardownEntities,
} from '../fixtures/api';

test.describe('MatchGrid Phase 5: Public Two-Tier UI, Tournament Hub & Visual Bracket Tree', () => {
  test('verifies tournament hub directory, two-tier navigation shell, switcher, and bracket tree', async ({
    page,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);

    const orgCreds = { username: `e2e_p5org_${suffix}`, password: `Pass!${suffix}1` };

    try {
      // 1. Create an organizer
      const org = await createOrganizer(request, superadminToken, {
        username: orgCreds.username,
        password: orgCreds.password,
        organization_name: `Continental Org ${suffix}`,
        email: `${orgCreds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(org.id);

      const orgToken = await loginUser(request, orgCreds);

      // 2. Create Tournament A (Europa Cup) & Tournament B (Conference League)
      const tA = await createTournament(request, orgToken, {
        name: `Europa Cup ${suffix}`,
        season: '2026',
        slug: `europa-${suffix}`,
      });
      tracker.tournamentIds.push(tA.id);

      const tB = await createTournament(request, orgToken, {
        name: `Conference League ${suffix}`,
        season: '2026',
        slug: `conf-${suffix}`,
      });
      tracker.tournamentIds.push(tB.id);

      // 3. Populate Tournament A with teams and fixtures
      const teamA1 = await createTestTeam(request, orgToken, {
        name: `Alpha FC ${suffix}`,
        tournament_id: tA.id,
        group_name: 'A',
      });
      tracker.teamIds.push(teamA1.id);

      const teamA2 = await createTestTeam(request, orgToken, {
        name: `Beta United ${suffix}`,
        tournament_id: tA.id,
        group_name: 'A',
      });
      tracker.teamIds.push(teamA2.id);

      const matchA1 = await createTestMatch(request, orgToken, {
        team1_id: teamA1.id,
        team2_id: teamA2.id,
        group_id: teamA1.group_id,
        tournament_id: tA.id,
        match_number: 1,
        venue: 'Metro Arena',
      });
      tracker.matchIds.push(matchA1.id);

      // 4. Visit Public Tournament Hub at '/'
      await page.goto('/');

      // Verify Hub Hero & Title
      await expect(page).toHaveTitle(/MatchGrid/i);
      await expect(page.locator('.public-hub-page h1')).toContainText('MatchGrid Tournament Hub');

      // Verify both tournament cards appear in the hub grid
      const cardA = page.locator('.tournament-card', { hasText: `Europa Cup ${suffix}` });
      const cardB = page.locator('.tournament-card', { hasText: `Conference League ${suffix}` });
      await expect(cardA).toBeVisible();
      await expect(cardB).toBeVisible();

      // 5. Test Search Filtering on the Hub
      const searchInput = page.getByPlaceholder('Search competitions...');
      await searchInput.fill(`Europa Cup ${suffix}`);
      await expect(cardA).toBeVisible();
      await expect(cardB).not.toBeVisible();

      await searchInput.fill(`Conference League ${suffix}`);
      await expect(cardA).not.toBeVisible();
      await expect(cardB).toBeVisible();

      await searchInput.clear();
      await expect(cardA).toBeVisible();
      await expect(cardB).toBeVisible();

      // 6. Navigate into Tournament A Center (/t/:slug)
      await cardA.click();
      await expect(page).toHaveURL(new RegExp(`/t/europa-${suffix}`));

      // Verify Tier 1 Header + Wordmark
      await expect(page.locator('header .brand-wordmark-title')).toContainText('MatchGrid');

      // Verify Tier 2 Sticky Sub-Navigation
      const subNav = page.locator('.tournament-subnav-container');
      await expect(subNav).toBeVisible();
      await expect(subNav.locator('.tournament-subnav-title')).toContainText(`Europa Cup ${suffix}`);

      // Verify Tier 2 Sub-Nav tabs: Overview, Matches, Standings, Bracket, Teams, Stats
      const subNavTabs = subNav.locator('.tournament-subnav-tabs');
      await expect(subNavTabs.getByRole('link', { name: 'Overview' })).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Matches' })).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Standings' })).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Bracket' })).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Teams' })).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Stats' })).toBeVisible();

      // 7. Test Tournament Switcher in Tier 1 Navbar
      const switcherBtn = page.locator('header').getByRole('button', { name: /Select tournament/i });
      await expect(switcherBtn).toBeVisible();
      await expect(switcherBtn).toContainText(`Europa Cup ${suffix}`);

      await switcherBtn.click();
      const switcherMenu = page.locator('.tournament-switcher-menu');
      await expect(switcherMenu).toBeVisible();
      await expect(switcherMenu.getByRole('option', { name: new RegExp(`Conference League ${suffix}`) })).toBeVisible();

      // Switch to Tournament B (Conference League)
      await switcherMenu.getByRole('option', { name: new RegExp(`Conference League ${suffix}`) }).click();
      await expect(page).toHaveURL(new RegExp(`/t/conf-${suffix}`));
      await expect(subNav.locator('.tournament-subnav-title')).toContainText(`Conference League ${suffix}`);

      // 8. Test Visual Bracket Tree (/t/:slug/bracket)
      await page.goto(`/t/europa-${suffix}/bracket`);
      await expect(page.locator('.tournament-bracket-page h2')).toContainText('Knockout Stage & Bracket Tree');
      await expect(
        page.locator('[data-testid="bracket-empty"]').or(page.locator('[data-testid="tournament-bracket"]'))
      ).toBeVisible();

      // 9. Mobile Responsiveness at 375x812 Viewport
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/t/europa-${suffix}`);

      // Tier 2 subnav tabs should be visible with horizontal scrollability
      await expect(subNavTabs).toBeVisible();
      await expect(subNavTabs.getByRole('link', { name: 'Matches' })).toBeVisible();

      // Hamburger button should be operational
      const menuBtn = page.getByRole('button', { name: /Open mobile menu/i });
      await expect(menuBtn).toBeVisible();
      await menuBtn.click();
      const mobileDrawer = page.locator('.mobile-drawer');
      await expect(mobileDrawer).toHaveClass(/open/);

      const closeBtn = page.getByRole('button', { name: /Close menu/i });
      await closeBtn.click();
      await expect(mobileDrawer).not.toHaveClass(/open/);
    } finally {
      // 10. Mandatory teardown
      await teardownEntities(request, superadminToken, tracker);
    }
  });
});
