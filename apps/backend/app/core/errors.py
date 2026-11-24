"""App-level exceptions mapped to consistent HTTP error responses.

Every error body has the shape {"detail": "<message>"}, matching FastAPI's
default HTTPException shape (see docs/API_PLAN.md §10) so callers only ever
deal with one error format, whether the failure came from Pydantic request
validation, an app-level rule, or an unexpected 500.
"""

from bson.errors import InvalidId
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    status_code = 400

    def __init__(self, detail: str, headers: dict[str, str] | None = None):
        self.detail = detail
        self.headers = headers
        super().__init__(detail)


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class ValidationAppError(AppError):
    status_code = 400


class UnauthorizedError(AppError):
    status_code = 401


class ForbiddenError(AppError):
    status_code = 403


class TooManyRequestsError(AppError):
    status_code = 429


class PayloadTooLargeError(AppError):
    status_code = 413


class ServiceUnavailableError(AppError):
    status_code = 503


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
        )

    @app.exception_handler(InvalidId)
    async def handle_invalid_id(request: Request, exc: InvalidId) -> JSONResponse:
        # A malformed ObjectId in a path/query/body is a client error, not a server fault.
        return JSONResponse(status_code=422, content={"detail": "Invalid id format"})
