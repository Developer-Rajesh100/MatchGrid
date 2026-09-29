# Built from the project root as the build context (see ../.dockerignore),
# so relative paths below are rooted at backend/.
#
# Base image: python:3.14-slim, NOT the 3.12 originally planned in
# reference/implementation.txt Phase 10.1 — that guidance predates the
# dependency versions actually pinned in requirements.txt (fastapi 0.141.1,
# pydantic 2.13.5, beanie 2.0.0, etc.), which have been built and fully
# tested (194 backend tests) exclusively against Python 3.14 throughout
# this project's whole audit history. Switching to 3.12 now would be an
# untested variable introduced at the least appropriate time (Docker
# packaging), not a like-for-like match of what's actually been verified.
FROM python:3.14-slim AS runtime

# Runs as a non-root user — never run the app as root in a container.
RUN groupadd --system app && useradd --system --gid app --home-dir /app --create-home app

WORKDIR /app

# Only requirements.txt copied in first so dependency installation is
# cached separately from application code changes.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Only the actual application package and its runtime data files — no
# tests/, venv/, .env, or docs (excluded by ../.dockerignore regardless,
# this is an explicit second layer of the same guarantee).
COPY backend/app ./app
COPY backend/data ./data
COPY backend/docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

# No --reload (that's a dev-only flag), no venv (dependencies are installed
# directly into the image's system Python). A single worker is intentional:
# this is a single-admin, low-traffic tournament scoreboard, not a
# high-concurrency service (see reference/plan.txt's architecture notes).
# The entrypoint runs the idempotent migration runner before starting
# uvicorn, so `docker compose up -d` alone brings a fresh database to a
# working state.
ENTRYPOINT ["./docker-entrypoint.sh"]
