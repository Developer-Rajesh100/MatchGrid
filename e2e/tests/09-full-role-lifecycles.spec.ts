import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  ADMIN_CREDENTIALS,
  createEntityTracker,
  loginAsAdmin,
  teardownEntities,
} from '../fixtures/api';

test.describe('MatchGrid Phase 6: Role-Based Portals & End-to-End Governance Lifecycles', () => {
  test('verifies Superadmin, Organizer, Scorer and Public roles through complete UI workflows', async ({
    page,
    browser,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);

    const orgCreds = {
      username: `e2e_org_${suffix}`,
      password: `OrgPass!${suffix}1`,
      orgName: `E2E Sports Org ${suffix}`,
    };
    const scorerCreds = {
      username: `e2e_sc_${suffix}`,
      password: `ScorerPass!${suffix}1`,
    };

    const tournamentName = `E2E Premier Trophy ${suffix}`;

    // Auto-accept confirmation dialogs
    page.on('dialog', (dialog) => dialog.accept());

    try {
      // =========================================================================
      // STAGE 1: Superadmin Portal UI Workflow (/login -> /superadmin)
      // =========================================================================
      await page.goto('/login');
      await expect(page.getByTestId('portal-login-title')).toBeVisible();

      // Login as Superadmin
      await page.getByTestId('admin-username-input').fill(ADMIN_CREDENTIALS.username);
      await page.getByTestId('admin-password-input').fill(ADMIN_CREDENTIALS.password);
      await page.getByTestId('admin-login-submit').click();

      // Assert automatic redirection to /superadmin
      await expect(page).toHaveURL(/\/superadmin/);
      await expect(page.getByText('Superadmin Command Center')).toBeVisible();
      await expect(page.getByTestId('superadmin-kpis')).toBeVisible();

      // Provision new Organizer account via UI Modal
      await page.getByTestId('create-organizer-btn').click();
      await expect(page.getByTestId('create-organizer-modal')).toBeVisible();

      await page.getByTestId('org-username-input').fill(orgCreds.username);
      await page.getByTestId('org-organization-input').fill(orgCreds.orgName);
      await page.getByTestId('org-password-input').fill(orgCreds.password);
      await page.getByTestId('submit-organizer-btn').click();

      // Verify organizer appears in the directory table
      await expect(page.getByText(orgCreds.username).first()).toBeVisible({ timeout: 10000 });

      // Fetch created organizer id for tracking
      const userRes = await request.get(`${API_BASE_URL}/api/superadmin/users`, {
        headers: { Authorization: `Bearer ${superadminToken}` },
      });
      const allUsers = await userRes.json();
      const createdOrgUser = allUsers.find((u: any) => u.username === orgCreds.username);
      if (createdOrgUser) {
        tracker.userIds.push(createdOrgUser.id);
      }

      // Logout superadmin
      await page.evaluate(() => localStorage.clear());

      // =========================================================================
      // STAGE 2: Organizer Workspace UI Workflow (/login -> /organizer)
      // =========================================================================
      await page.goto('/login');
      await page.getByTestId('admin-username-input').fill(orgCreds.username);
      await page.getByTestId('admin-password-input').fill(orgCreds.password);
      await page.getByTestId('admin-login-submit').click();

      // Assert automatic redirection to /organizer
      await expect(page).toHaveURL(/\/organizer/);
      await expect(page.getByRole('heading', { name: 'Organizer Workspace' })).toBeVisible();

      // Open Tournament Creation Wizard
      const newCompBtn = page.getByTestId('create-competition-btn');
      if (await newCompBtn.isVisible()) {
        await newCompBtn.click();
      } else {
        await page.getByTestId('wizard-open-from-empty').click();
      }
      await expect(page.getByTestId('wizard-modal')).toBeVisible();

      // Wizard Step 1: Identity & Details
      await page.getByTestId('wizard-name').fill(tournamentName);
      await page.getByTestId('wizard-season').fill('2026');
      await page.getByTestId('wizard-next-btn').click();

      // Wizard Step 2: Format Rules & Finalize
      await expect(page.getByTestId('wizard-num-groups')).toBeVisible();
      await page.getByTestId('wizard-teams-per-group').fill('2');
      await page.getByTestId('wizard-submit-btn').click();

      // Verify competition created and selected
      await expect(page.getByTestId('tournament-selector')).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('tournament-selector')).toContainText(tournamentName);

      // Retrieve tournament id for tracker
      const orgTokenRes = await request.post(`${API_BASE_URL}/api/auth/login`, {
        data: { username: orgCreds.username, password: orgCreds.password },
      });
      const { access_token: orgToken } = await orgTokenRes.json();
      const myTourneysRes = await request.get(`${API_BASE_URL}/api/organizer/tournaments`, {
        headers: { Authorization: `Bearer ${orgToken}` },
      });
      const myTourneys = await myTourneysRes.json();
      const createdTourney = myTourneys.find((t: any) => t.name === tournamentName);
      if (createdTourney) {
        tracker.tournamentIds.push(createdTourney.id);
      }

      // --- Register 4 Clubs via Modal ---
      const clubs = [
        { name: `Apex Rangers ${suffix}`, color: '#10B981' },
        { name: `Titan Warriors ${suffix}`, color: '#3B82F6' },
        { name: `Solar Strike ${suffix}`, color: '#F59E0B' },
        { name: `Shadow United ${suffix}`, color: '#EF4444' },
      ];

      await page.getByTestId('tab-teams').click(); // the workspace opens on Overview
      for (const club of clubs) {
        await page.getByTestId('add-club-btn').click();
        await expect(page.getByTestId('add-club-modal')).toBeVisible();
        await page.getByTestId('club-name-input').fill(club.name);
        await page.getByTestId('club-color-input').fill(club.color);
        await page.getByTestId('club-submit-btn').click();
        await expect(page.getByText(club.name).first()).toBeVisible({ timeout: 10000 });
      }

      // --- Enroll a squad player for Apex Rangers ---
      await page.getByText(clubs[0].name).first().click();
      await page.getByTestId('add-player-btn').click();
      await expect(page.getByTestId('add-player-modal')).toBeVisible();
      await page.getByTestId('player-name-input').fill(`Leo striker ${suffix}`);
      await page.getByTestId('player-number-input').fill('10');
      await page.getByTestId('player-submit-btn').click();
      await expect(page.getByText(`Leo striker ${suffix}`).first()).toBeVisible({ timeout: 10000 });

      // --- Tab 2: Fixtures & Random Group Draw ---
      await page.getByTestId('tab-fixtures').click();
      await expect(page.getByTestId('organizer-fixtures-panel')).toBeVisible();

      // Trigger Random Draw
      await page.getByTestId('random-draw-btn').click();
      await expect(page.getByTestId('group-card-A')).toBeVisible({ timeout: 10000 });

      // Trigger Generate Group Fixtures
      await page.getByTestId('generate-fixtures-btn').click();
      await expect(page.locator('[data-testid^="match-row-"]').first()).toBeVisible({ timeout: 10000 });

      // --- Tab 3: Provision Scorer & Assign Match ---
      await page.getByTestId('tab-scorers').click();
      await expect(page.getByTestId('organizer-scorers-panel')).toBeVisible();

      // Provision Scorer
      await page.getByTestId('create-scorer-btn').click();
      await expect(page.getByTestId('provision-scorer-modal')).toBeVisible();
      await page.getByTestId('scorer-username-input').fill(scorerCreds.username);
      await page.getByTestId('scorer-password-input').fill(scorerCreds.password);
      await page.getByTestId('submit-scorer-btn').click();
      await expect(page.getByText(scorerCreds.username).first()).toBeVisible({ timeout: 10000 });

      // Assign Scorer to Match #1
      const assignBtn = page.locator('[data-testid^="assign-scorer-btn-"]').first();
      await assignBtn.click();
      await expect(page.getByTestId('assign-scorer-modal')).toBeVisible();
      await page.getByTestId('confirm-assign-btn').click();

      // Verify assigned chip
      await expect(page.getByText(scorerCreds.username).first()).toBeVisible();

      // Logout Organizer
      await page.evaluate(() => localStorage.clear());

      // =========================================================================
      // STAGE 3: Scorer Matchday Cockpit (/login -> /scorer -> Live Match Console)
      // =========================================================================
      await page.goto('/login');
      await page.getByTestId('admin-username-input').fill(scorerCreds.username);
      await page.getByTestId('admin-password-input').fill(scorerCreds.password);
      await page.getByTestId('admin-login-submit').click();

      // Assert automatic redirection to /scorer
      await expect(page).toHaveURL(/\/scorer/);
      await expect(page.getByRole('heading', { name: 'Scorer Cockpit' })).toBeVisible();
      await expect(page.getByText(scorerCreds.username).first()).toBeVisible();

      // Scorer views the assigned match and launches Live Console
      const openConsoleBtn = page.locator('[data-testid^="scorer-open-console-"]').first();
      await expect(openConsoleBtn).toBeVisible({ timeout: 10000 });
      await openConsoleBtn.click();

      // Assert Live Console loaded
      await expect(page).toHaveURL(/\/scorer\/matches\/.*\/live/);
      await expect(page.getByText(/Match Control|Live Match|Match #/i).first()).toBeVisible();

      // Kick off match
      const startMatchBtn = page.getByRole('button', { name: /Start Match|Kick Off/i });
      if (await startMatchBtn.isVisible()) {
        await startMatchBtn.click();
        await expect(page.getByText(/LIVE|1st Half/i).first()).toBeVisible({ timeout: 5000 });
      }

      // =========================================================================
      // STAGE 4: Public Spectator Hub Verification (/t/:slug)
      // =========================================================================
      const publicContext = await browser.newContext();
      const publicPage = await publicContext.newPage();

      if (createdTourney?.slug) {
        await publicPage.goto(`/t/${createdTourney.slug}`);
        await expect(publicPage.getByText(tournamentName).first()).toBeVisible({ timeout: 10000 });
      }

      await publicContext.close();
    } finally {
      // Mandatory teardown of all entities created during this run
      await teardownEntities(request, superadminToken, tracker);
    }
  });
});
