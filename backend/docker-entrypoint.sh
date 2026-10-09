#!/bin/sh
# With arguments: runs them instead (e.g. the DigitalOcean PRE_DEPLOY job runs
# `python -m app.migrations.runner`). Without: starts the server.
#
# Migrations + create-only data seeding are NOT run here: app/main.py's
# lifespan does it (under a Mongo lock, so concurrent instances can't race)
# before the server accepts any request. The port comes from $PORT when the
# platform sets it, else 8000.
set -e

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# --proxy-headers/--forwarded-allow-ips: the container is only reachable through the
# platform's reverse proxy (DigitalOcean / nginx), so trust its X-Forwarded-For. Without
# this every visitor shares the proxy's IP and the per-IP login throttle would let anyone
# lock the admin out by failing a few logins.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips "*"
