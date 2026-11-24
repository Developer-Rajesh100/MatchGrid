import { test, expect } from '@playwright/test';

test.describe('MatchGrid Public Smoke & Responsive Navigation', () => {
  test('renders homepage with MatchGrid branding, header, and footer without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Verify title and brand
    await expect(page).toHaveTitle(/MatchGrid/i);
    await expect(page.locator('header .brand-wordmark-title')).toContainText('MatchGrid');

    // Verify nav links exist in main navigation
    const mainNav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(mainNav.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Matches' })).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Standings' })).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Stats' })).toBeVisible();
    await expect(mainNav.getByRole('link', { name: 'Teams' })).toBeVisible();

    // Verify footer branding and status badge
    await expect(page.locator('footer.brand-footer')).toBeVisible();
    await expect(page.locator('footer.brand-footer')).toContainText('MatchGrid');

    // Ensure zero console error regressions
    expect(consoleErrors).toEqual([]);
  });

  test('navigates through all public pages with clean empty states', async ({ page }) => {
    // 1. Matches Page
    await page.goto('/matches');
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Match Fixtures & Results');
    await expect(
      page.getByRole('heading', { name: /No fixtures scheduled/i }).or(
        page.getByRole('heading', { name: /Knockout Stage/i })
      )
    ).toBeVisible();

    // 2. Standings Page
    await page.goto('/standings');
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Tournament Standings');
    await expect(page.locator('text=MatchGrid Progression Rules & Tie-breakers')).toBeVisible();

    // 3. Stats Page
    await page.goto('/stats');
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Tournament Statistics');
    await expect(page.locator('text=Golden Boot (Top Scorers)')).toBeVisible();

    // 4. Teams Page
    await page.goto('/teams');
    await expect(page.getByRole('heading', { level: 2 })).toContainText('Competing Clubs');
    await expect(page.getByRole('heading', { name: /No clubs registered/i })).toBeVisible();
  });

  test('renders responsive mobile drawer navigation at 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    // Hamburger button should be visible on mobile
    const menuBtn = page.getByRole('button', { name: /Open mobile menu/i });
    await expect(menuBtn).toBeVisible();

    // Open mobile drawer
    await menuBtn.click();
    const mobileDrawer = page.locator('.mobile-drawer');
    await expect(mobileDrawer).toHaveClass(/open/);

    // Verify links inside drawer
    await expect(mobileDrawer.getByRole('link', { name: 'Standings' })).toBeVisible();

    // Close mobile drawer by clicking close button
    const closeBtn = page.getByRole('button', { name: /Close menu/i });
    await closeBtn.click();
    await expect(mobileDrawer).not.toHaveClass(/open/);
  });
});
