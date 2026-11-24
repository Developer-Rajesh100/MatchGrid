from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.bootstrap import run_startup_tasks
from app.core.database import close_db, init_db
from app.core.errors import register_exception_handlers
from app.core.logging import register_request_logging, setup_logging
from app.core.production_safety import assert_safe_for_production
from app.routers import (
    auth,
    groups,
    health,
    matches,
    organizer,
    players,
    scorer,
    standings,
    statistics,
    superadmin,
    teams,
    tournament,
    uploads,
    websocket,
)

settings = get_settings()
assert_safe_for_production(settings)  # refuses to boot with a known dev secret/CORS origin in prod
setup_logging(level="DEBUG" if settings.debug else "INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Migrations + seed complete before the server accepts any request; a failure
    # aborts startup so a broken deploy never goes live.
    await run_startup_tasks()
    yield
    await close_db()


is_production = settings.environment == "production"

app = FastAPI(
    title=settings.app_name,
    # The interactive API docs / schema aren't needed in production.
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
    description=(
        "REST API for the DCL Season 5 digital scoreboard.\n\n"
        "All GET endpoints are public. Every other method (POST/PATCH/PUT/DELETE) requires an "
        "admin bearer token: call POST /api/auth/login to get one, then use the 'Authorize' "
        "button above (or an `Authorization: Bearer <token>` header) to call protected endpoints."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


register_request_logging(app)
register_exception_handlers(app)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})


app.include_router(health.router)
app.include_router(websocket.router)

api_router = APIRouter(prefix="/api")
for router in (
    auth,
    superadmin,
    organizer,
    scorer,
    tournament,
    teams,
    groups,
    players,
    matches,
    standings,
    statistics,
    uploads,
):
    api_router.include_router(router.router)
api_router.include_router(tournament.tournaments_router)
app.include_router(api_router)
