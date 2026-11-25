from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from app.core.config import get_settings
from app.core.legacy_fixes import repair_player_ids
from app.models import DOCUMENT_MODELS

settings = get_settings()

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        # tz_aware=True: without it, pymongo returns naive datetimes for every
        # field read back from Mongo (BSON dates are UTC, but the Python object
        # loses that marker) even though we always write them as
        # datetime.now(timezone.utc). That mismatch broke datetime arithmetic
        # against a freshly-created aware datetime (TypeError: can't subtract
        # offset-naive and offset-aware datetimes — see
        # services/matches.py::pause_half_time) and made the API serialize
        # timestamps with no UTC marker, which browsers parse as *local* time —
        # silently corrupting the live match timer for any viewer not in UTC.
        # Found during the Timer/Half-Time audit; fixed at the driver level so
        # every datetime field across the app (not just this one) is correct.
        _client = AsyncIOMotorClient(settings.mongo_uri, tz_aware=True)
    return _client


async def init_db() -> None:
    client = get_client()
    database = client[settings.mongo_db_name]
    # Data that would violate a newly declared unique index is repaired first, or the index build aborts boot.
    await repair_player_ids(database)
    await init_beanie(database=database, document_models=DOCUMENT_MODELS, allow_index_dropping=True)


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


async def ping_db() -> bool:
    client = get_client()
    await client.admin.command("ping")
    return True
