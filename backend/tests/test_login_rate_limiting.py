"""Login throttling: a few failed attempts must never block the real admin's
next correct attempt; sustained failures must eventually be throttled with
a 429 + Retry-After. Per implementation.txt Phase 9.1."""

from app.core.rate_limit import FREE_ATTEMPTS, login_rate_limiter


async def test_a_few_failed_attempts_do_not_block_the_correct_password(async_client, admin):
    for _ in range(FREE_ATTEMPTS - 1):
        response = await async_client.post(
            "/api/auth/login", json={"username": "testadmin", "password": "wrong"}
        )
        assert response.status_code == 401

    response = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"}
    )
    assert response.status_code == 200


async def test_sustained_failures_are_throttled_with_429_and_retry_after(async_client, admin):
    for _ in range(FREE_ATTEMPTS + 2):
        await async_client.post("/api/auth/login", json={"username": "testadmin", "password": "wrong"})

    response = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "wrong"}
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers
    assert int(response.headers["Retry-After"]) >= 1


async def test_throttling_blocks_even_the_correct_password_once_triggered(async_client, admin):
    """Once genuinely throttled (sustained failures), the block is IP-based,
    not account-based — even the correct password is refused until the
    backoff window passes, by design (see rate_limit.py's docstring)."""
    for _ in range(FREE_ATTEMPTS + 2):
        await async_client.post("/api/auth/login", json={"username": "testadmin", "password": "wrong"})

    response = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"}
    )
    assert response.status_code == 429


async def test_a_successful_login_resets_the_failure_count(async_client, admin):
    for _ in range(FREE_ATTEMPTS - 1):
        await async_client.post("/api/auth/login", json={"username": "testadmin", "password": "wrong"})

    ok = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"}
    )
    assert ok.status_code == 200

    # The slate is clean again — another run of free attempts is allowed.
    for _ in range(FREE_ATTEMPTS - 1):
        response = await async_client.post(
            "/api/auth/login", json={"username": "testadmin", "password": "wrong"}
        )
        assert response.status_code == 401
    still_ok = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"}
    )
    assert still_ok.status_code == 200


def test_limiter_unit_behavior_directly():
    limiter = login_rate_limiter
    limiter.reset()
    key = "1.2.3.4"

    assert limiter.seconds_until_allowed(key) is None
    for _ in range(FREE_ATTEMPTS):
        limiter.record_failure(key)
    assert limiter.seconds_until_allowed(key) is None  # still within free attempts

    limiter.record_failure(key)  # one over the free budget
    wait = limiter.seconds_until_allowed(key)
    assert wait is not None and wait > 0

    limiter.record_success(key)
    assert limiter.seconds_until_allowed(key) is None
    limiter.reset()


async def test_spoofed_leftmost_forwarded_for_cannot_dodge_the_throttle(async_client, admin):
    """A client rotating a fake leftmost X-Forwarded-For must still be throttled, because the
    trusted entry is the one our proxy appended (the rightmost)."""
    bad = {"username": "testadmin", "password": "wrong-password"}
    statuses = []
    for i in range(10):
        r = await async_client.post(
            "/api/auth/login", json=bad, headers={"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.9"}
        )
        statuses.append(r.status_code)
    assert 429 in statuses


async def test_different_real_clients_behind_the_proxy_are_throttled_separately(async_client, admin):
    bad = {"username": "testadmin", "password": "wrong-password"}
    for _ in range(10):
        await async_client.post("/api/auth/login", json=bad, headers={"X-Forwarded-For": "198.51.100.1"})
    blocked = await async_client.post("/api/auth/login", json=bad, headers={"X-Forwarded-For": "198.51.100.1"})
    assert blocked.status_code == 429
    good = await async_client.post(
        "/api/auth/login", json={"username": "testadmin", "password": "testpass123"},
        headers={"X-Forwarded-For": "198.51.100.2"},
    )
    assert good.status_code == 200
