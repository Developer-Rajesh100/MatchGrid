"""IP-based login throttling with exponential backoff.

Deliberately NOT an account lockout: locking an account after failed logins would let anyone
lock a scorer or organizer out in the middle of a live match. Throttling is keyed by client IP
instead, and the first few failures are always free so a mistyped password never blocks anyone.
"""

import time

from starlette.requests import Request

from app.core.config import get_settings


def client_ip_headers() -> list[str]:
    """CLIENT_IP_HEADER as an ordered, lowercase list: a single header or a comma-separated
    fallback list such as "cf-connecting-ip,true-client-ip"."""
    return [h.strip().lower() for h in get_settings().client_ip_header.split(",") if h.strip()]


def resolve_client(request: Request) -> tuple[str, str]:
    """(client address, source) used for login throttling.

    1. Each CLIENT_IP_HEADER entry in order (opt-in), e.g. Cloudflare's cf-connecting-ip: a value
       the edge proxy overwrites, so it is stable per client even when the request crosses
       several proxies whose own addresses vary between requests. Source: "header:<name>".
    2. Otherwise X-Forwarded-For, which is client-controlled except for what our own proxies
       append: the trustworthy entry is the one `trusted_proxy_hops` places from the right
       (never the leftmost, which an attacker can set to any value). Source: "x-forwarded-for".
    3. Otherwise the socket peer. Source: "socket"."""
    for name in client_ip_headers():
        value = request.headers.get(name, "").split(",")[0].strip()
        if value:
            return value, f"header:{name}"
    hops = get_settings().trusted_proxy_hops
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if hops > 0 and len(forwarded) >= hops:
        return forwarded[-hops], "x-forwarded-for"
    return (request.client.host if request.client else "unknown"), "socket"


def client_key(request: Request) -> str:
    """The client address used as the login throttle key (see resolve_client)."""
    return resolve_client(request)[0]


FREE_ATTEMPTS = 5  # this many failures from one IP cost nothing
BASE_DELAY_SECONDS = 1
MAX_DELAY_SECONDS = 60


class LoginRateLimiter:
    def __init__(self) -> None:
        self._attempts: dict[str, int] = {}
        self._blocked_until: dict[str, float] = {}

    def seconds_until_allowed(self, key: str) -> float | None:
        """None if a login attempt from this key is currently allowed,
        otherwise how many seconds until it will be."""
        blocked_until = self._blocked_until.get(key)
        if blocked_until is None:
            return None
        remaining = blocked_until - time.monotonic()
        return remaining if remaining > 0 else None

    def record_failure(self, key: str) -> None:
        attempts = self._attempts.get(key, 0) + 1
        self._attempts[key] = attempts
        if attempts > FREE_ATTEMPTS:
            delay = min(BASE_DELAY_SECONDS * 2 ** (attempts - FREE_ATTEMPTS - 1), MAX_DELAY_SECONDS)
            self._blocked_until[key] = time.monotonic() + delay

    def record_success(self, key: str) -> None:
        self._attempts.pop(key, None)
        self._blocked_until.pop(key, None)

    def reset(self) -> None:
        """Test-only: clear all state between test runs."""
        self._attempts.clear()
        self._blocked_until.clear()


login_rate_limiter = LoginRateLimiter()
