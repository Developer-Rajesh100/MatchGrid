from fastapi import APIRouter, HTTPException

from app.core.database import ping_db
from app.models import DOCUMENT_MODELS

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/health/db")
async def health_db() -> dict:
    try:
        await ping_db()
    except Exception as exc:  # pragma: no cover - surfaced to the caller
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}") from exc

    counts = {}
    for model in DOCUMENT_MODELS:
        counts[model.Settings.name] = await model.find_all().count()

    return {"status": "connected", "collections": counts}
