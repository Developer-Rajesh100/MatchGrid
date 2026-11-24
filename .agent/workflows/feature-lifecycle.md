---
description: Standardized 7-stage development lifecycle for adding features to MatchGrid with strict verification gates
---

# MatchGrid 7-Stage Feature Development Lifecycle

Execute this workflow systematically whenever introducing a new feature, enhancement, or architectural capability to **MatchGrid**. Never skip gates or proceed to subsequent stages without completing prior verification steps.

---

## Stage 1 — Feature Planning
- **Scope & Objectives**: Clearly outline the feature's purpose, target users (**Superadmin**, **Tournament Organizer**, **Match Scorer**, **Public Spectator**), and boundaries.
- **Acceptance Criteria**: Formulate verifiable criteria in Given-When-Then format.
- **Edge Cases & Failure Modes**: Identify concurrency risks, database contention, network drops, or invalid states.
- **Gate 1**: Present the structured **Feature Plan** to the user and pause for approval before writing design specifications or code.

---

## Stage 2 — Architecture & System Design
- **Database & Schemas (MongoDB / Beanie)**:
  - Document models, fields, types, and compound indexes.
  - New forward migration module name (e.g., `m0005_<description>.py`).
- **Backend API & Real-Time Contracts (FastAPI)**:
  - Pydantic request/response schemas.
  - Router paths, HTTP methods, status codes, and 4-tier role permissions (`get_current_user`, `require_superadmin`, `require_tournament_owner`, `require_match_operator`).
  - WebSocket broadcast payload types (e.g., `match_updated`, `standing_updated`).
- **Frontend Component Hierarchy (React 18 / Vite)**:
  - Component tree, hooks, routing paths, responsive breakpoints, and token styling.
- **Gate 2**: Present the **Architecture Blueprint** to the user and pause for approval before modifying code.

---

## Stage 3 — Implementation (DB → Backend → Frontend)
Execute implementation strictly in layer-by-layer dependency order:
1. **Database Layer**:
   - Create new migration in `apps/backend/app/migrations/mXXXX_<name>.py`.
   - Update Beanie document models in `apps/backend/app/models/`.
2. **Backend Services & API**:
   - Implement business logic in `apps/backend/app/services/`.
   - Mount router endpoints in `apps/backend/app/routers/`.
   - Write comprehensive Pytest unit/integration tests in `apps/backend/tests/`.
   - Run `bun run test:backend` to verify all backend tests pass.
3. **Frontend Client & UI**:
   - Update API clients in `apps/frontend/src/api/`.
   - Build accessible components adhering to Deep Stadium Slate & Pitch Emerald design tokens in `index.css`.
   - Implement responsive layouts (desktop & mobile drawer).
   - Write Vitest component tests and verify via `bun run test:frontend`.

---

## Stage 4 — Playwright E2E Testing
- Add a dedicated end-to-end test specification in `e2e/tests/<order>-<feature-slug>.spec.ts`.
- Cover both the primary happy path and critical boundary/error states.
- Follow test isolation practices: utilize `e2e/fixtures/api.ts` to create isolated test fixtures and mandate cleanup in `finally` blocks so zero stray documents remain in MongoDB.
- Run `bun run test:e2e` until all specs are 100% green.

---

## Stage 5 — Feature Branch Commit & Push
- Ensure work is on a dedicated feature branch:
  ```bash
  git checkout -b feat/<feature-slug>
  ```
- Review changed files with `git status` and stage clean atomic commits following Conventional Commits format (`feat(<scope>): <description>`).
- Push the branch to the remote repository:
  ```bash
  git push -u origin feat/<feature-slug>
  ```

---

## Stage 6 — Full-Stack Project Regression Gate
Execute the full-stack regression gate command:
```bash
bun run test:all
```
This automatically validates four sequential quality gates:
1. **Backend Tests**: `apps/backend/.venv/bin/pytest -v`
2. **Frontend Tests**: `bun --filter frontend test`
3. **Frontend Production Build**: `bun run build`
4. **End-to-End Suite**: `bunx playwright test`

If any gate fails, immediately resolve root causes and re-run `bun run test:all` until all 4 checks pass cleanly.

---

## Stage 7 — Mainline Integration
- Once Stage 6 passes with zero errors:
  ```bash
  git checkout main
  git pull origin main
  git merge --no-ff feat/<feature-slug> -m "feat: merge <feature-slug> feature branch into main"
  git push origin main
  ```
- Confirm `git status` reports a clean working tree.
