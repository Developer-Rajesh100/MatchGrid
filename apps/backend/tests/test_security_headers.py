"""Baseline hardening headers are present on API responses."""


async def test_security_headers_present(async_client):
    r = await async_client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "strict-origin-when-cross-origin"
