import logging
import time

from fastapi import FastAPI, Request

logger = logging.getLogger("dcl")


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level="INFO",
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.setLevel(level)
    # pymongo/motor emit very chatty DEBUG logs (every command + heartbeat) —
    # keep them quiet even when our own app logger is at DEBUG.
    logging.getLogger("pymongo").setLevel(logging.WARNING)


def register_request_logging(app: FastAPI) -> None:
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response
