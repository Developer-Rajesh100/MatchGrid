"""Fail-fast checks that a dev/placeholder secret or CORS origin can never
reach a production run, per implementation.txt Phase 9.2/9.3, hardened in Phase 7.

Every value listed below is a real string that exists in this repo's own
committed dev files (backend/.env, backend/.env.example, and this module's
own defaults in app/core/config.py) — the point isn't to guess what "weak"
looks like in general, it's to make sure the exact placeholders anyone
would find by reading this codebase can never quietly end up running an
`ENVIRONMENT=production` deployment.
"""

import re
from ipaddress import ip_address
from urllib.parse import urlsplit

from app.core.config import Settings

_KNOWN_DEV_JWT_SECRETS = {
    "change-me-in-.env",
    "replace-with-a-long-random-value",
    "dev-only-local-secret-not-for-production",
}
_KNOWN_DEV_ADMIN_PASSWORDS = {
    "change-me-in-.env",
    "replace-with-a-strong-password",
    "dcl-dev-admin-password",
    "change-me-strong-password",
    "ci-test-secret-key-for-automated-playwright-runs",
    "password",
    "password123",
    "admin",
    "admin123",
    "changeme",
    "change-me",
    "matchgrid",
}
_KNOWN_DEV_MONGO_PASSWORDS = {"change-me-strong-password", "change-me-in-.env", "password"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal"}

MIN_JWT_SECRET_LENGTH = 32
MIN_ADMIN_PASSWORD_LENGTH = 12


def _is_local_host(host: str) -> bool:
    host = (host or "").strip("[]").lower()
    if host in _LOCAL_HOSTS or host.endswith(".localhost") or host.endswith(".local"):
        return True
    try:
        addr = ip_address(host)
    except ValueError:
        return False
    return addr.is_loopback or addr.is_unspecified or addr.is_private


def check_cors_origins(origins: list[str]) -> list[str]:
    """Every production origin must be an exact, public https origin: no wildcard, no
    localhost / loopback / private address, no plain http, and no path."""
    if not origins:
        return ["CORS_ORIGINS is empty — set it to the deployed frontend origin(s), e.g. https://app.example.com."]
    problems: list[str] = []
    for origin in origins:
        if "*" in origin:
            problems.append(f"CORS_ORIGINS contains a wildcard ({origin}) — list exact origins only.")
            continue
        parts = urlsplit(origin)
        if parts.scheme != "https":
            problems.append(f"CORS_ORIGINS entry {origin!r} must use https:// in production.")
        elif not parts.hostname:
            problems.append(f"CORS_ORIGINS entry {origin!r} is not a valid origin.")
        elif _is_local_host(parts.hostname):
            problems.append(f"CORS_ORIGINS entry {origin!r} points at a local/private host — use the real frontend domain.")
        elif parts.path not in ("", "/") or parts.query or parts.fragment:
            problems.append(f"CORS_ORIGINS entry {origin!r} must be an origin only (scheme://host[:port]), without a path.")
    return problems


def check_mongo_uri(uri: str) -> list[str]:
    """Production must talk to a real database host, never the localhost / template URI."""
    try:
        parts = urlsplit(uri)
    except ValueError:
        return ["MONGO_URI is not a valid URI."]
    if parts.scheme not in ("mongodb", "mongodb+srv"):
        return ["MONGO_URI must start with mongodb:// or mongodb+srv://."]
    # a replica-set URI has several comma-separated hosts: check each one
    hosts = [h.rsplit("@", 1)[-1] for h in parts.netloc.split(",") if h]
    hosts = [re.sub(r":\d+$", "", h) for h in hosts]
    if not hosts or any(_is_local_host(h) for h in hosts):
        return ["MONGO_URI points at localhost/a private address — use the managed database (e.g. MongoDB Atlas)."]
    if parts.password in _KNOWN_DEV_MONGO_PASSWORDS:
        return ["MONGO_URI still contains a known placeholder database password."]
    if not parts.password and parts.scheme == "mongodb+srv":
        return ["MONGO_URI has no credentials — Atlas requires a database user and password."]
    return []


def check_runtime_config(settings: Settings) -> list[str]:
    """Checks that only apply once the app is actually serving requests:
    JWT signing, CORS, DEBUG, database, proxy hops, seeding and R2 media storage. (The admin
    bootstrap password is checked separately, at migration time — see check_bootstrap_password
    below — since it's only relevant then, not on every app start.)"""
    if settings.environment != "production":
        return []

    problems: list[str] = []
    if settings.jwt_secret in _KNOWN_DEV_JWT_SECRETS:
        problems.append("JWT_SECRET is still set to a known placeholder/dev value.")
    elif len(settings.jwt_secret) < MIN_JWT_SECRET_LENGTH:
        problems.append(
            f"JWT_SECRET is only {len(settings.jwt_secret)} characters — "
            f"use at least {MIN_JWT_SECRET_LENGTH} random characters in production."
        )

    problems.extend(check_cors_origins(settings.cors_origin_list))
    problems.extend(check_mongo_uri(settings.mongo_uri))

    if settings.debug:
        problems.append("DEBUG must be false in production (set DEBUG=false).")

    if settings.auto_seed:
        problems.append("AUTO_SEED must be false in production (set AUTO_SEED=false) so no sample data is inserted.")

    if settings.trusted_proxy_hops < 1:
        problems.append(
            "TRUSTED_PROXY_HOPS must be at least 1 in production: the API runs behind the platform's proxy, "
            "and 0 would throttle every user as the proxy's single address."
        )

    missing_r2 = [
        name
        for name, value in (
            ("R2_ACCOUNT_ID", settings.r2_account_id),
            ("R2_ACCESS_KEY_ID", settings.r2_access_key_id),
            ("R2_SECRET_ACCESS_KEY", settings.r2_secret_access_key),
            ("R2_BUCKET_NAME", settings.r2_bucket_name),
            ("R2_PUBLIC_BASE_URL", settings.r2_public_base_url),
        )
        if not value
    ]
    if missing_r2:
        problems.append(f"Cloudflare R2 media storage is not configured: set {', '.join(missing_r2)}.")
    elif not settings.r2_public_base_url.startswith("https://"):
        problems.append("R2_PUBLIC_BASE_URL must be an https:// URL so media loads on an https site.")

    return problems


def check_bootstrap_password(settings: Settings) -> list[str]:
    """Checked at migration time (app/migrations/m0003_bootstrap_admin.py),
    since ADMIN_BOOTSTRAP_PASSWORD is only ever consumed there — refusing to
    ever create the one production admin account with a known dev password."""
    if settings.environment != "production":
        return []

    password = settings.admin_bootstrap_password
    if password.lower() in _KNOWN_DEV_ADMIN_PASSWORDS:
        return ["ADMIN_BOOTSTRAP_PASSWORD is still set to a known placeholder/dev value."]
    if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        return [f"ADMIN_BOOTSTRAP_PASSWORD must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters in production."]
    if password.lower() == settings.admin_bootstrap_username.lower():
        return ["ADMIN_BOOTSTRAP_PASSWORD must not equal the admin username."]
    return []


def assert_safe_for_production(settings: Settings) -> None:
    problems = check_runtime_config(settings)
    if problems:
        raise RuntimeError(
            "Refusing to start with ENVIRONMENT=production and insecure config:\n"
            + "\n".join(f"  - {p}" for p in problems)
        )
