"""Fail-fast checks that a dev/placeholder secret or CORS origin can never
reach a production run, per implementation.txt Phase 9.2/9.3.

Every value listed below is a real string that exists in this repo's own
committed dev files (backend/.env, backend/.env.example, and this module's
own defaults in app/core/config.py) — the point isn't to guess what "weak"
looks like in general, it's to make sure the exact placeholders anyone
would find by reading this codebase can never quietly end up running an
`ENVIRONMENT=production` deployment.
"""

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
}
_KNOWN_DEV_CORS_ORIGINS = {"http://localhost:5173"}

MIN_JWT_SECRET_LENGTH = 32


def check_runtime_config(settings: Settings) -> list[str]:
    """Checks that only apply once the app is actually serving requests:
    JWT signing, CORS, DEBUG and R2 media storage. (The admin bootstrap password is checked
    separately, at migration time — see check_bootstrap_password below —
    since it's only relevant then, not on every app start.)"""
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

    if any(origin in _KNOWN_DEV_CORS_ORIGINS for origin in settings.cors_origin_list):
        problems.append(
            "CORS_ORIGINS still includes the local dev origin (http://localhost:5173) "
            "— restrict it to the real deployed frontend domain(s)."
        )

    if settings.debug:
        problems.append("DEBUG must be false in production (set DEBUG=false).")

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

    return problems


def check_bootstrap_password(settings: Settings) -> list[str]:
    """Checked at migration time (app/migrations/m0003_bootstrap_admin.py),
    since ADMIN_BOOTSTRAP_PASSWORD is only ever consumed there — refusing to
    ever create the one production admin account with a known dev password."""
    if settings.environment != "production":
        return []

    if settings.admin_bootstrap_password in _KNOWN_DEV_ADMIN_PASSWORDS:
        return ["ADMIN_BOOTSTRAP_PASSWORD is still set to a known placeholder/dev value."]
    return []


def assert_safe_for_production(settings: Settings) -> None:
    problems = check_runtime_config(settings)
    if problems:
        raise RuntimeError(
            "Refusing to start with ENVIRONMENT=production and insecure config:\n"
            + "\n".join(f"  - {p}" for p in problems)
        )
