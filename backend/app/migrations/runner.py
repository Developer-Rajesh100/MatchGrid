"""Lightweight migration runner for MongoDB.

MongoDB has no built-in schema-migration concept, so this implements the
common pattern (à la migrate-mongo/Flyway): numbered migration modules, each
exposing NAME + an async up(), applied in order, with applied names tracked
in a `schema_migrations` collection so re-running is a no-op.

Usage:
    python -m app.migrations.runner
"""

import asyncio
from datetime import datetime, timezone

from app.core.database import close_db, get_client, init_db
from app.core.config import get_settings
from app.migrations import (
    m0001_initial_indexes,
    m0002_tournament_and_groups,
    m0003_bootstrap_admin,
    m0004_knockout_match_slots,
)

MIGRATIONS = [
    m0001_initial_indexes,
    m0002_tournament_and_groups,
    m0003_bootstrap_admin,
    m0004_knockout_match_slots,
]


async def run_migrations() -> list[str]:
    await init_db()
    settings = get_settings()
    collection = get_client()[settings.mongo_db_name]["schema_migrations"]

    applied_names = {doc["name"] async for doc in collection.find({}, {"name": 1})}
    newly_applied: list[str] = []

    for migration in MIGRATIONS:
        if migration.NAME in applied_names:
            print(f"  - {migration.NAME}: already applied, skipping")
            continue
        print(f"  - {migration.NAME}: applying...")
        await migration.up()
        await collection.insert_one(
            {"name": migration.NAME, "applied_at": datetime.now(timezone.utc)}
        )
        newly_applied.append(migration.NAME)
        print(f"  - {migration.NAME}: done")

    await close_db()
    return newly_applied


def main() -> None:
    print("Running migrations...")
    applied = asyncio.run(run_migrations())
    if applied:
        print(f"Applied {len(applied)} migration(s): {', '.join(applied)}")
    else:
        print("Database already up to date — nothing to apply.")


if __name__ == "__main__":
    main()
