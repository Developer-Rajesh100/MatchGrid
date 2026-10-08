# DCL Season 5 Scoreboard — Test & Production-Readiness Audit

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
