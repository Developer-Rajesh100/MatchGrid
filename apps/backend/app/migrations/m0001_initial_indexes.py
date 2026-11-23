"""Establishes collections and indexes for every document model.

Beanie's init_beanie() (called by app.core.database.init_db, which every
migration run and the app itself both call first) already creates each
Document's declared indexes on startup. This migration exists so that
"schema creation" shows up explicitly in migration history rather than
happening silently and undocumented — it deliberately does no extra work
beyond what init_db() already guarantees.
"""

NAME = "0001_initial_indexes"


async def up() -> None:
    # No-op: app.core.database.init_db() (run before any migration) already
    # creates every collection + its declared indexes via init_beanie().
    return None
