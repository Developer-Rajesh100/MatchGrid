#!/usr/bin/env bun
// Live-stack smoke checks that need a WebSocket and real data: called by scripts/smoke.sh.
//
//   bun scripts/smoke-live.mjs <API_URL> <WEB_URL> [--full]
//
// Always: the live socket answers ping, accepts the real frontend origin and (in production) refuses a
// foreign one. With --full it also provisions a throwaway organizer + tournament + match, plays a goal and
// waits for it to arrive on a spectator socket, uploads an image to R2 and loads it back, then deletes
// everything it created. Needs SMOKE_ADMIN_USER / SMOKE_ADMIN_PASSWORD for --full.
import { VALID_PNG_BASE64 } from '../e2e/fixtures/api.ts';

const [apiArg, webArg, ...flags] = process.argv.slice(2);
if (!apiArg || !webArg) {
  console.error('usage: bun scripts/smoke-live.mjs <API_URL> <WEB_URL> [--full]');
  process.exit(2);
}
const API = apiArg.replace(/\/+$/, '');
const WEB_ORIGIN = new URL(webArg).origin;
const WS = API.replace(/^http/i, 'ws');
const FULL = flags.includes('--full');

let failed = 0;
const ok = (name, detail = '') => console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
const bad = (name, detail = '') => { failed += 1; console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`); };
const check = (cond, name, detail) => (cond ? ok(name, detail) : bad(name, detail));

function open(path, origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}${path}`, origin ? { headers: { Origin: origin } } : undefined);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 15000); // covers a cold start
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('refused')); };
    ws.onclose = (e) => { clearTimeout(timer); reject(new Error(`closed ${e.code}`)); };
  });
}
const next = (ws, ms = 6000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no message')), ms);
  ws.onmessage = (e) => { clearTimeout(timer); resolve(String(e.data)); };
});

async function api(method, path, { token, body, form } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, text };
}

console.log('Live socket');
try {
  const ws = await open('/ws/live', WEB_ORIGIN);
  ws.send('ping');
  check((await next(ws)) === 'pong', 'ping is answered with pong from the frontend origin');
  ws.close();
} catch (e) { bad('socket accepts the frontend origin', e.message); }

try {
  await open('/ws/live', 'https://evil.example.invalid');
  bad('a foreign origin is refused (expected in production; fine to ignore on a non-production API)');
} catch { ok('a foreign origin is refused'); }

if (FULL) {
  console.log('Live sync + media (temporary data, removed afterwards)');
  const adminUser = process.env.SMOKE_ADMIN_USER;
  const adminPass = process.env.SMOKE_ADMIN_PASSWORD;
  if (!adminUser || !adminPass) { console.error('  --full needs SMOKE_ADMIN_USER and SMOKE_ADMIN_PASSWORD'); process.exit(2); }
  const tag = `smoke${Date.now().toString().slice(-6)}`;
  const orgCreds = { username: `${tag}_org`, password: `Smoke-${tag}-Pw!` };
  let adminToken; let orgId; let orgToken; let tournamentId; let imageUrl; let socket;
  try {
    adminToken = (await api('POST', '/api/auth/login', { body: { username: adminUser, password: adminPass } })).json?.access_token;
    check(!!adminToken, 'superadmin login');
    const org = await api('POST', '/api/superadmin/organizers', { token: adminToken, body: { ...orgCreds, organization_name: `Smoke ${tag}`, email: `${tag}@example.com` } });
    orgId = org.json?.id;
    orgToken = (await api('POST', '/api/auth/login', { body: orgCreds })).json?.access_token;
    check(!!orgId && !!orgToken, 'temporary organizer created and signed in');

    const t = await api('POST', '/api/organizer/tournaments', { token: orgToken, body: { name: `Smoke ${tag}`, season: '1', slug: `smoke-${tag}` } });
    tournamentId = t.json?.id;
    const mk = (n, c) => api('POST', '/api/teams', { token: orgToken, body: { name: `${n} ${tag}`, color: c, tournament_id: tournamentId } }).then((r) => r.json);
    const [teamA, teamB] = [await mk('Alpha', '#EF4444'), await mk('Beta', '#3B82F6')];
    const player = (await api('POST', '/api/players', { token: orgToken, body: { team_id: teamA.id, tournament_id: tournamentId, name: 'Smoke Striker', number: 9, dcl_id: `S-${tag}` } })).json;
    const match = (await api('POST', '/api/matches', { token: orgToken, body: { tournament_id: tournamentId, stage: 'extra', team1_id: teamA.id, team2_id: teamB.id, match_number: 1, label: 'Smoke', venue: 'Pitch', date: new Date().toISOString().slice(0, 10) } })).json;
    check(!!match?.id, 'tournament, teams, player and match created');
    check((await api('POST', `/api/matches/${match.id}/start`, { token: orgToken })).status === 200, 'match started');

    socket = await open(`/ws/live?tournament_id=${tournamentId}`, WEB_ORIGIN);
    const heard = next(socket, 8000);
    const started = Date.now();
    const goal = await api('POST', `/api/matches/${match.id}/events`, { token: orgToken, body: { type: 'goal', team_id: teamA.id, player_id: player.id, minute: 3 } });
    check(goal.status === 201, 'goal logged');
    let msg = null;
    try { msg = JSON.parse(await heard); } catch { /* no message */ }
    check(!!msg && (!msg.match_id || msg.match_id === match.id), 'spectator socket received the goal', msg ? `${Date.now() - started} ms, ${msg.type}` : 'nothing arrived');
    const live = await api('GET', `/api/matches/${match.id}`);
    check(live.json?.score1 === 1, 'public API shows the new score 1-0');

    const form = new FormData();
    form.set('tournament_id', tournamentId);
    form.set('category', 'crests');
    form.set('file', new Blob([Buffer.from(VALID_PNG_BASE64, 'base64')], { type: 'image/png' }), 'smoke.png');
    const up = await api('POST', '/api/uploads/image', { token: orgToken, form });
    imageUrl = up.json?.url;
    check(up.status === 201 || up.status === 200, 'R2 upload accepted', `HTTP ${up.status}`);
    if (imageUrl) {
      const img = await fetch(imageUrl);
      check(img.ok && (img.headers.get('content-type') || '').startsWith('image/'), 'uploaded image loads from its public URL', `HTTP ${img.status}`);
    }
  } catch (e) {
    bad('full smoke run', e.message);
  } finally {
    try { socket?.close(); } catch { /* ignore */ }
    if (imageUrl) await api('DELETE', '/api/uploads/image', { token: orgToken, body: { url_or_key: imageUrl } });
    if (tournamentId) await api('DELETE', `/api/organizer/tournaments/${tournamentId}`, { token: orgToken });
    if (orgId) await api('DELETE', `/api/superadmin/users/${orgId}`, { token: adminToken });
    console.log('  cleaned up the temporary organizer, tournament and image');
  }
}

console.log(failed ? `\n${failed} live check(s) failed` : '\nlive checks passed');
process.exit(failed ? 1 : 0);
