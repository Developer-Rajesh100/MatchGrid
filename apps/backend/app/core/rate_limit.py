"""IP-based login throttling with exponential backoff.

Deliberately NOT an account lockout: this system has exactly one admin
account (see docs/DATABASE_DESIGN.md §2, reference/plan.txt §8), so a
lockout tied to the account itself would be a self-inflicted denial-of-
service — anyone (or any bug) that fails the password enough times could
lock out the one legitimate operator during a live tournament. Throttling
is keyed by client IP instead, and the first few failures are always free
(a real admin mistyping their password a couple of times must never be
blocked), per implementation.txt Phase 9.1.
"""

import time

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
