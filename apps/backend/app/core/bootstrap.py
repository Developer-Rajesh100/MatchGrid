"""Startup bootstrap: applies pending migrations and ensures the bootstrap superadmin exists.
Runs from the FastAPI lifespan, i.e. before the app accepts any request, on every (re)deploy.

Safe by construction:
- migrations are tracked in `schema_migrations`, so re-running is a no-op;
- a Mongo-based lock stops two instances starting at once (e.g. during a rolling deploy) from
  racing each other.

Demo data is never inserted at startup: use `python -m app.scripts.seed_realistic_demo` locally.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.database import get_client
from app.core.security import hash_password
from app.migrations.runner import apply_migrations
from app.models import User, UserRole

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


async def _sync_bootstrap_user(settings) -> None:
    """Ensure the bootstrap SUPER_ADMIN exists in the users collection."""
    user = await User.find_one(User.username == settings.admin_bootstrap_username)
    if user is None:
        await User(
            username=settings.admin_bootstrap_username,
            password_hash=hash_password(settings.admin_bootstrap_password),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        ).insert()
        logger.info("Bootstrap SUPER_ADMIN synced in users collection")


async def run_startup_tasks() -> None:
    settings = get_settings()
    if not settings.auto_migrate:
        logger.info("AUTO_MIGRATE disabled — skipping migrations")
        return

    if not await _acquire_lock():
        raise RuntimeError("Could not acquire startup lock — another instance is bootstrapping")
    try:
        applied = await apply_migrations()
        logger.info("Migrations applied: %s", applied or "none (up to date)")
        await _sync_bootstrap_user(settings)
    finally:
        await _release_lock()
