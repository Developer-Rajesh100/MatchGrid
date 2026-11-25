"""Player ids (DCL-nnn) become unique per tournament.

Before: the next id came from the platform-wide player count, so ids collided after deletes and
across tournaments. This backfills Tournament.player_seq to the highest number in use and gives any
player that shares an id with another player of the same tournament a fresh one.

The same repair also runs inside `init_db` *before* Beanie builds the new unique
(tournament_id, dcl_id) index (an index over duplicate data would abort startup), so by the time this
migration runs it normally finds nothing left to do; it stays here so the change is recorded.
"""

from app.core.config import get_settings
from app.core.database import get_client
from app.core.legacy_fixes import repair_player_ids

NAME = "0008_player_ids_per_tournament"


async def up() -> None:
    await repair_player_ids(get_client()[get_settings().mongo_db_name])
