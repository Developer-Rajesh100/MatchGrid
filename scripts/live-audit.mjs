// Live production audit: every role and the main flows against a deployed stack (~57 checks):
// superadmin governance, organizer setup with R2 media, tenant isolation, private drafts, the
// scorer's clock and events, live sync to a spectator socket, standings and leaderboards.
//
//   bun scripts/live-audit.mjs https://matchgrid-api.onrender.com https://matchgrid.<account>.workers.dev
//
// Credentials come from ~/.matchgrid-smoke.env (SMOKE_ADMIN_USER, SMOKE_ADMIN_PASSWORD; override
// the path with SMOKE_ENV_FILE) and are never printed. Every entity is named [E2E-AUDIT] /
// e2e_audit_ and removed in `finally`; the run fails unless the superadmin's per-collection counts
// afterwards equal the baseline taken before anything was created. Exit code 0 = passed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { deflateSync } from 'node:zlib';

const [API, WEB] = process.argv.slice(2).map((u) => u.replace(/\/+$/, ''));
const env = Object.fromEntries(
  readFileSync(process.env.SMOKE_ENV_FILE || `${homedir()}/.matchgrid-smoke.env`, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);
const ADMIN = { username: env.SMOKE_ADMIN_USER, password: env.SMOKE_ADMIN_PASSWORD };
if (!ADMIN.username || !ADMIN.password) throw new Error('SMOKE_ADMIN_USER / SMOKE_ADMIN_PASSWORD missing');

let failed = 0;
const results = [];
const check = (cond, name, detail = '') => {
  results.push(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  console.log(results.at(-1));
  if (!cond) failed += 1;
};
async function api(method, path, { token, body, form, origin = WEB } = {}) {
  const headers = { Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  let json = null;
  try { json = await res.json(); } catch { /* 204 */ }
  return { status: res.status, json };
}
const login = async (c) => (await api('POST', '/api/auth/login', { body: c })).json?.access_token;
// A solid-colour 64x64 RGB PNG (the API rejects images under 16x16).
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
async function png({ r, g, b }, size = 64) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tag = `${Date.now().toString(36)}`;
const P = '[E2E-AUDIT]';
const orgA = { username: `e2e_audit_org_${tag}`, password: `E2e-Audit-${tag}-OrgA!` };
const orgB = { username: `e2e_audit_orgb_${tag}`, password: `E2e-Audit-${tag}-OrgB!` };
const scorerC = { username: `e2e_audit_scr_${tag}`, password: `E2e-Audit-${tag}-Scr!` };
const created = { users: [], tournaments: [], images: [] };
let adminToken; let orgAToken; let socket; let baseline;

try {
  adminToken = await login(ADMIN);
  check(!!adminToken, 'superadmin signs in');
  if (!adminToken) throw new Error('superadmin sign-in failed: check ~/.matchgrid-smoke.env (nothing was created)');
  baseline = (await api('GET', '/api/superadmin/db-stats', { token: adminToken })).json?.collections;
  check(!!baseline, 'superadmin reads db-stats (baseline taken)');
  check((await api('GET', '/api/superadmin/stats', { token: adminToken })).status === 200, 'superadmin platform metrics');
  check((await api('GET', '/api/superadmin/users')).status === 401, 'superadmin API refuses anonymous (401)');

  // --- Superadmin governance: organizers
  for (const o of [orgA, orgB]) {
    const r = await api('POST', '/api/superadmin/organizers', { token: adminToken, body: { ...o, organization_name: `${P} Org ${tag}` } });
    check(r.status === 201, `superadmin creates organizer ${o.username}`, r.status);
    if (r.json?.id) created.users.push(r.json.id);
  }
  const [orgAId, orgBId] = created.users;
  let r = await api('PATCH', `/api/superadmin/users/${orgBId}/status`, { token: adminToken, body: { is_active: false } });
  check(r.status === 200 && r.json?.is_active === false, 'superadmin deactivates an organizer');
  check(!(await login(orgB)), 'a deactivated organizer cannot sign in');
  r = await api('PATCH', `/api/superadmin/users/${orgBId}/status`, { token: adminToken, body: { is_active: true } });
  check(r.json?.is_active === true, 'superadmin reactivates the organizer');

  orgAToken = await login(orgA);
  const orgBToken = await login(orgB);
  check(!!orgAToken && !!orgBToken, 'both organizers sign in');
  check((await api('GET', '/api/superadmin/stats', { token: orgAToken })).status === 403, 'organizer is refused the superadmin API (403)');

  // --- Organizer: tournament wizard as a private draft
  const slug = `e2e-audit-${tag}`;
  r = await api('POST', '/api/organizer/tournaments', { token: orgAToken, body: {
    name: `${P} Cup ${tag}`, season: '2026', slug,
    config: { num_groups: 1, teams_per_group: 2, qualifiers_per_group: 1, knockout_format: 'none', points_win: 3, points_draw: 1, points_loss: 0, half_duration_minutes: 20 },
  } });
  check(r.status === 201, 'organizer creates a tournament', r.status);
  const tid = r.json?.id; if (tid) created.tournaments.push({ id: tid, token: orgAToken });
  r = await api('PATCH', `/api/organizer/tournaments/${tid}/config`, { token: orgAToken, body: { qualifiers_per_group: 5 } });
  check(r.status === 422, 'an infeasible config is a 422, not a 500', r.status);
  await api('PATCH', `/api/organizer/tournaments/${tid}`, { token: orgAToken, body: { status: 'draft' } });
  const pub = await api('GET', '/api/tournaments/public');
  check(pub.status === 200 && !pub.json.some((t) => t.id === tid), 'a draft is not in the public directory');
  check((await api('GET', `/api/tournaments/slug/${slug}`)).status === 404, 'a draft is 404 to the public');
  check((await api('GET', `/api/tournaments/slug/${slug}`, { token: orgAToken })).status === 200, 'its organizer can read the draft');
  check((await api('GET', `/api/tournaments/slug/${slug}`, { token: orgBToken })).status === 404, 'another organizer cannot read the draft');

  // --- Tenant isolation
  check((await api('PATCH', `/api/organizer/tournaments/${tid}`, { token: orgBToken, body: { name: 'hijack' } })).status === 403, "another organizer cannot edit the tournament (403)");
  check((await api('POST', '/api/teams', { token: orgBToken, body: { name: `${P} X`, color: '#000000', tournament_id: tid } })).status === 403, "another organizer cannot add teams (403)");

  // --- Teams with R2 crests (upload, replace, delete)
  const upload = async (rgb, category = 'crests') => {
    const form = new FormData();
    form.set('file', new Blob([await png(rgb)], { type: 'image/png' }), 'crest.png');
    form.set('tournament_id', tid); form.set('category', category);
    const u = await api('POST', '/api/uploads/image', { token: orgAToken, form });
    if (u.json?.url) created.images.push(u.json.url);
    return u;
  };
  const up1 = await upload({ r: 16, g: 185, b: 129 });
  check(up1.status === 201, 'organizer uploads a crest to R2', up1.status);
  const img = await fetch(up1.json.url);
  check(img.status === 200 && (img.headers.get('content-type') || '').includes('image/png'), 'the R2 crest is publicly readable', img.status);
  check((await (async () => { const f = new FormData(); f.set('file', new Blob([await png({ r: 1, g: 1, b: 1 })], { type: 'image/png' }), 'x.png'); f.set('tournament_id', tid); f.set('category', 'crests'); return api('POST', '/api/uploads/image', { token: orgBToken, form: f }); })()).status === 403, "another organizer cannot upload into this tournament (403)");
  const teamA = (await api('POST', '/api/teams', { token: orgAToken, body: { name: `${P} Emerald ${tag}`, color: '#10B981', tournament_id: tid, crest_url: up1.json.url } })).json;
  const teamB = (await api('POST', '/api/teams', { token: orgAToken, body: { name: `${P} Crimson ${tag}`, color: '#EF4444', tournament_id: tid } })).json;
  check(!!teamA?.id && !!teamB?.id && teamA.crest_url === up1.json.url, 'organizer creates two teams (one with the crest)');
  const up2 = await upload({ r: 245, g: 158, b: 11 });
  r = await api('PATCH', `/api/teams/${teamA.id}`, { token: orgAToken, body: { crest_url: up2.json.url } });
  check(r.status === 200, 'organizer replaces the crest');
  await sleep(1500);
  const old = await fetch(up1.json.url);
  check(old.status === 404, 'the replaced crest is deleted from R2', old.status);
  const strikerA = (await api('POST', '/api/players', { token: orgAToken, body: { team_id: teamA.id, name: `${P} Striker`, number: 9 } })).json;
  const playmakerA = (await api('POST', '/api/players', { token: orgAToken, body: { team_id: teamA.id, name: `${P} Playmaker`, number: 10 } })).json;
  const keeperB = (await api('POST', '/api/players', { token: orgAToken, body: { team_id: teamB.id, name: `${P} Keeper`, number: 1 } })).json;
  check(!!strikerA?.id && !!playmakerA?.id && !!keeperB?.id, 'organizer adds players to both squads');

  // --- Draw, fixtures, scorer
  r = await api('POST', `/api/groups/random-draw?tournament_id=${tid}`, { token: orgAToken });
  check(r.status === 200, 'random group draw', r.status);
  const groupId = r.json?.[0]?.id;
  r = await api('POST', '/api/matches/generate-group-fixtures', { token: orgAToken, body: { group_id: groupId } });
  check(r.status === 200 && r.json.length === 1, 'round-robin fixture generated', r.status);
  const match = r.json[0];
  const extra = (await api('POST', '/api/matches', { token: orgAToken, body: { tournament_id: tid, team1_id: teamA.id, team2_id: teamB.id, date: '2026-12-31', time: '18:00' } })).json;
  r = await api('POST', '/api/organizer/scorers', { token: orgAToken, body: scorerC });
  check(r.status === 201, 'organizer creates a scorer');
  const scorerId = r.json?.id; if (scorerId) created.users.push(scorerId);
  check((await api('POST', `/api/organizer/matches/${match.id}/scorers`, { token: orgBToken, body: { scorer_id: scorerId } })).status === 403, "another organizer cannot assign this match (403)");
  r = await api('POST', `/api/organizer/matches/${match.id}/scorers`, { token: orgAToken, body: { scorer_id: scorerId } });
  check(r.status === 200 && r.json.assigned_scorer_ids.includes(scorerId), 'organizer assigns the scorer to one match');
  const scorerToken = await login(scorerC);
  const mine = (await api('GET', '/api/scorer/matches', { token: scorerToken })).json || [];
  check(mine.length === 1 && mine[0].id === match.id, 'scorer sees exactly the assigned match');
  check((await api('GET', `/api/tournaments/slug/${slug}`, { token: scorerToken })).status === 200, 'the assigned scorer can read the draft');
  check((await api('POST', `/api/matches/${extra.id}/start`, { token: scorerToken })).status === 403, 'unassigned match is locked for the scorer (403)');

  // --- Publish, then live scoring with a spectator socket
  await api('PATCH', `/api/organizer/tournaments/${tid}`, { token: orgAToken, body: { status: 'active' } });
  check((await api('GET', `/api/tournaments/slug/${slug}`)).status === 200, 'published tournament is public');
  const frames = [];
  socket = new WebSocket(`${API.replace(/^http/, 'ws')}/ws/live?tournament_id=${tid}`, { headers: { Origin: WEB } });
  await new Promise((ok, bad) => { socket.onopen = ok; socket.onerror = bad; setTimeout(() => bad(new Error('socket timeout')), 20000); });
  socket.onmessage = (e) => { try { frames.push(JSON.parse(e.data)); } catch { /* pong */ } };
  const lineup = await api('PUT', `/api/matches/${match.id}/lineup`, { token: scorerToken, body: { player_ids: [strikerA.id, playmakerA.id, keeperB.id] } });
  check(lineup.status === 200 && lineup.json.length === 3, 'scorer sets the lineup');
  const clock = async (action) => (await api('POST', `/api/matches/${match.id}/${action}`, { token: scorerToken })).json;
  let m = await clock('start'); check(m?.status === 'live', 'scorer starts the match');
  await sleep(2500);
  m = await clock('half-time'); const frozen = m?.elapsed_seconds;
  check(m?.is_half_time === true && frozen >= 2, 'half-time freezes the clock', frozen);
  await sleep(2000);
  m = await clock('half-time'); check(m?.elapsed_seconds === frozen, 'a repeated half-time keeps the frozen clock', m?.elapsed_seconds);
  m = await clock('resume'); const anchor = m?.started_at;
  check(m?.is_half_time === false, 'scorer resumes');
  await sleep(1000);
  m = await clock('resume'); check(m?.started_at === anchor, 'a repeated resume does not rewind the clock');
  m = await clock('reset-timer'); check(m?.elapsed_seconds === 0, 'scorer resets the timer');
  r = await api('POST', `/api/matches/${match.id}/events`, { token: scorerToken, body: { type: 'goal', team_id: teamA.id, player_id: strikerA.id, assist_player_id: playmakerA.id, minute: 7 } });
  check(r.status === 201, 'scorer logs a goal with an assist');
  await sleep(1500);
  check(frames.some((f) => f.type === 'match_event_added' && f.match_id === match.id), 'the spectator socket receives the goal', frames.map((f) => f.type).join(','));
  check((await api('POST', `/api/matches/${match.id}/events`, { token: scorerToken, body: { type: 'yellow', team_id: teamB.id, player_id: keeperB.id, minute: 9 } })).status === 201, 'scorer logs a yellow card');
  const wrong = (await api('POST', `/api/matches/${match.id}/events`, { token: scorerToken, body: { type: 'red', team_id: teamB.id, player_id: keeperB.id, minute: 10 } })).json;
  check((await api('DELETE', `/api/matches/${match.id}/events/${wrong.id}`, { token: scorerToken })).status === 204, 'scorer deletes a mis-logged red card');
  check((await api('POST', `/api/matches/${match.id}/events`, { token: scorerToken, body: { type: 'potm', team_id: teamA.id, player_id: strikerA.id } })).status === 201, 'scorer names the player of the match');
  m = await clock('end'); check(m?.status === 'full_time' && m.score1 === 1 && m.score2 === 0, 'scorer ends the match 1-0', `${m?.score1}-${m?.score2}`);
  check((await api('POST', `/api/matches/${match.id}/reopen`, { token: scorerToken })).status === 403, 'a scorer cannot reopen (owner only)');
  m = (await api('POST', `/api/matches/${match.id}/reopen`, { token: orgAToken })).json;
  check(m?.status === 'live', 'organizer reopens the match');
  m = await clock('end'); check(m?.status === 'full_time', 'match ended again');
  const st = (await api('GET', `/api/standings?tournament_id=${tid}`)).json?.[0]?.standings || [];
  check(st[0]?.team_id === teamA.id && st[0]?.points === 3, 'standings: winner on 3 points');
  const lb = (await api('GET', `/api/statistics/leaderboards?tournament_id=${tid}`)).json;
  check(lb?.top_scorers?.[0]?.player_id === strikerA.id && lb?.top_assists?.[0]?.player_id === playmakerA.id && lb?.top_potm?.[0]?.value === 1, 'leaderboards: scorer, assist, POTM');
  const t = (await api('GET', `/api/tournaments/slug/${slug}`)).json;
  check(t?.stage === 'champions' && t?.status === 'completed', 'single-table league crowns a champion', `${t?.stage}/${t?.status}`);
} catch (err) {
  check(false, 'unexpected error', err?.message || String(err));
} finally {
  try { socket?.close(); } catch { /* ignore */ }
  for (const url of created.images) await api('DELETE', '/api/uploads/image', { token: orgAToken || adminToken, body: { url_or_key: url } });
  for (const t of created.tournaments) await api('DELETE', `/api/superadmin/tournaments/${t.id}`, { token: adminToken });
  for (const id of created.users.slice().reverse()) await api('DELETE', `/api/superadmin/users/${id}`, { token: adminToken });
  if (adminToken) {
    const after = (await api('GET', '/api/superadmin/db-stats', { token: adminToken })).json?.collections || {};
    const leftovers = (await api('GET', '/api/superadmin/users', { token: adminToken })).json?.filter((u) => u.username.startsWith('e2e_audit_')) || [];
    console.log('  cleanup: removed', created.tournaments.length, 'tournament(s),', created.users.length, 'user(s),', created.images.length, 'image(s)');
    check(leftovers.length === 0, 'no e2e_audit_ accounts left');
    const changed = Object.keys({ ...baseline, ...after }).filter((k) => (baseline?.[k] ?? 0) !== (after[k] ?? 0));
    check(changed.length === 0, 'database counts are back to the baseline', changed.map((k) => `${k}: ${baseline?.[k]} -> ${after[k]}`).join(', '));
  }
  console.log(failed ? `\nLIVE AUDIT FAILED (${failed})` : '\nLIVE AUDIT PASSED');
  process.exit(failed ? 1 : 0);
}
