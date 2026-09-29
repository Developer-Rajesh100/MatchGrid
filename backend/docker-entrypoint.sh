#!/bin/sh
# Runs the idempotent migration runner (safe to run on every container start
# — each migration tracks whether it's already applied) before starting the
# server, so `docker compose up -d` alone is enough to get a fresh database
# to a working state, matching reference/implementation.txt Phase 10's
# expected outcome.
set -e

echo "Running database migrations..."
python -m app.migrations.runner

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
