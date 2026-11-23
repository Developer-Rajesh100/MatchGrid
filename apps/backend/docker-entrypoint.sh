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

# The per-IP login throttle reads the real client IP from X-Forwarded-For itself (see
# TRUSTED_PROXY_HOPS in app/core/config.py); uvicorn must NOT be told to trust that header
# from everyone, or a client could spoof it to dodge the throttle.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
