# MatchGrid — Live Football Tournament Platform (Bun Workspace Monorepo)

A high-performance, multi-tenant live digital scoreboard and tournament management SaaS platform with 4-tier RBAC, drift-free UTC match clocks, room-scoped WebSockets, and dynamic knockout bracket progression.

This project is organized as a **Bun workspace monorepo**:
- **MongoDB 7** runs containerized in Docker with persistent volume storage and healthchecks.
- **FastAPI backend** (`apps/backend`) and **React/Vite frontend** (`apps/frontend`) run natively on the host machine for blazing fast hot-reloading and development.

---

## Architecture & Directory Layout

```
MatchGrid/
├── apps/
│   ├── backend/            # FastAPI async REST API & WebSocket server
│   │   ├── .venv/          # Isolated Python virtual environment
│   │   ├── app/            # Application logic (routers, models, services, migrations)
│   │   ├── data/           # Bundled tournament data and schedule JSON files
│   │   ├── tests/          # Pytest backend test suite (253 tests)
│   │   └── requirements.txt# Backend dependencies
│   └── frontend/           # React 18 + Vite SPA (named "frontend" in workspace)
│       ├── src/            # Components, pages, router, hooks, CSS tokens
│       └── package.json    # Frontend dependencies and test scripts
├── e2e/                    # Playwright end-to-end multi-role test suite
│   ├── fixtures/           # API authentication helpers & teardown
│   └── tests/              # E2E test specifications
├── infra/
│   └── mongo/              # MongoDB Docker setup & init scripts
│       └── init/
├── docs/                   # Master roadmap, system architecture & workflows
├── scripts/
│   ├── setup.sh            # Complete one-time bootstrap script
│   └── db-up.sh            # Starts MongoDB in Docker and waits until healthy
├── docker-compose.yml      # Defines ONLY the MongoDB 7 Docker container
├── package.json            # Root Bun workspace configuration and runner scripts
├── bun.lock                # Bun lockfile
└── .env.example            # Root environment variable templates
```

---

## Prerequisites

1. **Docker & Docker Compose** (for MongoDB)
2. **Bun** (`>= 1.1`): `curl -fsSL https://bun.sh/install | bash`
3. **Python 3.14** (recommended) or **Python 3.12+**

---

## Quickstart (Single-Command Setup)

Run the one-time bootstrap script from the repository root:

```bash
bun run setup
```

This single command automatically:
1. Copies `.env.example` templates to `.env` in the root and `apps/backend/` if missing.
2. Starts the MongoDB 7 Docker container and waits until it passes healthchecks.
3. Creates the Python virtual environment in `apps/backend/.venv` and installs all dependencies (`requirements-dev.txt`).
4. Installs Bun workspace dependencies across the monorepo (`bun install`).
5. Executes database schema migrations (`app.migrations.runner`).
6. Leaves the database empty apart from the bootstrap superadmin and the default tournament; run `bun run seed:demo` for a realistic demo dataset.

---

## Development

To start the full development stack (MongoDB in Docker + FastAPI Backend + React Frontend):

```bash
bun run dev
```

This automatically:
- Ensures the MongoDB container is running and healthy (`db:up`).
- Launches the **FastAPI backend** with auto-reload at [http://localhost:8001](http://localhost:8001).
- Launches the **Vite frontend** dev server at [http://localhost:5173](http://localhost:5173).
- Displays color-coded prefixed logs (`[backend]` in cyan, `[frontend]` in magenta) in a single unified terminal.

### URLs
- **Web App:** [http://localhost:5173](http://localhost:5173)
- **API Health:** [http://localhost:8001/health](http://localhost:8001/health)
- **Database Status:** [http://localhost:8001/health/db](http://localhost:8001/health/db)
- **Interactive OpenAPI Docs:** [http://localhost:8001/docs](http://localhost:8001/docs)

---

## All Root Commands

| Command | Action |
|---|---|
| `bun run setup` | Complete bootstrap: sets up Docker Mongo, Python `.venv`, Bun packages, migrations, and seed data. |
| `bun run dev` | Starts MongoDB (Docker) + Backend (`:8001`) + Frontend (`:5173`) with unified live logs. |
| `bun run db:up` | Starts MongoDB container in Docker and waits until healthy. |
| `bun run db:down` | Stops the MongoDB container (`docker compose down`). |
| `bun run test` | Runs local test suite: Backend (Pytest) + Frontend (Vitest). |
| `bun run test:backend` | Runs the backend Pytest suite (`apps/backend/.venv/bin/pytest`). |
| `bun run test:frontend`| Runs the frontend Vitest suite (`bun --filter frontend test`). |
| `bun run test:e2e` | Runs headless Playwright end-to-end multi-role test suite. |
| `bun run test:all` | **Mandatory Full-Stack Quality Gate**: Pytest + Vitest + Build + Playwright. |
| `bun run build` | Builds the production Vite bundle in `apps/frontend/dist`. |
| `bun run lint` | Validates frontend build without errors. |

---

## Database & Port Details

- **MongoDB Container Name:** `matchgrid_mongo`
- **Host Port:** `${MONGO_PORT:-27018}` (mapped to container port `27017` to prevent collisions with other local databases).
- **Volume:** `mongo_data` (persists tournament state across container restarts).
- **Backend Port:** `8001` (FastAPI + Uvicorn)
- **Frontend Port:** `5173` (Vite, proxies `/api` and `/ws` to `8001`)

---

## Documentation

- **Master Project Plan & Overview:** [`docs/plan.md`](docs/plan.md)
- **Implementation Blueprint & Phased Roadmap:** [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)
- **System & Software Architecture Design:** [`docs/system_architecture.md`](docs/system_architecture.md)
- **Development Workflow & Quality Gates:** [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md)
- **Historical Baseline Codebase Audit:** [`docs/PROJECT_ANALYSIS.md`](docs/PROJECT_ANALYSIS.md)
- **Tournament Data Format & Importers:** [`apps/backend/data/README.md`](apps/backend/data/README.md)


## Demo data

`bun run seed:demo` fills the dev database with a busy, realistic platform: ~50 tournaments (completed with champions, active at every stage with matches live and at half time right now, and private drafts that only their organizers see), 400+ clubs, 3,000+ players, ~770 matches with lineups, events and the materialized standings and statistics, plus 8 organizers and 20 scorers.

* Safe to re-run: it does nothing once seeded. `bun run seed:demo -- --reset` removes exactly what it created (accounts named `demo_*` and their tournaments) and rebuilds it; other data is never touched.
* It never uses Cloudflare R2 (crests, logos and banners are inline SVGs) and refuses the test database and `ENVIRONMENT=production`.
* All demo accounts share the password `DemoPass#2026`, e.g. organizer `demo_premier_street`, scorer `demo_scorer_01`. Your existing superadmin is reused.
* `--tournaments N` changes the size (used by the tests with a small N).
