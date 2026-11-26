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

# The per-IP login throttle reads the real client IP itself (CLIENT_IP_HEADER, else
# X-Forwarded-For with TRUSTED_PROXY_HOPS; see app/core/rate_limit.py); uvicorn must NOT be told
# to trust forwarded headers from everyone, or a client could spoof them to dodge the throttle.
# Exactly ONE worker, pinned: uvicorn would otherwise start $WEB_CONCURRENCY workers when a
# platform sets that variable, and each worker keeps its own WebSocket rooms and login throttle
# (a goal would only reach spectators on the same worker; bad logins would spread across
# throttles). See "Scaling constraints" in DEPLOYMENT.md.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
