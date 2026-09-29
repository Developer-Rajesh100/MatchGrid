from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_name: str = "DCL Scoreboard API"
    environment: str = "development"
    debug: bool = True

    # Database
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "dcl_scoreboard"

    # Auth
    jwt_secret: str = "change-me-in-.env"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 720  # 12 hours

    # Bootstrap admin (created on first migration run if no admin exists)
    admin_bootstrap_username: str = "admin"
    admin_bootstrap_password: str = "change-me-in-.env"

    # CORS
    cors_origins: str = "http://localhost:5173"

    # Tournament (seed defaults)
    tournament_name: str = "DCL Season 5"
    tournament_season: str = "5"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
