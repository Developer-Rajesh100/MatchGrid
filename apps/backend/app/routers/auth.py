from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.errors import TooManyRequestsError, UnauthorizedError
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token
from app.models import User, UserRole
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.auth import authenticate_admin

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_key(request: Request) -> str:
    """The client IP used for login throttling.

    X-Forwarded-For is client-controlled except for what our own proxies append, so the
    trustworthy entry is the one `trusted_proxy_hops` places from the right (never the
    leftmost, which an attacker can set to any value to dodge the throttle)."""
    hops = get_settings().trusted_proxy_hops
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops]
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request) -> TokenResponse:
    """Exchange username/password for a bearer token. Supports SUPER_ADMIN,
    ORGANIZER, and SCORER accounts."""
    client_key = _client_key(request)
    wait = login_rate_limiter.seconds_until_allowed(client_key)
    if wait is not None:
        retry_after = int(wait) + 1
        raise TooManyRequestsError(
            f"Too many failed login attempts. Try again in {retry_after} second(s).",
            headers={"Retry-After": str(retry_after)},
        )

    user = await authenticate_admin(payload.username, payload.password)
    if user is None:
        login_rate_limiter.record_failure(client_key)
        raise UnauthorizedError("Invalid username or password")

    login_rate_limiter.record_success(client_key)
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
    return UserOut(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        organization_name=user.organization_name,
        created_by=str(user.created_by) if user.created_by else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )
