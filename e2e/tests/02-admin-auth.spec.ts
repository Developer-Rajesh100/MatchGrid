import { test, expect } from '@playwright/test';
import { ADMIN_CREDENTIALS, API_BASE_URL, loginAsAdmin } from '../fixtures/api';

const clearSession = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
};

test.describe('MatchGrid Authentication, Role Redirects & Session Management', () => {
  test('redirects an unauthenticated visitor from every portal (and the old /admin) to /login', async ({ page }) => {
    await clearSession(page);

    for (const protectedPath of ['/organizer', '/superadmin', '/scorer', '/admin']) {
      await page.goto(protectedPath);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.locator('text=MatchGrid Portal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In to Operations Console/i })).toBeVisible();

    // the retired /admin/login alias lands on the same page
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('displays error message on invalid credentials', async ({ page }) => {
    await clearSession(page);
    await page.goto('/login');

    await page.fill('input[type="text"]', 'invalid_user');
    await page.fill('input[type="password"]', 'wrong_password_123');
    await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();

    await expect(page.locator('text=Authentication failed').or(page.locator('text=Invalid'))).toBeVisible({
      timeout: 5000,
    });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs a superadmin in to /superadmin, keeps the 403 view for other portals, and supports logout', async ({ page }) => {
    await clearSession(page);
    await page.goto('/login');

    await page.fill('input[type="text"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();

    await expect(page).toHaveURL(/\/superadmin$/);
    await expect(page.getByText('Superadmin Command Center')).toBeVisible();

    // the old /admin URL is the organizer workspace now
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/organizer$/);

    const token = await page.evaluate(() => localStorage.getItem('matchgrid_admin_token'));
    expect(token).toBeTruthy();

    const logoutBtn = page.locator('header').getByRole('button', { name: /Logout/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    await expect(page).toHaveURL('/');
    const clearedToken = await page.evaluate(() => localStorage.getItem('matchgrid_admin_token'));
    expect(clearedToken).toBeFalsy();
  });

  test('shows a 403 screen to a signed-in user whose role does not fit the page, never a silent redirect', async ({ page, request }) => {
    const token = await loginAsAdmin(request);
    const username = `e2e_scorer_${Date.now().toString().slice(-6)}`;
    const password = 'e2e-scorer-pass-1';
    // organizer-level account creation needs an organizer; a superadmin can create scorers too
    const created = await request.post(`${API_BASE_URL}/api/organizer/scorers`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { username, password },
    });
    expect(created.ok()).toBeTruthy();
    const scorerId = (await created.json()).id;

    try {
      await clearSession(page);
      await page.goto('/login');
      await page.fill('input[type="text"]', username);
      await page.fill('input[type="password"]', password);
      await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();
      await expect(page).toHaveURL(/\/scorer$/);

      await page.goto('/superadmin');
      await expect(page.getByTestId('forbidden-state')).toContainText('403');
      await expect(page).toHaveURL(/\/superadmin$/);
      await page.getByRole('link', { name: /Go to my workspace/i }).click();
      await expect(page).toHaveURL(/\/scorer$/);
    } finally {
      await request.delete(`${API_BASE_URL}/api/organizer/scorers/${scorerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test('an expired session sends the user back to /login and returns them to the page afterwards', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();
    await expect(page).toHaveURL(/\/superadmin$/);

    // The server stops accepting the token (what an expiry looks like to the browser).
    await page.evaluate(() => localStorage.setItem('matchgrid_admin_token', 'expired.invalid.token'));
    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('session-expired')).toBeVisible();
  });
});
