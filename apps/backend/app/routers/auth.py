from fastapi import APIRouter, Depends, Request

from app.core.deps import get_current_user
from app.core.errors import TooManyRequestsError, UnauthorizedError
from app.core.rate_limit import client_key, login_rate_limiter
from app.core.security import create_access_token
from app.models import User, UserRole
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.auth import authenticate_admin
from app.services.serializers import user_to_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request) -> TokenResponse:
    """Exchange username/password for a bearer token. Supports SUPER_ADMIN,
    ORGANIZER, and SCORER accounts."""
    key = client_key(request)
    wait = login_rate_limiter.seconds_until_allowed(key)
    if wait is not None:
        retry_after = int(wait) + 1
        raise TooManyRequestsError(
            f"Too many failed login attempts. Try again in {retry_after} second(s).",
            headers={"Retry-After": str(retry_after)},
        )

    user = await authenticate_admin(payload.username, payload.password)
    if user is None:
        login_rate_limiter.record_failure(key)
        raise UnauthorizedError("Invalid username or password")

    login_rate_limiter.record_success(key)
    token, expires_in = create_access_token(str(user.id))
    role = getattr(user, "role", UserRole.SUPER_ADMIN)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=expires_in,
        role=role,
        user_id=str(user.id),
        username=user.username,
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return user_to_out(user)
