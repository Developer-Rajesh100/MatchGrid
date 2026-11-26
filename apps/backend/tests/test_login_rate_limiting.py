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


async def test_client_ip_header_keeps_one_client_stable_across_rotating_proxies(async_client, admin, monkeypatch):
    """Behind Cloudflare + Render the proxy addresses in X-Forwarded-For change between requests;
    with CLIENT_IP_HEADER=cf-connecting-ip the throttle must still see one client."""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "client_ip_header", "cf-connecting-ip")
    bad = {"username": "testadmin", "password": "wrong-password"}
    statuses = []
    for i in range(10):
        r = await async_client.post(
            "/api/auth/login",
            json=bad,
            headers={"CF-Connecting-IP": "203.0.113.50", "X-Forwarded-For": f"203.0.113.50, 172.70.0.{i}"},
        )
        statuses.append(r.status_code)
    assert 429 in statuses
    # A different real client is not caught by that throttle.
    other = await async_client.post(
        "/api/auth/login",
        json={"username": "testadmin", "password": "testpass123"},
        headers={"CF-Connecting-IP": "203.0.113.51"},
    )
    assert other.status_code == 200


def test_client_ip_header_is_ignored_unless_configured(monkeypatch):
    from starlette.requests import Request

    from app.core.config import get_settings
    from app.core.rate_limit import client_key

    def request(headers):
        return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()], "client": ("10.9.9.9", 1)})

    spoofed = {"CF-Connecting-IP": "1.1.1.1", "X-Forwarded-For": "198.51.100.7"}
    monkeypatch.setattr(get_settings(), "client_ip_header", "")
    monkeypatch.setattr(get_settings(), "trusted_proxy_hops", 1)
    assert client_key(request(spoofed)) == "198.51.100.7"
    monkeypatch.setattr(get_settings(), "client_ip_header", "CF-Connecting-IP")
    assert client_key(request(spoofed)) == "1.1.1.1"
    # Configured but absent: fall back to X-Forwarded-For, then the socket peer.
    assert client_key(request({"X-Forwarded-For": "198.51.100.7"})) == "198.51.100.7"
    assert client_key(request({})) == "10.9.9.9"
