"""Startup bootstrap: applies pending migrations, then seeds the bundled
tournament data — run from the FastAPI lifespan, i.e. before the app accepts
any request, on every (re)deploy.

Safe by construction:
- migrations are tracked in `schema_migrations`, so re-running is a no-op;
- seeding is create-only (existing teams/players/matches are never
  overwritten; empty schedule fields on still-upcoming matches are filled);
- a Mongo-based lock stops two instances starting at once (e.g. during a
  rolling deploy) from racing each other into duplicate inserts.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.database import get_client
from app.core.security import hash_password
from app.migrations.runner import apply_migrations
from app.models import Admin, User, UserRole
from app.scripts.import_match_schedule import (
    DEFAULT_PATH as SCHEDULE_PATH,
    import_schedule,
    validate_structure,
    validate_teams,
)
from app.scripts.import_tournament_data import DEFAULT_PATH as TOURNAMENT_PATH
from app.scripts.import_tournament_data import import_data, validate

logger = logging.getLogger("dcl.bootstrap")

LOCK_ID = "startup_bootstrap"
LOCK_TTL = timedelta(minutes=5)


async def _acquire_lock(wait_seconds: int = 120) -> bool:
    locks = get_client()[get_settings().mongo_db_name]["startup_locks"]
    deadline = datetime.now(timezone.utc) + timedelta(seconds=wait_seconds)
    while datetime.now(timezone.utc) < deadline:
        now = datetime.now(timezone.utc)
        # Drop a stale lock left behind by a crashed instance.
        await locks.delete_one({"_id": LOCK_ID, "expires_at": {"$lt": now}})
        try:
            await locks.insert_one({"_id": LOCK_ID, "expires_at": now + LOCK_TTL})
            return True
        except DuplicateKeyError:
            await asyncio.sleep(2)
    return False


async def _release_lock() -> None:
    await get_client()[get_settings().mongo_db_name]["startup_locks"].delete_one({"_id": LOCK_ID})


async def _seed() -> None:
    if not TOURNAMENT_PATH.exists():
        logger.warning("No tournament data file at %s — skipping seed", TOURNAMENT_PATH)
        return

    data = json.loads(TOURNAMENT_PATH.read_text())
    errors = [e for e in validate(data) if not e.startswith("NOTE")]
    if errors:
        raise RuntimeError("Invalid tournament_data.json: " + "; ".join(errors))
    result = await import_data(data, dry_run=False, update_existing=False)
    logger.info("Tournament seed: %s", result["stats"])
    for warning in result["warnings"]:
        logger.warning("Tournament seed warning: %s", warning)

    if SCHEDULE_PATH.exists():
        schedule = json.loads(SCHEDULE_PATH.read_text())
        errors = validate_structure(schedule) or await validate_teams(schedule)
        if errors:
            raise RuntimeError("Invalid match_schedule.json: " + "; ".join(errors))
        logger.info("Schedule seed: %s", await import_schedule(schedule, False, update_existing=False))


async def _sync_bootstrap_user(settings) -> None:
    """Ensure SUPER_ADMIN record exists in users collection alongside admins."""
    user = await User.find_one(User.username == settings.admin_bootstrap_username)
    if user is None:
        admin = await Admin.find_one(Admin.username == settings.admin_bootstrap_username)
        password_hash = admin.password_hash if admin else hash_password(settings.admin_bootstrap_password)
        await User(
            username=settings.admin_bootstrap_username,
            password_hash=password_hash,
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        ).insert()
        logger.info("Bootstrap SUPER_ADMIN synced in users collection")


async def run_startup_tasks() -> None:
    settings = get_settings()
    if not settings.auto_migrate:
        logger.info("AUTO_MIGRATE disabled — skipping migrations and seed")
        return

    if not await _acquire_lock():
        raise RuntimeError("Could not acquire startup lock — another instance is bootstrapping")
    try:
        applied = await apply_migrations()
        logger.info("Migrations applied: %s", applied or "none (up to date)")
        await _sync_bootstrap_user(settings)
        if settings.auto_seed:
            # Seed once per database. Without this marker a fixture (or team) the admin
            # deliberately deleted would be re-created from the JSON files on the next deploy.
            state = get_client()[settings.mongo_db_name]["startup_state"]
            if await state.find_one({"_id": "initial_seed"}) is None:
                await _seed()
                await state.insert_one({"_id": "initial_seed", "done_at": datetime.now(timezone.utc)})
            else:
                logger.info("Initial seed already done — skipping")
    finally:
        await _release_lock()
