from datetime import datetime, timezone

from beanie import Document, Indexed
from pydantic import Field
from pymongo import IndexModel


class Admin(Document):
    username: Indexed(str, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "admins"
        indexes = [IndexModel("username", unique=True)]
