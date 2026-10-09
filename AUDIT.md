# DCL Season 5 Scoreboard — Test & Production-Readiness Audit

## Final audit of 2026-10-10, second pass (current)

**Scope:** the whole project including the newest features: delete for every match (including live/completed), Create/Edit/Delete Match, team assignment, the reset script, and the production startup seed.
**Ground rules followed:** all match/live testing used disposable data (a throwaway Mongo container and separate databases). Real matches were never started, completed or modified. The dev database and production were only *read*.

### Results

| Area | What was run | Result |
|---|---|---|
| Backend automated | `pytest` (isolated test DB, includes live/scoring workflows) | **246 passed** |
| Frontend automated | `vitest` and `vite build` | **34 passed**, build OK |
| Static analysis | `ruff` (F, E9) on app and tests, unreferenced-function scan (backend and frontend API wrappers), `.do/app.yaml` parse | clean, no dead code |
| Dependencies / secrets | `pip-audit`, `npm audit --omit=dev`, tracked-secret scan | **0 vulnerabilities**, no secrets |
| API checks (fresh DB) | 51 checks: seed accuracy (9 matches on 2026-10-10, all upcoming), every public GET, 401 on every mutating route, create/duplicate/clash validation, edits, team assignment, delete, headers, load | **51 / 51 pass** |
| API fuzzing | 45 malformed or illegal inputs and state changes | **no 5xx** |
| Full live tournament | start, goals, assists, cards, half-time, end, standings, semi-finals, final, champion, event deletion and reopen | standings match an independent recomputation, tournament reaches `champions` |
| Load | 150 requests at concurrency 30 on 5 public endpoints | 0 errors, p95 106–167 ms |
| Browser: pages | 14 routes (public, admin, live console, login, unknown URL, unknown match id) at 375 / 768 / 1280 px = **42 combinations** | **0 overflow, 0 JS errors, no `undefined`/`NaN`**; unknown URLs redirect home |
| Browser: live match through the Live Control UI | Start, Goal (player, minute), Half Time, Resume, End Match | all work; public API shows the live score; standings and top scorer update on the end |
| Browser: admin workflows | schedule edit, semi-final assignment, create/edit/delete match, Delete button on every row | pass |
| WebSocket | ping/pong and event broadcast | working (5 messages received during the admin pass) |

### Bugs and risks found, and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High (regression from the previous audit)** | The proxy-aware login throttling I added trusted `X-Forwarded-For` from anyone (`--forwarded-allow-ips "*"`). Because uvicorn then takes a client-controlled leftmost entry, an attacker rotating a fake header got **12 wrong-password attempts in a row with no throttling**, bypassing brute-force protection. Confirmed by test. | uvicorn no longer trusts the header. The app takes the entry appended by its own proxy (the rightmost; `TRUSTED_PROXY_HOPS`, default 1, `0` if there is no proxy). Verified: a spoofed rotating header is now throttled (429 after 6 attempts), and different real clients are throttled separately. 2 regression tests added. |
| 2 | Low | Duplicate "next match number" logic in `create_extra_match` | now uses the shared `_next_match_number` helper |
| 3 | Test-only | The legacy tests/check scripts asserted that group matches and knockout slots cannot be deleted. That rule was intentionally replaced. | tests updated to the new behaviour (deletion with full recomputation; knockout slots are re-created on generation) |

No data inconsistencies were found (standings, statistics and events agree after every mutation, including deletes).

### Notes on behaviour
- **Delete is permanent and works on any match**, including live and completed ones. Events and lineups are removed; standings, player statistics and the tournament stage are recomputed. The confirmation dialog warns when a match has results. A deleted semi-final or final is re-created by "Generate semi-finals / final".
- **The startup seed runs once per database**, so deleted fixtures and teams are not re-created on later deploys.

### Remaining issues / things to know
1. **The dev database currently has only 8 matches.** Match 2 is missing (deleted) and match 7 still has a 12:00 time. This happened outside this audit (probably from the admin Delete button); I did not touch it. Matches 1, 3, 4, 5, 6, 8, 9 are upcoming with no events.
2. **Production still shows the manual-test state**: Match 1 and 2 finished (0-0 and 1-0), times on matches 1-3. The reset script is deployed but **has not been run**; it needs your DigitalOcean console (see earlier steps).
3. Kickoff times and venues are still unset, apart from those test values.
4. Unreferenced duplicate crest images remain in `frontend/public/assets/teams/`; player photos are absent.
5. Single backend instance only (in-process WebSocket hub and login throttle). Turn on MongoDB backups.
6. If deployed behind a different number of proxies than one, set `TRUSTED_PROXY_HOPS` accordingly.
7. Not testable here: the live DigitalOcean deployment, `.do/app.yaml` with `doctl`, and the Docker Compose stack with TLS.

### Verdict
**Production-ready**, with the fix above included. All suites and the live-match workflows pass on isolated data, no known vulnerabilities, and no data inconsistencies. Nothing real was modified. Deploy only after you review and push the commits; then run the production reset and check the Matches page.

---

## Previous audit (2026-10-09)

**Scope:** the whole project after the production-startup, team-assignment, position-removal and squad-UI changes: backend (FastAPI + MongoDB), frontend (React/Vite), deployment config, data integrity, security, performance, responsiveness.
**Method:** everything was run for real against a throwaway MongoDB container and a separate backend/Vite stack. Neither production nor your dev database was written to.

### Results

| Area | What was run | Result |
|---|---|---|
| Backend automated | `pytest` against a real MongoDB test DB | **227 passed** |
| Frontend automated | `vitest` and `vite build` | **34 passed**, build OK |
| Static analysis | `ruff` (F, E9) on the backend; unused-import scan on the frontend | clean |
| Dependencies | `pip-audit`, `npm audit --omit=dev` | **0 vulnerabilities** |
| API robustness | 12 bad-id/bad-filter GETs and 33 authenticated bad-input calls (invalid dates, times, colours, ids, oversized text, illegal state transitions, malformed JSON, duplicate lineups, unknown teams) | **no 5xx**; every case returned 2xx/4xx as appropriate |
| Auth | NoSQL-operator login payload, brute force, missing/garbage tokens | 422 / 429 after 5 failures / 401 |
| Full workflow | Entire tournament through the API: 6 group matches, standings, semi-final generation, both semis, final, champion, event deletion and reopen | Standings matched an independent recomputation (0 mismatches). Goals in matches = goals in events. |
| Data integrity | Direct DB scan: orphan players/events/matches/group links, self-matches, duplicate teams/players/matches/admins, completed matches without teams | **0 issues** |
| Load | 150 requests at concurrency 30 on each of 5 public endpoints | 0 errors; p95 105–148 ms |
| Browser (Chrome) | All 9 public routes, admin login, dashboard + 3 tabs, Live Control, 404 redirect, admin guard, add-player form, team assignment, WebSocket push (ping/pong + event broadcast) | all working, no console errors |
| Responsiveness | 11 pages x 2 widths (375 px, 768 px), checked for horizontal overflow | **0 overflows** |
| Container check | Frontend image built and run under real nginx; page loaded in Chrome | renders, SPA routes work, Google Fonts load under the CSP |

### Bugs and risks found, and fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High** | **Admin lock-out risk behind a proxy.** Login throttling is per client IP, but uvicorn did not trust `X-Forwarded-For`. On DigitalOcean every visitor appears to come from the platform proxy's IP, so anyone failing 6 logins would lock the admin out. | `docker-entrypoint.sh` starts uvicorn with `--proxy-headers --forwarded-allow-ips "*"` (the container is reachable only through the platform proxy). Verified: an attacker IP gets 429 while the admin from another IP logs in (200). |
| 2 | Medium | The Docker/nginx proxy CSP (`style-src 'self'`) would have **blocked the Google Fonts** the app loads, so the site would silently fall back to system fonts in that deployment. | CSP in `proxy/nginx.conf.template` now allows `fonts.googleapis.com` / `fonts.gstatic.com`. |
| 3 | Medium | The DigitalOcean frontend (plain nginx) and the API sent **no security headers**. | Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a CSP to `frontend/nginx.conf` (repeated per location, since nginx drops inherited headers), and the first three to every API response. Verified in Chrome that the app and fonts still load. |
| 4 | Low | `/docs`, `/redoc` and `/openapi.json` were public in production. | Disabled when `ENVIRONMENT=production`. Still available in development. |
| 5 | Low | Admin could not choose teams for matches, so knockout matches stayed TBD. | New `PUT /api/matches/{id}/teams` and an Edit-modal team picker for every upcoming match (group teams only for group matches, no team in both semis, never on live/finished matches). Covered by 11 tests. |
| 6 | Low | Player positions were a placeholder (item 2 of the previous audit). | Removed from UI, API, importers, seed data and docs. Stored legacy values stay in the DB, ignored. |
| 7 | Info | Production DB was empty because migrations never ran. | Migrations and a create-only seed now run at startup under a Mongo lock (`app/core/bootstrap.py`), with an optional `PRE_DEPLOY` job in `.do/app.yaml`. |

No data inconsistencies were found. Nothing in the existing tournament data was modified.

### Remaining recommendations (not changed)
1. **Duplicate crest images** in `frontend/public/assets/teams/` (`1-6.jpeg`, `<team>.jpeg`, `<team>.png`; only `<team>.png` is used). Left in place to avoid touching assets; safe to remove the unreferenced copies.
2. **Same pairing twice in a group.** Team assignment checks group membership but deliberately does not forbid the same pairing in two group matches, because swapping teams between fixtures passes through temporary duplicates.
3. **Single instance.** The WebSocket hub and the login throttle are in-process, so run one backend instance (as `.do/app.yaml` does). Scaling out needs a shared pub/sub and rate-limit store.
4. **Mobile nav** still scrolls sideways on narrow screens (works, but not obvious).
5. **Backups.** Turn on automatic backups for the production MongoDB cluster.
6. **Secrets.** `MONGO_URI`, `JWT_SECRET` (32+ chars), `ADMIN_BOOTSTRAP_PASSWORD` and `CORS_ORIGINS` must be real production values; the app refuses to start otherwise.
7. **Not tested here:** the live DigitalOcean deployment itself, the `.do/app.yaml` spec (no `doctl`), the full Docker Compose stack with TLS, and print/accessibility audits.

### Verdict
**Production-ready.** All automated suites pass, no 5xx errors or data inconsistencies were found across the fuzzing, the full-tournament run and the DB scan, and no known vulnerabilities remain. The one high-impact risk found (admin lock-out behind the platform proxy) is fixed and verified. After deploying, check `/health/db` on the live site (6 teams, 44 players, 9 matches) and log in once.

---

## Previous audit (2026-10-08)

> Items 2 (player positions) and 8 (API security headers) below are resolved by the 2026-10-09 audit.

**Date:** 2026-10-08
**Scope:** backend (FastAPI + MongoDB), frontend (React/Vite), data, security, performance, deployment config.
**Earlier audit history** (2026-09-29, timer/half-time and eleven follow-up passes) lives in `reference/AUDIT.md` (git-ignored); this file is the current audit.

## How it was tested

All tests were run for real, not by code review alone. The real dev database (`dcl_scoreboard`) was **not** used for destructive testing. A separate throwaway stack (`dcl_e2e` database, backend on :8002, Vite on :5174) was built from migrations plus the real tournament import, then deleted afterwards.

| Layer | What was run | Result |
|---|---|---|
| Backend automated | `pytest` (real MongoDB test DB) | **213 passed** (194 before this audit, +19 new), coverage 88% |
| Frontend automated | `vitest` | **34 passed** |
| Production build | `vite build` | OK |
| Live API end-to-end | 163 scripted checks against a fresh DB (below) | **163 / 163 pass** after fixes (10 failed on first run) |
| Real-browser (Chrome) | public pages, 404/bad-id routes, admin login failure, token session, dashboard + 3 tabs, Live Control (start, goal, half-time, resume), match page, mobile width | See findings |
| Load | 300 requests at concurrency 30 per endpoint | 0 errors; 250–400 req/s per endpoint on one dev worker, p95 ≤ 161 ms |
| Dependencies | `pip-audit`, `npm audit` | 0 vulnerabilities (1 new transitive advisory fixed) |
| Static analysis | `ruff` (F, S rules), ESLint (unused/undef) | clean |

### The 163 live API checks cover
- All public GET endpoints return 200.
- Every one of the 25 admin/mutating endpoints returns 401 with no token. Garbage and wrongly signed tokens return 401, and a NoSQL-operator login payload is rejected.
- A full tournament was played through the API: lineups for 6 group matches, start/half-time/resume/end, goals, assists, cards, POTM, event deletion, reopen/re-end, standings, semi-final generation, draw winner override, final generation, and the champion.
- Rule enforcement: double start, events before start, player/team mismatch, minute > 120, a winner set on a decided match, duplicate team name, duplicate jersey number, deleting a team with match history.
- Team/player CRUD, a WebSocket broadcast on match update, a CORS rejection of an unknown origin, and the login rate limiter returning 429.

## Real tournament data (earlier in this session)
Imported from `reference/data/*.jpeg` into the dev DB: 6 teams, 44 players, groups A (White Lions, Golden Hawks, Red Dragons) and B (Black Panthers, Green Alligators, Blue Whales). The 6 group fixtures follow the official schedule order, with all 9 matches dated 2026-10-10. Stale dummy results, events and standings were cleared (backup taken). Dev DB verified: all matches `upcoming`, standings all zero.

## Bugs found and fixed

| # | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| 1 | **High** | Semi-final pairing contradicted the official schedule. The code seeded SF1 = A1 vs B2 and SF2 = B1 vs A2. The official draw says SF1 = A2 vs B1 and SF2 = B2 vs A1. Found by the live run. | `services/matches.py::generate_semis` reordered; stale UI text on the Standings page and Admin dashboard, and the API docstring, corrected | `test_fixture_generation` updated |
| 2 | **High** | A malformed id (`/api/teams/zzz`, `?team_id=zzz`) caused an unhandled **500** on ~20 endpoints | Global `InvalidId` handler returns 422 "Invalid id format" | `test_input_validation` (7 paths) |
| 3 | Medium | Validation errors that carry a Python exception (e.g. a custom date validator) crashed the 422 handler with a 500 (`TypeError: not JSON serializable`) | `jsonable_encoder` in `main.py` | covered by the date tests |
| 4 | Medium | `PATCH /api/matches/{id}` accepted garbage dates and times (`2026-13-45`, `25:99`) and unbounded venue/notes | Strict `YYYY-MM-DD` (real calendar date) and `HH:MM` validation, plus length limits | `test_input_validation` (5 bad plus the valid/clear case) |
| 5 | Medium | `POST/PATCH /api/teams` accepted any string as the colour (`red`, `<script>`) | Hex colour pattern (`#rgb` / `#rrggbb`) | `test_input_validation` (5 bad plus a valid one) |
| 6 | Medium (UX) | Live Control: goal/card with no minute failed silently. The error banner is at the top of the page and the operator is scrolled down at the form. The field wasn't marked required, and its label said "1-90" while allowing 120. | Minute is now `required`, the label corrected, and the page scrolls to the error banner on any action error | existing 34 UI tests still pass |
| 7 | Low | The frontend showed raw JSON for FastAPI validation-error arrays | `api/client.js` formats them as `field: message` | — |
| 8 | Low | `npm audit`: new high-severity transitive advisory (`source-map-js`) | `npm audit fix`, now 0 vulnerabilities | — |
| 9 | Low | Dead code: 5 unused frontend API wrappers (`createTeam`, `deleteTeam`, `getMe`, `getToken`, `updatePlayer`) | Removed | — |
| 10 | Dev tooling | `vite.config.js` proxy was hard-coded to :8001 / :5173, so a second stack couldn't be run for testing | `VITE_API_TARGET` / `VITE_PORT` env overrides (defaults unchanged) | — |

## Remaining issues / recommendations (not fixed)
1. **Duplicate image files.** `frontend/public/assets/teams/` has 3 byte-identical copies of each crest (`1–6.jpeg`, `<team>.jpeg`, `<team>.png`). Only `<team>.png` is referenced, and the `.png` files are actually JPEG data. I tried to delete the 12 unreferenced copies but the deletion was blocked by the environment's permission classifier, so I left them. Safe to run: `git rm frontend/public/assets/teams/*.jpeg`.
2. **Player positions are not real data.** The squads image has none, but the database requires GK/DEF/MID/FWD, so every player carries a placeholder from the earlier roster. Provide real positions, or make `position` optional.
3. **Squads image is cropped** after row 7, so any extra players on Golden Hawks or Blue Whales (7 shown each) could be missing. Managers are stored as numbered players because the schema requires it.
4. **Kickoff times and venue are unknown.** The schedule image has none; only the date (2026-10-10) is set. Note 10/10/2026 is a **Saturday**, not Sunday as stated.
5. **No player photos** exist (`public/assets/players/` is empty); the avatar fallback renders correctly.
6. **Mobile nav:** the 6 main-nav tabs scroll sideways on narrow screens (the "Players" tab sits off-screen with no scroll hint). It works, just not obvious.
7. **The dev DB's running backend (:8001) was started before this audit's code changes.** Restart it (`npm run dev`) to pick up fixes 1–5. Hot-reload frontend changes apply automatically.
8. **API sends no security headers itself.** They are set by the nginx proxy (HSTS, CSP, X-Frame-Options, nosniff), which is correct for the documented Docker deployment. Don't expose uvicorn directly.
9. Single uvicorn worker and an in-process WebSocket hub and login throttle: fine for a single-day, 6-team event. Scaling to multiple workers would need a shared pub/sub and rate-limit store.
10. Docker/nginx deployment was reviewed (non-root backend user, healthchecks, TLS 1.2+, headers, body limit, production fail-fast on dev secrets) but **not re-built or run in this audit**. It was verified in the 2026-09-29 audit.
11. The verdict below assumes real secrets (`JWT_SECRET`, admin password, Mongo password, CORS origin, TLS cert) are set before deploying.

## Verdict
**Ready for the tournament, with conditions.** After the fixes above the full stack passes 213 backend tests, 34 frontend tests and 163 live end-to-end checks, including a complete simulated tournament from group stage to champion. There are no known vulnerabilities, and the app handled 250–400 req/s with zero errors, far above what a 6-team single-day event needs. The one genuine rules bug (semi-final pairing) and the two 500-error classes are fixed and regression-tested.

Before going live:
- restart the dev/prod backend so it runs the fixed code;
- supply real kickoff times and venue (and player positions if you want them shown correctly);
- set production secrets and the real domain/cert as in `README.md`;
- do one dry run on the real stack.
