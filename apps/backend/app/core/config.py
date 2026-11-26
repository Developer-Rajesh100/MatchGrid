from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "MatchGrid API"
    environment: str = "development"
    debug: bool = True

    # Database
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "matchgrid"

    # Startup bootstrap (see app/core/bootstrap.py): run pending migrations before serving requests.
    auto_migrate: bool = True

    # Auth
    jwt_secret: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 720  # 12 hours

    # Bootstrap admin (created on first migration run if no admin exists)
    admin_bootstrap_username: str = "admin"
    admin_bootstrap_password: str = "change-me-in-.env"

    # Number of reverse proxies in front of the app that append to X-Forwarded-For
    # (DigitalOcean App Platform / the bundled nginx = 1). The client IP used for login
    # throttling is the address that the Nth-nearest proxy appended — the only part of the
    # header a client cannot forge. Use 0 when the app is reached directly (no proxy).
    trusted_proxy_hops: int = 1

    # Opt-in: a header that an edge proxy always overwrites with the real client IP, e.g.
    # "cf-connecting-ip" when every request passes through Cloudflare (Render does this). A
    # comma-separated list ("cf-connecting-ip,true-client-ip") is tried in order. The first one
    # present wins over X-Forwarded-For. GET /api/superadmin/debug/client-ip shows what is keyed. Only set it if clients cannot reach the app around
    # that proxy, or they could forge the header to dodge the login throttle.
    client_ip_header: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Name of the default tournament created by migration 0002 on a fresh database
    tournament_name: str = "MatchGrid"
    tournament_season: str = "1"

    # Cloudflare R2 Media Storage
    # No defaults on purpose: credentials must come from the environment (.env locally,
    # platform secrets in production). With any of these empty, uploads report 503.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_base_url: str = ""

    @property
    def r2_endpoint_url(self) -> str:
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return ""

    @property
    def is_r2_configured(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket_name
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
