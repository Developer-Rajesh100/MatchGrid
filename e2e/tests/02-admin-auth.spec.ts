import { test, expect } from '@playwright/test';
import { ADMIN_CREDENTIALS } from '../fixtures/api';

test.describe('MatchGrid Admin Authentication & Session Management', () => {
  test('redirects unauthenticated user visiting /admin to /admin/login', async ({ page }) => {
    // Clear localStorage to ensure unauthenticated state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('matchgrid_admin_token');
      localStorage.removeItem('dcl_admin_token');
    });

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('text=MatchGrid Portal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In to Operations Console/i })).toBeVisible();
  });

  test('displays error message on invalid credentials', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="text"]', 'invalid_user');
    await page.fill('input[type="password"]', 'wrong_password_123');
    await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();

    // Verify error notification
    await expect(page.locator('text=Authentication failed').or(page.locator('text=Invalid'))).toBeVisible({
      timeout: 5000,
    });
    // Should remain on /admin/login
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('successfully authenticates admin, grants dashboard access, and supports logout', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="text"]', ADMIN_CREDENTIALS.username);
    await page.fill('input[type="password"]', ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: /Sign In to Operations Console/i }).click();

    // Redirection to /admin
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    // Verify admin dashboard controls
    await expect(page.getByRole('button', { name: /Matches & Quick Actions/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Squads & Players/i })).toBeVisible();

    // Verify token stored in localStorage
    const token = await page.evaluate(() => localStorage.getItem('matchgrid_admin_token') || localStorage.getItem('dcl_admin_token'));
    expect(token).toBeTruthy();

    // Test Logout - scoped specifically to header action button
    const logoutBtn = page.locator('header').getByRole('button', { name: /Logout/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to / and remove tokens
    await expect(page).toHaveURL('/');
    const clearedToken = await page.evaluate(() => localStorage.getItem('matchgrid_admin_token') || localStorage.getItem('dcl_admin_token'));
    expect(clearedToken).toBeFalsy();
  });
});
