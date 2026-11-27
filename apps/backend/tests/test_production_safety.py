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
        debug=False,
        r2_account_id="acct",
        r2_access_key_id="key",
        r2_secret_access_key="secret",
        r2_bucket_name="bucket",
        r2_public_base_url="https://cdn.example.com",
        mongo_uri="mongodb+srv://matchgrid_user:s3cr3t-Pass@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority",
        trusted_proxy_hops=1,
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


def test_production_rejects_debug_mode():
    problems = check_runtime_config(_settings(debug=True))
    assert any("DEBUG" in p for p in problems)


@pytest.mark.parametrize(
    "missing",
    ["r2_account_id", "r2_access_key_id", "r2_secret_access_key", "r2_bucket_name", "r2_public_base_url"],
)
def test_production_requires_every_r2_setting(missing):
    settings = _settings(**{missing: ""})
    problems = check_runtime_config(settings)
    assert any(missing.upper() in p for p in problems)
    with pytest.raises(RuntimeError):
        assert_safe_for_production(settings)


def test_r2_credentials_have_no_built_in_defaults():
    """Regression (audit C1): real credentials were once baked into config.py."""
    settings = Settings(_env_file=None)
    assert settings.r2_account_id == ""
    assert settings.r2_access_key_id == ""
    assert settings.r2_secret_access_key == ""
    assert settings.is_r2_configured is False


# ---- Phase 7 hardening -----------------------------------------------------------------------

@pytest.mark.parametrize(
    "origins",
    [
        "*",
        "https://*.example.com",
        "http://scoreboard.example.com",  # plain http
        "http://localhost:5173",
        "https://localhost:3000",  # any localhost, any port
        "https://127.0.0.1:5173",
        "https://192.168.1.20",  # private address
        "https://[::1]:5173",
        "https://0.0.0.0",
        "https://app.example.com/dashboard",  # a path, not an origin
        "app.example.com",  # no scheme
        "",
    ],
)
def test_production_rejects_unsafe_cors_origins(origins):
    problems = check_runtime_config(_settings(cors_origins=origins))
    assert any("CORS_ORIGINS" in p for p in problems), origins


def test_production_accepts_several_exact_https_origins_and_a_trailing_slash():
    settings = _settings(cors_origins="https://app.example.com, https://www.example.com:8443/")
    assert check_runtime_config(settings) == []


def test_every_bad_origin_is_reported_not_just_the_first():
    problems = check_runtime_config(_settings(cors_origins="*,http://localhost:5173,https://ok.example.com"))
    assert len([p for p in problems if "CORS_ORIGINS" in p]) == 2


@pytest.mark.parametrize(
    "uri",
    [
        "mongodb://localhost:27017",
        "mongodb://matchgrid_admin:s3cr3t-Pass@127.0.0.1:27018/?authSource=admin",
        "mongodb://matchgrid_admin:s3cr3t-Pass@[::1]:27017",
        "mongodb://user:s3cr3t-Pass@10.0.0.5:27017",  # private address
        "mongodb://matchgrid_admin:change-me-strong-password@db.example.com:27017",  # template password
        "mongodb+srv://cluster0.abcde.mongodb.net",  # Atlas with no credentials
        "postgres://user:pw@db.example.com/x",  # wrong database entirely
    ],
)
def test_production_rejects_a_local_or_template_mongo_uri(uri):
    problems = check_runtime_config(_settings(mongo_uri=uri))
    assert any("MONGO_URI" in p for p in problems), uri


def test_production_accepts_a_replica_set_uri():
    uri = "mongodb://u:s3cr3t-Pass@h1.example.com:27017,h2.example.com:27017/?replicaSet=rs0"
    assert check_runtime_config(_settings(mongo_uri=uri)) == []


def test_production_rejects_replica_set_with_one_local_member():
    uri = "mongodb://u:s3cr3t-Pass@h1.example.com:27017,localhost:27017/?replicaSet=rs0"
    assert any("MONGO_URI" in p for p in check_runtime_config(_settings(mongo_uri=uri)))


@pytest.mark.parametrize("hops", [0, -1])
def test_production_requires_at_least_one_trusted_proxy_hop(hops):
    assert any("TRUSTED_PROXY_HOPS" in p for p in check_runtime_config(_settings(trusted_proxy_hops=hops)))


def test_production_requires_an_https_r2_public_url():
    assert any("R2_PUBLIC_BASE_URL" in p for p in check_runtime_config(_settings(r2_public_base_url="http://cdn.example.com")))


@pytest.mark.parametrize("weak", ["short-pw-1", "Password", "ADMIN", "change-me-STRONG-password", "x" * 11])
def test_bootstrap_password_must_be_long_and_not_a_known_value(weak):
    assert len(check_bootstrap_password(_settings(admin_bootstrap_password=weak))) == 1


def test_bootstrap_password_may_not_equal_the_username():
    settings = _settings(admin_bootstrap_username="superadmin-account", admin_bootstrap_password="superadmin-account")
    assert len(check_bootstrap_password(settings)) == 1


def test_all_problems_are_listed_together_in_the_startup_error():
    settings = _settings(debug=True, trusted_proxy_hops=0, cors_origins="*")
    with pytest.raises(RuntimeError) as exc:
        assert_safe_for_production(settings)
    message = str(exc.value)
    for needle in ("DEBUG", "TRUSTED_PROXY_HOPS", "CORS_ORIGINS"):
        assert needle in message


def test_the_ci_and_dev_values_in_this_repo_can_never_pass_in_production():
    """The exact strings the repo ships in .env.example and the CI workflow must all be refused."""
    settings = _settings(
        jwt_secret="ci-test-secret-key-for-automated-playwright-runs",
        cors_origins="http://localhost:5173",
        mongo_uri="mongodb://matchgrid_admin:change-me-strong-password@localhost:27017/?authSource=admin",
        admin_bootstrap_password="replace-with-a-strong-password",
        debug=True,
    )
    # http CORS origin, localhost Mongo, DEBUG (and the weak bootstrap password below).
    assert len(check_runtime_config(settings)) >= 3
    assert check_bootstrap_password(settings)
