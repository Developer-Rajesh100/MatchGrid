"""Multi-tenant RBAC migration:
1. Bootstraps SUPER_ADMIN in users collection
2. Backfills Tournament organizer_id, slug, and status
3. Backfills Player tournament_id from Team
4. Initializes Match assigned_scorer_ids
5. Safely drops obsolete global unique indexes (teams.name_1, groups.name_1, players.dcl_id_1)
"""

import re
from pymongo.errors import OperationFailure

from app.core.config import get_settings
from app.core.database import get_client
from app.core.security import hash_password
from app.models import Admin, Match, Player, Team, Tournament, User, UserRole

NAME = "0005_multi_tenant_rbac"


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return cleaned or "tournament"


async def up() -> None:
    settings = get_settings()
    db = get_client()[settings.mongo_db_name]

    # 1. Ensure SUPER_ADMIN in users
    super_admin = await User.find_one(User.username == settings.admin_bootstrap_username)
    if super_admin is None:
        # Check if legacy Admin exists
        legacy_admin = await Admin.find_one(Admin.username == settings.admin_bootstrap_username)
        password_hash = (
            legacy_admin.password_hash
            if legacy_admin is not None
            else hash_password(settings.admin_bootstrap_password)
        )
        super_admin = User(
            username=settings.admin_bootstrap_username,
            password_hash=password_hash,
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
        await super_admin.insert()

    # 2. Backfill Tournament records
    tournaments = await Tournament.find_all().to_list()
    used_slugs: set[str] = set()

    for t in tournaments:
        changed = False
        if getattr(t, "organizer_id", None) is None:
            t.organizer_id = super_admin.id
            changed = True
        if not getattr(t, "slug", None):
            base_slug = _slugify(t.name)
            slug = base_slug
            counter = 1
            while slug in used_slugs:
                slug = f"{base_slug}-{counter}"
                counter += 1
            used_slugs.add(slug)
            t.slug = slug
            changed = True
        else:
            used_slugs.add(t.slug)

        if not getattr(t, "status", None):
            t.status = "ACTIVE"
            changed = True

        if changed:
            await t.save()

    # 3. Backfill Player tournament_id from Team
    teams = await Team.find_all().to_list()
    team_to_tournament = {team.id: team.tournament_id for team in teams if getattr(team, "tournament_id", None)}

    players = await Player.find_all().to_list()
    for p in players:
        if getattr(p, "tournament_id", None) is None and p.team_id in team_to_tournament:
            p.tournament_id = team_to_tournament[p.team_id]
            await p.save()

    # 4. Initialize Match assigned_scorer_ids
    matches = await Match.find_all().to_list()
    for m in matches:
        if getattr(m, "assigned_scorer_ids", None) is None:
            m.assigned_scorer_ids = []
            await m.save()

    # 5. Drop legacy global unique indexes if they exist
    collections_and_indexes = [
        ("teams", "name_1"),
        ("groups", "name_1"),
        ("players", "dcl_id_1"),
    ]
    for coll_name, index_name in collections_and_indexes:
        try:
            await db[coll_name].drop_index(index_name)
        except OperationFailure:
            pass
