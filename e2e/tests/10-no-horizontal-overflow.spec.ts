import { test, expect, Page } from '@playwright/test';
import {
  API_BASE_URL,
  addMatchGoal,
  assignScorerToMatch,
  createEntityTracker,
  createOrganizer,
  createScorer,
  createTestMatch,
  createTestPlayer,
  createTestTeam,
  createTournament,
  loginAsAdmin,
  loginUser,
  startMatch,
  teardownEntities,
  signInBrowser,
  type BrowserSession,
} from '../fixtures/api';

/**
 * Permanent layout guard: no public view or role portal may scroll sideways at phone, tablet or
 * desktop width. Long names are used on purpose, because that is what breaks a layout in practice.
 */
const VIEWPORTS = [
  { name: '375px', width: 375, height: 812 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1440px', width: 1440, height: 900 },
];

async function overflowOf(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > root.clientWidth + 1) {
        // an element inside its own horizontal scroller (tab strip, bracket, live strip) is allowed to extend
        // fixed-position layers (the off-canvas mobile menu, toasts) never widen the page
        let p: HTMLElement | null = el;
        let scrolled = false;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          if (cs.position === 'fixed') { scrolled = true; break; }
          if (p !== el && (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden')) { scrolled = true; break; }
          p = p.parentElement;
        }
        if (!scrolled && offenders.length < 5) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}(${Math.round(r.right)})`);
      }
    });
    return { extra: root.scrollWidth - root.clientWidth, offenders };
  });
}

test.describe('No horizontal overflow on any view', () => {
  test('public pages and role portals fit 375px, 768px and 1440px', async ({ page, request }) => {
    test.setTimeout(240000);
    const tracker = createEntityTracker();
    const superToken = await loginAsAdmin(request);
    const suffix = Date.now().toString().slice(-5);
    const longName = 'Extraordinarily Long Club Name United Athletic Association';
    const orgCreds = { username: `e2e_ovf_org_${suffix}`, password: `Pass!${suffix}1` };
    const scorerCreds = { username: `e2e_ovf_sc_${suffix}`, password: `Scorer!${suffix}1` };

    try {
      const org = await createOrganizer(request, superToken, {
        username: orgCreds.username,
        password: orgCreds.password,
        organization_name: `Overflow Check Organisation With A Long Name ${suffix}`,
        email: `${orgCreds.username}@matchgrid.internal`,
      });
      tracker.userIds.push(org.id);
      const orgToken = await loginUser(request, orgCreds);

      const tournament = await createTournament(request, orgToken, {
        name: `Overflow Check Championship With A Very Long Tournament Title ${suffix}`,
        season: '2026',
        slug: `ovf-${suffix}`,
      });
      tracker.tournamentIds.push(tournament.id);

      const teamA = await createTestTeam(request, orgToken, { name: `${longName} A ${suffix}`, color: '#EF4444', tournament_id: tournament.id });
      const teamB = await createTestTeam(request, orgToken, { name: `${longName} B ${suffix}`, color: '#3B82F6', tournament_id: tournament.id });
      tracker.teamIds.push(teamA.id, teamB.id);
      for (const [team, base] of [[teamA, 'A'], [teamB, 'B']] as const) {
        for (let n = 1; n <= 4; n++) {
          const p = await createTestPlayer(request, orgToken, {
            name: `Player${base}${n} With A Rather Long Surname`,
            number: n,
            team_id: team.id,
            tournament_id: tournament.id,
          } as any);
          tracker.playerIds.push(p.id);
        }
      }

      const match = await createTestMatch(request, orgToken, {
        team1_id: teamA.id,
        team2_id: teamB.id,
        tournament_id: tournament.id,
        stage: 'extra',
        label: `Overflow Friendly ${suffix}`,
        match_number: 201,
      });
      tracker.matchIds.push(match.id);

      const scorer = await createScorer(request, orgToken, scorerCreds);
      tracker.scorerIds.push(scorer.id);
      await assignScorerToMatch(request, orgToken, match.id, scorer.id);
      const scorerToken = await loginUser(request, scorerCreds);

      // a live match with a score, so the widest states (clock, score, minute) are on screen
      await startMatch(request, orgToken, match.id);
      const players = await (await request.get(`${API_BASE_URL}/api/players?team_id=${teamA.id}&tournament_id=${tournament.id}`)).json();
      await addMatchGoal(request, orgToken, match.id, { team_id: teamA.id, player_id: players[0].id, minute: 3 } as any);

      const slug = tournament.slug;
      const publicPaths = ['/', `/t/${slug}`, `/t/${slug}/matches`, `/t/${slug}/matches/${match.id}`, `/t/${slug}/standings`, `/t/${slug}/bracket`, `/t/${slug}/teams`, `/t/${slug}/stats`, '/login'];
      const portals: Array<{ role: BrowserSession['role']; token: string; username: string; paths: string[] }> = [
        { role: 'SUPER_ADMIN', token: superToken, username: 'admin', paths: ['/superadmin'] },
        { role: 'ORGANIZER', token: orgToken, username: orgCreds.username, paths: ['/organizer'] },
        { role: 'SCORER', token: scorerToken, username: scorerCreds.username, paths: ['/scorer', `/scorer/matches/${match.id}/live`] },
      ];

      const failures: string[] = [];
      const check = async (path: string, vp: (typeof VIEWPORTS)[number], before?: () => Promise<void>) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (before) await before();
        const { extra, offenders } = await overflowOf(page);
        if (extra > 0 || offenders.length) failures.push(`${vp.name} ${path}: +${extra}px ${offenders.join(', ')}`);
      };

      // public views: no session
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      for (const vp of VIEWPORTS) for (const path of publicPaths) await check(path, vp);

      // role portals
      for (const portal of portals) {
        await signInBrowser(page, { token: portal.token, role: portal.role, username: portal.username });
        for (const vp of VIEWPORTS) {
          for (const path of portal.paths) await check(path, vp);
          if (portal.role === 'ORGANIZER') {
            // every organizer tab, not just the landing one
            for (const tab of ['teams', 'fixtures', 'scorers', 'settings']) {
              await check('/organizer', vp, async () => {
                await page.getByTestId(`tab-${tab}`).click();
                await page.waitForTimeout(250);
              });
            }
          }
        }
      }

      expect(failures, `Horizontal overflow found:\n${failures.join('\n')}`).toEqual([]);
    } finally {
      await teardownEntities(request, superToken, tracker);
    }
  });
});
