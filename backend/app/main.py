from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.database import close_db, init_db
from app.core.errors import register_exception_handlers
from app.core.logging import register_request_logging, setup_logging
from app.core.production_safety import assert_safe_for_production
from app.routers import (
    auth,
    groups,
    health,
    matches,
    players,
    standings,
    statistics,
    teams,
    tournament,
    websocket,
)

settings = get_settings()
assert_safe_for_production(settings)  # refuses to boot with a known dev secret/CORS origin in prod
setup_logging(level="DEBUG" if settings.debug else "INFO")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
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

register_request_logging(app)
register_exception_handlers(app)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.include_router(health.router)
app.include_router(websocket.router)

api_router = APIRouter(prefix="/api")
for router in (auth, tournament, teams, groups, players, matches, standings, statistics):
    api_router.include_router(router.router)
app.include_router(api_router)
