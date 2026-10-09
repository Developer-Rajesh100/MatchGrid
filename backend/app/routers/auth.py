from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.deps import get_current_admin
from app.core.errors import TooManyRequestsError, UnauthorizedError
from app.core.rate_limit import login_rate_limiter
from app.core.security import create_access_token
from app.models import Admin
from app.schemas.auth import AdminOut, LoginRequest, TokenResponse
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
    """Exchange admin username/password for a bearer token (see this API's top-level description).
    Throttled per client IP after a few failed attempts (see app/core/rate_limit.py) —
    the first several failures are always free, so a mistyped password never blocks
    the real admin's next, correct attempt."""
    client_key = _client_key(request)
    wait = login_rate_limiter.seconds_until_allowed(client_key)
    if wait is not None:
        retry_after = int(wait) + 1
        raise TooManyRequestsError(
            f"Too many failed login attempts. Try again in {retry_after} second(s).",
            headers={"Retry-After": str(retry_after)},
        )

    admin = await authenticate_admin(payload.username, payload.password)
    if admin is None:
        login_rate_limiter.record_failure(client_key)
        raise UnauthorizedError("Invalid username or password")

    login_rate_limiter.record_success(client_key)
    token, expires_in = create_access_token(str(admin.id))
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=AdminOut)
async def me(admin: Admin = Depends(get_current_admin)) -> AdminOut:
    return AdminOut(id=str(admin.id), username=admin.username)
