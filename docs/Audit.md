# MatchGrid Audit Report (Phases 0–6, before Phase 7)

**Date:** 2026-11-25
**Branch audited:** `main` (commit `7299b12`)
**Scope:** Read-only audit of backend (`apps/backend`), frontend routing/WebSocket/portal code (`apps/frontend`), CI and deploy config.
**Not covered:** Test suites were not executed. CSS and the 2,300-line organizer page were only skimmed, so 375px vs 1440px responsive layouts are not verified.

**Summary:** Phases 0–6 are mostly built, but multi-tenant isolation has real holes and several singleton fallbacks from the original single-tournament app are still live. Fix the **[CRITICAL]** items before Phase 7.

---

## [CRITICAL] Security / Isolation / Data Corruption

**C1. R2 credentials committed to git**
- `apps/backend/app/core/config.py:46-50` holds a real-looking R2 account ID, access key, secret and bucket as defaults.
- `.github/workflows/ci.yml:77-78` repeats the key and secret as `||` fallbacks.
- It makes `is_r2_configured` always true, so a missing env var in production silently uses these keys.
- Fix:
  1. Rotate the R2 token now (it is in git history).
  2. Make the defaults empty.
  3. Remove the CI fallbacks.
  4. Make `production_safety.py` require R2 vars and `DEBUG=false` when `ENVIRONMENT=production`.

**C2. Cross-tenant R2 delete through attacker-supplied URLs**
- `TeamUpdate`, `PlayerUpdate` and `TournamentUpdate` accept any `crest_url` / `photo_url` / `logo_url` string with no tournament check.
- Repro: organizer B `PATCH`es their team with `crest_url` set to organizer A's R2 URL, then changes or deletes the team. `routers/teams.py:91-93`, `services/teams.py:67-72`, `services/players.py:85-88,107-111` call `delete_image(old)`, deleting A's image. This skips the ownership check that `routers/uploads.py` has.
- Fix: validator accepting only keys prefixed `tournaments/<this tournament_id>/` or non-R2 URLs; call `delete_image` only for keys inside the entity's own tournament.

**C3. Cross-tenant group injection**
- `services/groups.py:11-46` (`assign_team_group`) never checks `group.tournament_id == team.tournament_id`. `create_team` has the same gap.
- Repro: organizer A `PATCH /teams/{A_team}` with `group_id` of a group in tournament B inserts a `GroupTeam` row into B's standings.
- Fix: 404/403 unless team and group share `tournament_id`.

**C4. Singleton `PATCH /tournament` and `/tournament/config`**
- `routers/tournament.py:109,124` use `get_active_tournament()` (`Tournament.find_one()`, the first tournament in the DB). A superadmin edits an arbitrary tournament; an organizer gets 403 or edits the wrong one.
- No frontend code calls these routes.
- Fix: replace with ownership-checked `PATCH /organizer/tournaments/{id}` and `/config`; delete the singleton routes.

**C5. Ownership checks that fail open**
- `core/deps.py:101` and `:130`: if `tournament.organizer_id is None`, any organizer passes.
- `deps.py:130`: `if tournament and ...` lets an organizer operate a match whose tournament was deleted (orphan).
- `deps.py:89-92`: with no `tournament_id`, falls back to `Tournament.find_one()`. Reaches `POST /teams`, `/matches`, `/groups/random-draw`, `/matches/generate-semis`, `/generate-final`, `/seed-knockout`.
- Fix: `None` owner means superadmin only; missing tournament means 404; never fall back to an arbitrary tournament on mutations; require `tournament_id` on every write.

**C6. Tournament delete leaves orphans; R2 prefix never purged**
- `routers/organizer.py:194-213` deletes matches, players, teams and groups but leaves `GroupTeam`, `MatchEvent`, `MatchLineup`, `TournamentStanding`, `PlayerStatistics`.
- R2 objects are deleted before DB rows, so a mid-way failure leaves data pointing at deleted images. Never-attached uploads are never removed.
- Fix: delete all child collections, then purge the `tournaments/<id>/` prefix (paginated `list_objects_v2` + `delete_objects`) after the DB commit.

**C7. Deleting a user leaves dangling references**
- `superadmin.py:122-136` (`delete_user`) removes an organizer but leaves their tournaments with a dead `organizer_id`, and removes scorers without clearing `assigned_scorer_ids`.
- Fix: block deleting an organizer who owns tournaments (or reassign), and `$pull` the scorer from all matches.

**C8. Legacy `Admin` collection is an un-deactivatable superadmin**
- `deps.py:35-49`, `services/auth.py:5-17`: an `Admin` row logs in first and bypasses `User.is_active`; `get_current_user` builds a transient `User(is_active=True)`.
- Hardcoded `username == "testadmin"` special case at `deps.py:39`.
- Fix: migration moving `Admin` rows into `users`; drop the `Admin` model and both code paths.

**C9. Scorers can do organizer-level actions**
- `PATCH /matches/{id}` (`matches.py:204-231`), `/cancel`, `/uncancel`, `/winner`, `/reopen` all use `check_match_operator`. An assigned scorer can renumber, reschedule, change venue, cancel, or set the knockout winner (advancing the bracket). The plan limits scorers to clock, lineup and events.
- Fix: gate those routes with `check_tournament_ownership`.

**C10. Fail-open check in upload delete**
- `routers/uploads.py:46-48`: a key starting with `tournaments/` but lacking a 24-hex tournament segment skips the ownership check and is deleted.
- Fix: reject any key not matching `^tournaments/<24hex>/(crests|photos|logos|banners)/<uuid>.<ext>$`.

---

## [HIGH] Logic / Domain Edge Cases

**H1. Room isolation is nominal.** `WebSocketContext.jsx:34` connects to `/ws/live` with no `tournament_id`, so every client joins `global`; `core/websocket.py:84-88` always echoes each tournament's broadcast to `global`. Every viewer receives all tournaments' traffic and filters in JS. Fix: connect with `?tournament_id=` / subscribe immediately; add `include_global=False`; reserve `global` for the hub.

**H2. Broadcast with no `tournament_id` reaches everyone.** `services/matches.py:718` (`assign_match_teams`) omits it. Fix: add the field.

**H3. Sequential broadcasts inside the request.** `core/websocket.py:102-118`: one stalled socket delays the scorer's HTTP response. Fix: `asyncio.gather` with per-send timeout or a queue; add connection/message limits. The manager is in-process only, so Phase 7 must stay single-instance or add Redis pub/sub.

**H4. Reopen / edit of a knockout match does not cascade.** `reopen_match` (`services/matches.py:198-217`) and `_after_mutation` (`match_events.py:25-30`) never call `advance_knockout_winner` and never un-advance. A changed or level-without-override result leaves the downstream slot with the old team. `generate_final` is one-shot ("already generated"). Semi-final to final is never automatic (`advance_knockout_winner` returns early for non-quarters, `:103`). Fix: one idempotent `recompute_bracket(tournament_id)` called from end, reopen, event add/remove and `set_winner`; refuse to change a slot whose downstream match is live/finished; clear `winner_override_id` when the score is no longer a draw.

**H5. Knockout seeding is hardcoded.** `generate_semis` (`:384`) requires exactly 2 groups, always takes top 2, ignores `qualifiers_per_group`. `seed_knockout_bracket` supports only 1, 2 or 4 groups for quarters and indexes `sb[3]` / `s[7]` directly (`IndexError` → 500 with fewer teams). `TournamentConfig` allows 3 groups, 8 groups, or 4 groups × 1 qualifier, which can never seed. Fix: one qualifier-ordered seeding function from `num_groups × qualifiers_per_group`, validated against real standings sizes, 409 instead of 500.

**H6. `force=true` fixture regeneration leaves stale derived data.** `services/matches.py:342-345` deletes events and lineups but never recalculates standings or player stats, nor refreshes the stage. Fix: reuse `delete_match()` per match or run the same recompute.

**H7. `_renumber_matches` rewrites every match number.** `services/matches.py:258-275` overwrites user-edited numbers and numbers of played matches on each generation; 2N writes; not atomic (a crash leaves negative numbers). Fix: number only the new matches via `_next_match_number`.

**H8. Random draw ignores `teams_per_group`.** `groups.py:79-85` deals round-robin, so 7 teams / 2 groups gives 4 and 3; `generate_group_fixtures` then demands exactly `teams_per_group` and returns 409 for the 4-team group. Redraw doesn't reset fixtures or standings. Fix: validate count against `num_groups × teams_per_group` or support uneven groups; block redraw after fixtures exist unless forced.

**H9. Standings missing after group reassignment.** `assign_team_group` deletes the old row but never recalculates the new group; `sorted_group_standings` (`standings.py:122-127`) only recalculates when there are no rows. Fix: recalc both groups after any move.

**H10. Tiebreakers / league champion.** Sort is points, GD, GF, name; no head-to-head or fair play. `tournament_stage._determine_league_champion` compares each group's top team, wrong with more than one group. With `knockout_format = none`, one cancelled group match means the tournament never reaches `champions`.

**H11. Clock authority.** `AdminLiveControlPage.jsx:44-195` gives `localStorage` (`dcl_timer_<id>`) precedence over server `started_at` / `is_half_time`; a second scorer device or cleared storage disagrees. Neither the console nor `MatchDetailPage.jsx:112-122` corrects for client clock skew (`Date.now()` vs server timestamp). Fix: add `server_now` (or `/time`), derive the clock only from server fields, drop `localStorage` as source of truth; cap or remove client-supplied `elapsed_seconds` in `pause_half_time`.

**H12. Cancelled matches accept events; event/lineup edits not transactional.** `add_event` (`match_events.py:36`) only blocks `upcoming`. `set_lineup` deletes then inserts row by row, so a crash leaves an empty lineup.

**H13. Player IDs not tournament-scoped.** `services/players.py:29` builds `DCL-nnn` from the global `Player.count()`; no unique index since `m0005`, so IDs collide after deletes or across tournaments; the `DuplicateKeyError` retry branch is dead. `player_code` is never set. Fix: per-tournament counter.

**H14. R2 orphan leaks.** Tournament `PATCH` replacing a logo/banner never deletes the old image; uploads never saved to an entity leak. Fix: sweeper deleting unreferenced keys older than 24h.

---

## [MEDIUM] Plan / Architecture Drift & Dead Legacy Code

- **M1.** Legacy `/matches`, `/standings`, `/teams`, `/stats`, `/players` routes (`AppRouter.jsx:44-51`) call the API with no tournament, so the backend falls back to the first tournament (`tournament_scope.py:29,54`). Match/team/player detail pages live outside `/t/:slug`, so `MatchRow.jsx:31` and bracket links drop the tournament shell. Fix: nest detail routes under `/t/:slug/...`; require `slug` or `tournament_id` on public list endpoints (no fallback).
- **M2.** `/admin` (`AdminDashboardPage.jsx`, 1,365 lines) duplicates `/organizer` (2,346 lines) and calls `getMatches()`, `getTeams()`, `randomGroupDraw()`, `generateSemis()`, `seedKnockout()` with no tournament id (`:86-88`, `:389-431`), hitting the singleton fallback. Fix: redirect `/admin` to `/organizer`, delete the page.
- **M3.** Dead code: `HomePage.jsx` (imported, never routed), `RequireAdmin.jsx`, `tournamentApi.getTournament/updateTournament/updateConfig`, `generateSemis`/`generateFinal` (superseded by `seed-knockout`), `get_active_tournament*`.
- **M4.** Tournament `status` inconsistent: model default `"active"`, creation writes `"ACTIVE"`, `TournamentUpdate.status` is a free string, nothing sets completed. `OrganizerWorkspacePage.jsx:614,621` compares `stage === 'GROUP_STAGE'` but the backend uses `group|quarters|semis|final|champions`. Fix: one enum, update the UI.
- **M5.** Public exposure: `/tournaments/public` returns `organizer_name=org.username` (`tournament.py:65`, the login username); `MatchOut.assigned_scorer_ids` is public. Fix: use `organization_name` only; strip scorer IDs from public responses.
- **M6.** Cross-tenant scorer assignment: `assign_scorer_to_match` (`organizer.py:144-146`) doesn't check `scorer.created_by == admin.id`.
- **M7.** Docs drift:
  - Requested `docs/SYSTEM_ARCHITECTURE.md` exists as `docs/system_architecture.md` (its header says `SYSTEM_ARCHITECTURE.md`).
  - `docs/plan.md` lists 5 phases with "Phase 1 *(Next Up)*", not matching the 7-phase roadmap.
  - Docs use absolute `file:///home/rajesh/...` links.
  - Root `AUDIT.md` is a DCL Season 5 audit.
  - `main.py:55-60`, `Dockerfile`, `.do/app.yaml` (`name: dcl`, DCL DB name, `AUTO_SEED=true`) still carry DCL branding/seed.
  - Duplicate `.agent/` and `.agents/` workflow docs.
- **M8.** Phase 7 operational gaps: in-memory per-process login rate limiter; single Dockerfile worker and in-process WebSocket manager; no HSTS; JWT in `localStorage` (12h, no revocation); CI Python 3.12 vs Dockerfile 3.14; upload reads the whole file before the 5 MB check (`uploads.py:24`); images stored as original bytes (no re-encode, EXIF not stripped, no `img.verify()`).
- **M9.** Performance at multi-tenant scale: whole-collection loads on every call (`Player.find_all()` in 5 places in `routers/matches.py`, `services/statistics.py:9-10`, `routers/teams.py:31-32`, `_groups_map()`, `Match.find(stage=="extra")` in `player_stats.py:20`); N+1 counts in `list_public_tournaments` and `list_teams`; two DB reads per request in `get_current_user`.

---

## [LOW] UI/UX Polish & Error Handling

- **L1.** `RoleGuard` redirects a wrong-role user to `/` with no 403 screen and doesn't react to the 401 event from `client.js`, so an expired session shows failing calls.
- **L2.** `getRole()` defaults to `SUPER_ADMIN` (`auth.js:42-43`); a token with no stored role is treated as superadmin in the UI (cosmetic, backend enforces).
- **L3.** `TournamentBracket.jsx:15` resets to a full spinner on every WebSocket refresh (tree flashes); with `knockout_format = none` it says "Knockout Stage Pending" forever; "Penalty deciders (P)" text (`BracketPage.jsx:38`) has no matching indicator.
- **L4.** `TournamentSubNav.jsx:12` reads `live_matches_count`, which `TournamentOut` never returns, so the LIVE pill never shows.
- **L5.** `TournamentProvider` mounted twice (`App.jsx`, `TournamentLayout.jsx`): double fetch and subscriptions.
- **L6.** WebSocket reconnect doesn't refetch missed state; under React StrictMode (dev only) the old socket's `onclose` nulls `socketRef` for the new one.
- **L7.** Login has a username-enumeration timing difference (no dummy hash when the user is missing).
- **L8.** `cancel_match` / `uncancel_match` don't update `updated_at`; `reset_timer` silently does nothing on a non-live match.

---

## Verified OK

- All 13 live-match mutation routes call `check_match_operator`.
- WebSocket manager connect/disconnect/unsubscribe cleanup is correct.
- Malformed ObjectIds map to 422 via a global handler.
- Magic-byte image validation via Pillow; upload keys scoped under `tournaments/<id>/`.
- Circle-method BYE handling for odd team counts; custom points rules honored.
- Unique indexes on `(tournament_id, match_number)` and `(tournament_id, team name)`; `tz_aware=True` is set.

---

## Suggested fix order

1. C1 (rotate the key now), then C2–C5, C9, C10.
2. H1, H4, H5.
3. H6–H9, C6–C8, then the M-items.

No changes have been applied; each group needs approval first.
