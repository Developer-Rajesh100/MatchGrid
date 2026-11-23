"""Fail-fast production config checks — per implementation.txt Phase 9.2/9.3.
Pure unit tests against Settings instances; no DB needed."""

import pytest

from app.core.config import Settings
from app.core.production_safety import (
    assert_safe_for_production,
    check_bootstrap_password,
    check_runtime_config,
)


def _settings(**overrides) -> Settings:
    defaults = dict(
        environment="production",
        jwt_secret="a-genuinely-long-random-production-secret-value-1234",
        admin_bootstrap_password="a-genuinely-strong-production-password",
        cors_origins="https://scoreboard.example.com",
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_dev_environment_is_never_checked():
    """The whole point: these checks are a no-op outside production, so
    local dev keeps working with the repo's own placeholder values."""
    settings = _settings(
        environment="development",
        jwt_secret="dev-only-local-secret-not-for-production",
        admin_bootstrap_password="dcl-dev-admin-password",
        cors_origins="http://localhost:5173",
    )
    assert check_runtime_config(settings) == []
    assert check_bootstrap_password(settings) == []
    assert_safe_for_production(settings)  # must not raise


def test_production_with_good_config_passes_clean():
    settings = _settings()
    assert check_runtime_config(settings) == []
    assert check_bootstrap_password(settings) == []
    assert_safe_for_production(settings)  # must not raise


@pytest.mark.parametrize(
    "bad_secret",
    ["change-me-in-.env", "replace-with-a-long-random-value", "dev-only-local-secret-not-for-production"],
)
def test_production_rejects_every_known_placeholder_jwt_secret(bad_secret):
    settings = _settings(jwt_secret=bad_secret)
    problems = check_runtime_config(settings)
    assert any("JWT_SECRET" in p for p in problems)
    with pytest.raises(RuntimeError):
        assert_safe_for_production(settings)


def test_production_rejects_a_short_jwt_secret_even_if_not_a_known_placeholder():
    settings = _settings(jwt_secret="short")
    problems = check_runtime_config(settings)
    assert any("JWT_SECRET" in p for p in problems)


@pytest.mark.parametrize(
    "bad_password",
    ["change-me-in-.env", "replace-with-a-strong-password", "dcl-dev-admin-password"],
)
def test_production_rejects_every_known_placeholder_admin_password(bad_password):
    settings = _settings(admin_bootstrap_password=bad_password)
    problems = check_bootstrap_password(settings)
    assert len(problems) == 1


def test_production_rejects_the_dev_cors_origin():
    settings = _settings(cors_origins="http://localhost:5173")
    problems = check_runtime_config(settings)
    assert any("CORS_ORIGINS" in p for p in problems)


def test_production_rejects_dev_cors_origin_mixed_in_with_real_ones():
    settings = _settings(cors_origins="https://scoreboard.example.com,http://localhost:5173")
    problems = check_runtime_config(settings)
    assert any("CORS_ORIGINS" in p for p in problems)


def test_bootstrap_password_check_is_separate_from_runtime_check():
    """A bad admin password alone must not fail the runtime (JWT/CORS)
    check — it's validated at its own point of use (migration time)."""
    settings = _settings(admin_bootstrap_password="dcl-dev-admin-password")
    assert check_runtime_config(settings) == []  # JWT/CORS are fine
    assert check_bootstrap_password(settings) != []  # but the password isn't
