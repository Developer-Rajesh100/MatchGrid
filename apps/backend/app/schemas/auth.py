from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: Optional[UserRole] = None
    user_id: Optional[str] = None
    username: Optional[str] = None


class AdminOut(BaseModel):
    id: str
    username: str
    role: Optional[str] = "SUPER_ADMIN"


class UserOut(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    role: UserRole
    organization_name: Optional[str] = None
    created_by: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None


class OrganizerCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    email: Optional[str] = None
    organization_name: Optional[str] = None


class ScorerCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class UserStatusUpdate(BaseModel):
    is_active: bool
