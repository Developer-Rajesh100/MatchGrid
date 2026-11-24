from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from beanie import Document, PydanticObjectId
from pydantic import Field
from pymongo import IndexModel


class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ORGANIZER = "ORGANIZER"
    SCORER = "SCORER"


class User(Document):
    username: str
    email: Optional[str] = None
    password_hash: str
    role: UserRole
    organization_name: Optional[str] = None
    created_by: Optional[PydanticObjectId] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "users"
        indexes = [
            IndexModel("username", unique=True),
            IndexModel(
                [("email", 1)],
                unique=True,
                partialFilterExpression={"email": {"$type": "string"}},
            ),
            IndexModel("role"),
            IndexModel("created_by"),
            IndexModel("is_active"),
        ]
