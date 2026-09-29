"""App-level exceptions mapped to consistent HTTP error responses.

Every error body has the shape {"detail": "<message>"}, matching FastAPI's
default HTTPException shape (see docs/API_PLAN.md §10) so callers only ever
deal with one error format, whether the failure came from Pydantic request
validation, an app-level rule, or an unexpected 500.
"""

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


class TooManyRequestsError(AppError):
    status_code = 429


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
        )
