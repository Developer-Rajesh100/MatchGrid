import time

from fastapi import APIRouter, HTTPException

from app.core.database import ping_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db() -> dict:
    """Public probe: reports only whether the database answers, and how fast. Document counts
    are internal data and live behind the superadmin API (GET /api/superadmin/db-stats)."""
    started = time.perf_counter()
    try:
        await ping_db()
    except Exception as exc:  # pragma: no cover - the detail is logged, not echoed to the public
        raise HTTPException(status_code=503, detail="database unreachable") from exc
    return {"status": "connected", "ping_ms": round((time.perf_counter() - started) * 1000, 1)}
