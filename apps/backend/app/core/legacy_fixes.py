"""Idempotent data repairs that must run BEFORE Beanie builds a new unique index.

`init_beanie` creates every declared index at startup, ahead of the migration runner. A unique index
over data that already violates it would abort the whole app boot, so the repair that makes the data
valid lives here and is invoked from `init_db` first (and again, harmlessly, from its migration).
"""

import re

_ID_RE = re.compile(r"^DCL-(\d+)$")


def _number(dcl_id) -> int:
    match = _ID_RE.match(dcl_id or "")
    return int(match.group(1)) if match else 0


async def repair_player_ids(database) -> int:
    """Gives players that share a `dcl_id` within their tournament a fresh one, and brings each
    tournament's `player_seq` up to the highest number in use. Returns the number of ids rewritten."""
    names = await database.list_collection_names()
    if "players" not in names:
        return 0
    players, tournaments = database["players"], database["tournaments"]

    rewritten = 0
    seq_by_tournament: dict = {}
    async for t in tournaments.find({}, {"player_seq": 1}):
        seq_by_tournament[t["_id"]] = t.get("player_seq") or 0

    by_tournament: dict = {}
    async for p in players.find({"tournament_id": {"$type": "objectId"}}, {"tournament_id": 1, "dcl_id": 1, "created_at": 1}):
        by_tournament.setdefault(p["tournament_id"], []).append(p)

    for tournament_id, rows in by_tournament.items():
        rows.sort(key=lambda r: (r.get("created_at") is None, r.get("created_at"), str(r["_id"])))
        seq = max([_number(r.get("dcl_id")) for r in rows] + [seq_by_tournament.get(tournament_id, 0)])
        seen: set = set()
        for row in rows:
            dcl_id = row.get("dcl_id")
            if isinstance(dcl_id, str) and dcl_id not in seen:
                seen.add(dcl_id)
                continue
            if dcl_id is None:
                continue  # the unique index ignores players without an id
            seq += 1
            new_id = f"DCL-{seq:03d}"
            await players.update_one({"_id": row["_id"]}, {"$set": {"dcl_id": new_id}})
            seen.add(new_id)
            rewritten += 1
        if tournament_id in seq_by_tournament and seq != seq_by_tournament[tournament_id]:
            await tournaments.update_one({"_id": tournament_id}, {"$set": {"player_seq": seq}})
    return rewritten
