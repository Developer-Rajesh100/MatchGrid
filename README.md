# DCL Season 5 — Digital Scoreboard

Full-stack scoreboard for a single football tournament (6 teams, 2 groups, semi-finals, final). See `docs/` for the original analysis/architecture documents, `reference/plan.txt` + `reference/implementation.txt` for the project's phase-by-phase history, and `reference/AUDIT.md` for the current, authoritative production-readiness status and any known open issues.

## Status

Backend (database, REST API, JWT auth, WebSocket live updates, the Timer/Half-Time feature), frontend (all public pages, single-admin control panel, real-time updates), security hardening, and a containerized production deployment (Docker Compose + an Nginx reverse proxy with TLS) are all implemented and tested — see `reference/AUDIT.md` for the full audit history and current status. What's **not** done: importing the real tournament roster/schedule (the app currently runs on a dev/test roster) and actually deploying to a real host with a real domain and real TLS certificates.

## Prerequisites

- Docker + Docker Compose
- Python 3.14 (backend) — the pinned dependency versions in `backend/requirements.txt` are built and tested against 3.14; if your default `python3` is a different major version, create the virtualenv with `python3.14` explicitly (some dependencies may not have prebuilt wheels for other versions yet).
- Node.js 20+ (frontend)

## Running everything via Docker (closest to production)

```bash
cp .env.example .env            # adjust Mongo credentials if you like
cp backend/.env.example backend/.env   # set real secrets for anything beyond local testing
./proxy/generate-dev-cert.sh    # self-signed cert for local HTTPS testing (see the script's own comment for real-cert setup)
docker compose up -d
```

Serves the whole stack — frontend, backend, and MongoDB — behind a single TLS-terminating reverse proxy, by default at `https://localhost:8443` (and an HTTP→HTTPS redirect on `:8090`; both ports are non-standard only to avoid clashing with anything else already running locally — set `HTTP_PORT`/`HTTPS_PORT` to `80`/`443` in `.env` for a real deployment). Migrations run automatically on backend startup. `docker compose ps` should show all four services `healthy`.

## Running for local development (hot-reload, no Docker for the app itself)

### Database

```bash
cp .env.example .env   # adjust credentials if you like
docker compose up -d mongo
```

Starts MongoDB only, on `localhost:27018` (not the default 27017 — see `reference/plan.txt` for why), with data persisted in the `mongo_data` Docker volume.

### Backend

```bash
cd backend
python3.14 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env   # adjust MONGO_URI to match the root .env credentials, and set real secrets
```

Apply migrations (creates indexes, the singleton tournament + groups, the bootstrap admin account, and the fixed knockout match slots):

```bash
./venv/bin/python -m app.migrations.runner
```

Optionally load development sample data (ported from `reference/index.html`'s demo roster — **not** the real tournament data):

```bash
./venv/bin/python -m app.scripts.seed_data
```

To import real tournament data / a real match schedule instead, see `backend/data/README.md`.

Run the API:

```bash
./venv/bin/uvicorn app.main:app --reload --port 8001
```

Then check `http://localhost:8001/health` and `http://localhost:8001/health/db`. Interactive API docs: `http://localhost:8001/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Serves on `http://localhost:5173`, proxying `/api` and `/ws` to the backend on port 8001 (see `frontend/vite.config.js`). Or from the repo root: `npm run dev` / `npm run backend` (see the root `package.json`).

## Running the tests

Backend (pytest, against a disposable `dcl_scoreboard_test` database on the same Mongo container — never the dev database; requires Mongo running per above):

```bash
cd backend
./venv/bin/pip install -r requirements-dev.txt   # first time only
./venv/bin/pytest
```

Frontend (Vitest + React Testing Library, no backend/Mongo required — the API layer is mocked):

```bash
cd frontend
npm test
```

Or from the repo root: `npm test` (runs both).

## Project layout

See `reference/plan.txt` Section 4 for the folder structure and architecture as originally built, and `reference/AUDIT.md` for the current, up-to-date status of every part of the system.
