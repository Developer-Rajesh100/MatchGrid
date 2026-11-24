import { test, expect } from '@playwright/test';
import {
  API_BASE_URL,
  createCrimsonPngBuffer,
  createEntityTracker,
  createOrganizer,
  createScorer,
  createTestPlayer,
  createTestPngBuffer,
  createTestTeam,
  createTournament,
  deletePlayer,
  deleteTeam,
  deleteTestImage,
  loginAsAdmin,
  loginUser,
  teardownEntities,
  updateTestPlayer,
  updateTestTeam,
  uploadTestImage,
} from '../fixtures/api';

test.describe('MatchGrid Cloudflare R2 Media Storage & Asset Upload Pipeline', () => {
  test('verifies image upload, cross-tenant RBAC boundaries, file validation, UI rendering, and R2 automatic purging', async ({
    page,
    request,
  }) => {
    const tracker = createEntityTracker();
    const superadminToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);

    const organizerCreds = {
      username: `e2e_media_org_${suffix}`,
      password: `MediaOrg!${suffix}123`,
    };
    const otherOrganizerCreds = {
      username: `e2e_other_org_${suffix}`,
      password: `OtherOrg!${suffix}123`,
    };
    const scorerCreds = {
      username: `e2e_media_scorer_${suffix}`,
      password: `MediaScorer!${suffix}123`,
    };

    try {
      // -------------------------------------------------------------
      // Setup: Create primary Organizer, secondary Organizer, and Tournament
      // -------------------------------------------------------------
      const organizer = await createOrganizer(request, superadminToken, {
        username: organizerCreds.username,
        password: organizerCreds.password,
        organization_name: `Media Organization ${suffix}`,
        email: `${organizerCreds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(organizer.id);

      const otherOrganizer = await createOrganizer(request, superadminToken, {
        username: otherOrganizerCreds.username,
        password: otherOrganizerCreds.password,
        organization_name: `Other Media Organization ${suffix}`,
        email: `${otherOrganizerCreds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(otherOrganizer.id);

      const organizerToken = await loginUser(request, organizerCreds);
      const otherOrganizerToken = await loginUser(request, otherOrganizerCreds);

      const tournament = await createTournament(request, organizerToken, {
        name: `Media Cup ${suffix}`,
        season: '2026',
        slug: `media-cup-${suffix}`,
        format_description: 'E2E Cloudflare R2 Media Pipeline Tournament',
      });
      tracker.tournamentIds.push(tournament.id);

      const scorer = await createScorer(request, organizerToken, scorerCreds);
      tracker.scorerIds.push(scorer.id);
      const scorerToken = await loginUser(request, scorerCreds);

      // =============================================================
      // 1. Organizer uploads valid PNG team crest & player headshot
      // =============================================================
      const crestBuffer = createTestPngBuffer();
      const crestUploadRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: crestBuffer,
        filename: `crest_${suffix}.png`,
        contentType: 'image/png',
      });
      expect(crestUploadRes.status()).toBe(201);
      const crestData = await crestUploadRes.json();
      tracker.assetUrlsOrKeys.push(crestData.url);

      expect(crestData.tournament_id).toBe(tournament.id);
      expect(crestData.category).toBe('crests');
      expect(crestData.content_type).toBe('image/png');
      expect(crestData.key).toContain(`tournaments/${tournament.id}/crests/`);
      expect(crestData.url).toContain(`tournaments/${tournament.id}/crests/`);
      expect(crestData.width).toBe(64);
      expect(crestData.height).toBe(64);

      // Verify the uploaded public URL returns 200 OK
      const publicCrestRes = await request.get(crestData.url);
      expect(publicCrestRes.status()).toBe(200);
      expect(publicCrestRes.headers()['content-type']).toContain('image/png');

      // Upload player headshot (category="photos")
      const headshotBuffer = createTestPngBuffer();
      const headshotUploadRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'photos',
        buffer: headshotBuffer,
        filename: `headshot_${suffix}.png`,
        contentType: 'image/png',
      });
      expect(headshotUploadRes.status()).toBe(201);
      const headshotData = await headshotUploadRes.json();
      tracker.assetUrlsOrKeys.push(headshotData.url);

      expect(headshotData.tournament_id).toBe(tournament.id);
      expect(headshotData.category).toBe('photos');
      expect(headshotData.content_type).toBe('image/png');
      expect(headshotData.key).toContain(`tournaments/${tournament.id}/photos/`);
      expect(headshotData.url).toContain(`tournaments/${tournament.id}/photos/`);

      const publicHeadshotRes = await request.get(headshotData.url);
      expect(publicHeadshotRes.status()).toBe(200);

      // =============================================================
      // 2. Cross-tenant & role boundary checks (403 Forbidden)
      // =============================================================
      // 2a. Second Organizer attempting to upload to a tournament they do not own
      const otherOrgUploadRes = await uploadTestImage(request, otherOrganizerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: crestBuffer,
      });
      expect(otherOrgUploadRes.status()).toBe(403);
      const otherOrgUploadJson = await otherOrgUploadRes.json();
      expect(otherOrgUploadJson.detail).toContain('You do not own this tournament');

      // 2b. Second Organizer attempting to delete an image from an unowned tournament
      const otherOrgDeleteRes = await deleteTestImage(request, otherOrganizerToken, crestData.url);
      expect(otherOrgDeleteRes.status()).toBe(403);
      const otherOrgDeleteJson = await otherOrgDeleteRes.json();
      expect(otherOrgDeleteJson.detail).toContain('You do not own this tournament');

      // 2c. Scorer attempting to upload an image receives 403 Forbidden
      const scorerUploadRes = await uploadTestImage(request, scorerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: crestBuffer,
      });
      expect(scorerUploadRes.status()).toBe(403);
      const scorerUploadJson = await scorerUploadRes.json();
      expect(scorerUploadJson.detail).toContain('Admin access required');

      // 2d. Scorer attempting to delete an image receives 403 Forbidden
      const scorerDeleteRes = await deleteTestImage(request, scorerToken, crestData.url);
      expect(scorerDeleteRes.status()).toBe(403);
      const scorerDeleteJson = await scorerDeleteRes.json();
      expect(scorerDeleteJson.detail).toContain('Admin access required');

      // =============================================================
      // 3. Invalid/oversized file rejection (422 / 413)
      // =============================================================
      // 3a. Spoofed non-image payload (HTML / text disguised as PNG)
      const spoofedPayload = Buffer.from('<script>alert("xss")</script>', 'utf-8');
      const spoofedUploadRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: spoofedPayload,
        filename: 'malicious.png',
        contentType: 'image/png',
      });
      expect(spoofedUploadRes.status()).toBe(422);
      const spoofedUploadJson = await spoofedUploadRes.json();
      expect(spoofedUploadJson.detail).toContain('Uploaded file is not a valid image or is corrupted');

      // 3b. Invalid category returns 422
      const invalidCatRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'unsupported_category',
        buffer: crestBuffer,
      });
      expect(invalidCatRes.status()).toBe(422);

      // 3c. Oversized file (> 5 MB) returns 413 Payload Too Large
      const oversizedPayload = Buffer.alloc(5.2 * 1024 * 1024, 0);
      const oversizedUploadRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: oversizedPayload,
        filename: 'huge.png',
        contentType: 'image/png',
      });
      expect(oversizedUploadRes.status()).toBe(413);
      const oversizedUploadJson = await oversizedUploadRes.json();
      expect(oversizedUploadJson.detail).toContain('exceeds maximum permitted size of 5 MB');

      // =============================================================
      // 4. Frontend rendering & automatic R2 purging on replace/delete
      // =============================================================
      // Create test team with the uploaded crest URL
      const team = await createTestTeam(request, organizerToken, {
        name: `Media Lions ${suffix}`,
        color: '#10B981',
        tournament_id: tournament.id,
        crest_url: crestData.url,
      });
      tracker.teamIds.push(team.id);
      expect(team.crest_url).toBe(crestData.url);

      // Create test player with the uploaded headshot URL
      const player = await createTestPlayer(request, organizerToken, {
        team_id: team.id,
        name: `Star Player ${suffix}`,
        number: 10,
        photo_url: headshotData.url,
      });
      tracker.playerIds.push(player.id);
      expect(player.photo_url).toBe(headshotData.url);

      // Set admin token in browser localStorage and navigate to team detail page
      await page.goto('/');
      await page.evaluate((token) => {
        localStorage.setItem('matchgrid_admin_token', token);
        localStorage.setItem('dcl_admin_token', token);
      }, organizerToken);

      // Verify Team Detail page renders the team crest cleanly
      await page.goto(`/teams/${team.id}`);
      const crestImageLocator = page.locator(`img[src="${crestData.url}"]`);
      await expect(crestImageLocator).toBeVisible({ timeout: 8000 });
      await expect(page.locator(`text=${team.name}`).first()).toBeVisible();

      // Verify Player Detail page renders player headshot cleanly
      await page.goto(`/players/${player.id}`);
      const headshotImageLocator = page.locator(`img[src="${headshotData.url}"]`);
      await expect(headshotImageLocator).toBeVisible({ timeout: 8000 });
      await expect(page.locator(`text=${player.name}`).first()).toBeVisible();

      // 4a. Automatic R2 Purging on Crest Replacement:
      // Upload replacement crest (Crimson PNG)
      const replacementCrestRes = await uploadTestImage(request, organizerToken, {
        tournament_id: tournament.id,
        category: 'crests',
        buffer: createCrimsonPngBuffer(),
        filename: `replacement_crest_${suffix}.png`,
        contentType: 'image/png',
      });
      expect(replacementCrestRes.status()).toBe(201);
      const replacementCrestData = await replacementCrestRes.json();
      tracker.assetUrlsOrKeys.push(replacementCrestData.url);

      // Replace crest on team
      const updatedTeam = await updateTestTeam(request, organizerToken, team.id, {
        crest_url: replacementCrestData.url,
      });
      expect(updatedTeam.crest_url).toBe(replacementCrestData.url);

      // Verify the old crest URL was automatically purged from R2 (returns 404)
      const oldCrestCheck = await request.get(crestData.url);
      expect(oldCrestCheck.status()).toBe(404);

      // Verify new crest URL returns 200 OK and renders in UI
      const newCrestCheck = await request.get(replacementCrestData.url);
      expect(newCrestCheck.status()).toBe(200);

      await page.goto(`/teams/${team.id}`);
      const updatedCrestLocator = page.locator(`img[src="${replacementCrestData.url}"]`);
      await expect(updatedCrestLocator).toBeVisible({ timeout: 8000 });

      // 4b. Automatic R2 Purging on Player Deletion:
      await deletePlayer(request, organizerToken, player.id);
      tracker.playerIds = tracker.playerIds.filter((id) => id !== player.id);

      // Verify the player's photo was purged from R2 (returns 404)
      const purgedPhotoCheck = await request.get(headshotData.url);
      expect(purgedPhotoCheck.status()).toBe(404);

      // 4c. Automatic R2 Purging on Team Deletion:
      await deleteTeam(request, organizerToken, team.id);
      tracker.teamIds = tracker.teamIds.filter((id) => id !== team.id);

      // Verify the team's replacement crest was purged from R2 (returns 404)
      const purgedTeamCrestCheck = await request.get(replacementCrestData.url);
      expect(purgedTeamCrestCheck.status()).toBe(404);
    } finally {
      // =============================================================
      // 5. Mandatory teardown in finally removes all test entities
      // =============================================================
      await teardownEntities(request, superadminToken, tracker);

      // Confirm /health/db returns connected and clean collections
      const healthDbRes = await request.get(`${API_BASE_URL}/health/db`);
      expect(healthDbRes.ok()).toBeTruthy();
      const healthDb = await healthDbRes.json();
      expect(healthDb.status).toBe('connected');
      expect(healthDb.collections.teams).toBe(0);
      expect(healthDb.collections.players).toBe(0);
      expect(healthDb.collections.matches).toBe(0);
    }
  });
});
