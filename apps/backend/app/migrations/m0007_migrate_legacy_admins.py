"""Retires the legacy `admins` collection.

Every legacy Admin becomes a SUPER_ADMIN row in `users` (keeping the same _id so
tokens already issued to it stay valid until they expire). Passwords were
authoritative on the Admin side, so an existing user with the same username gets
the Admin's password hash. A username collision with a non-super-admin user is
never merged (that would silently promote the account) and is skipped with a
warning. The `admins` collection is dropped afterwards. Idempotent.
"""

import logging
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.database import get_client
from app.models import User, UserRole

NAME = "0007_migrate_legacy_admins"

logger = logging.getLogger("dcl.migrations")


async def up() -> None:
    db = get_client()[get_settings().mongo_db_name]
    if "admins" not in await db.list_collection_names():
        return

    skipped = 0
    async for legacy in db["admins"].find({}):
        username = legacy["username"]
        existing = await User.find_one(User.username == username)
        if existing is None:
            await User(
                id=legacy["_id"],
                username=username,
                password_hash=legacy["password_hash"],
                role=UserRole.SUPER_ADMIN,
                is_active=True,
                created_at=legacy.get("created_at") or datetime.now(timezone.utc),
            ).insert()
        elif existing.role == UserRole.SUPER_ADMIN:
            if existing.password_hash != legacy["password_hash"]:
                existing.password_hash = legacy["password_hash"]
                await existing.save()
        else:
            skipped += 1
            logger.warning(
                "Legacy admin '%s' not migrated: a %s user with that username exists",
                username,
                existing.role.value,
            )

    if skipped == 0:
        await db.drop_collection("admins")
    else:
        # Keep the data for manual resolution, but it is no longer read by the app.
        await db["admins"].rename("admins_legacy_unmigrated", dropTarget=True)
