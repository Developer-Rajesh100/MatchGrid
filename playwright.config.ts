import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the browser at an already running frontend (and skips starting local
// servers); set API_BASE_URL alongside it for the API fixtures. Default: local dev servers.
const externalBaseUrl = process.env.E2E_BASE_URL;

/**
 * Playwright E2E configuration for MatchGrid Bun monorepo.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 6000,
  },
  /* Run tests serially to prevent shared database collisions during live matches */
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: externalBaseUrl || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Automatically ensure backend and frontend servers are reachable */
  webServer: externalBaseUrl ? undefined : [
    {
      command: 'cd apps/backend && ./.venv/bin/uvicorn app.main:app --port 8001',
      url: 'http://localhost:8001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
    {
      command: 'bun --filter frontend dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30 * 1000,
    },
  ],
});
