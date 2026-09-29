# MongoDB configuration

The `docker-compose.yml` at the repo root runs a single `mongo:7` container using the root credentials from `.env` (`MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`). The backend connects with those same root credentials (see `backend/.env`, `MONGO_URI`).

This project deliberately skips creating a separate per-app database user via an init script — at this scale (one small internal tool, one deployment), a dedicated app user adds an extra credential to manage without a real security benefit, since the root credentials are only ever known to the backend service and the operator. If that changes (e.g. multiple services need scoped DB access), drop a `*.js` init script into `init/` — the compose file already mounts this directory into the container's `/docker-entrypoint-initdb.d/`, so anything placed there runs automatically on first container start.

Data persists in the named Docker volume `mongo_data` (declared in the root `docker-compose.yml`), not in this directory.
