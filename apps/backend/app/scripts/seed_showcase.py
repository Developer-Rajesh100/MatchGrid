"""Showcase seed: four hand-built tournaments, named demo accounts, and real generated artwork.

What it creates (all deterministic, keyed by slug / username, so it is safe to re-run):

  * Accounts: organizers `alex.organizer` (Apex Football League) and `priya.organizer` (Metro Premier Cup),
    scorers `sam.scorer` (works Apex fixtures) and `maya.scorer` (works Metro fixtures). The existing
    superadmin is never created, changed or printed.
  * Apex Champions Cup 2026   - active, knockout: 2 groups of 4, all 8 advance (QF -> SF -> Final), 2 matches live.
  * Metro Premier League 2026 - active, group stage: 2 groups of 3, mid-table, 1 match live.
  * Winter Invitational 2025  - completed: groups + semis + final, champion crowned, full event timelines.
  * Summer Youth Super Cup 2026 - draft: visible only to its organizer and the superadmin.
  * Every played fixture has lineups (7 starters + bench) and chronological goal / assist / card / POTM events.
    Standings, player statistics, bracket and tournament stage come from the app's own services.
  * Crests, jersey portraits, logos and banners are rendered with Pillow (see showcase_art.py).

Media modes (`--media`):
  inline  (default) PNG/WebP embedded as data URIs. Nothing leaves the database; no R2 needed.
  r2      uploaded through StorageService to tournaments/<id>/<category>/<uuid>.<ext>, CDN URLs stored.

Re-running never duplicates anything. Existing showcase tournaments are skipped, and the "live right now"
clocks are re-anchored so the live matches keep ticking realistically. `--reset-showcase` removes only the
showcase accounts and tournaments (and their R2 folders) before rebuilding.

Safety: refuses a database whose name contains "test", and refuses ENVIRONMENT=production or any non-local
MongoDB (Atlas) unless --allow-production is given. Pair that with --media r2 for the live site.

Usage (from apps/backend):
    ./.venv/bin/python -m app.scripts.seed_showcase
    ./.venv/bin/python -m app.scripts.seed_realistic_demo --showcase            # same thing
    ./.venv/bin/python -m app.scripts.seed_showcase --reset-showcase
    ./.venv/bin/python -m app.scripts.seed_showcase --dry-run
    # live (deliberate): MONGO_URI=<atlas> R2_*=<bucket> ... --allow-production --media r2 --reset-showcase
"""

import argparse
import asyncio
import base64
import random
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId

from app.core.config import get_settings
from app.core.database import close_db, get_client, init_db
from app.core.security import hash_password
from app.models import (
    Group,
    GroupTeam,
    Match,
    MatchEvent,
    MatchLineup,
    Player,
    PlayerStatistics,
    Team,
    Tournament,
    TournamentConfig,
    TournamentStanding,
    User,
    UserRole,
)
from app.scripts import showcase_art as art
from app.scripts.seed_realistic_demo import (
    DEMO_PASSWORD,
    FIRST,
    LAST,
    Build,
    Seeder,
    Spec,
    TeamCtx,
    _player_statistics,
    bulk_insert,
    slugify,
    verify,
)
from app.services.standings import recalculate_group_standings
from app.services.storage import get_storage_service
from app.services.tournament_stage import refresh_tournament_stage

STATE_ID = "showcase"
SEED = 20260527
SHOWCASE_PASSWORD = DEMO_PASSWORD
STARTERS = 7
SQUAD_NUMBERS = [1, 3, 4, 5, 7, 8, 9, 10, 11, 14]  # ten outfield players plus the manager

ORGANIZERS = {
    "alex": ("alex.organizer", "Apex Football League"),
    "priya": ("priya.organizer", "Metro Premier Cup"),
}
SCORERS = {"alex": "sam.scorer", "priya": "maya.scorer"}  # each scorer belongs to one organizer (tenancy rule)


@dataclass
class ShowcaseDef:
    name: str
    season: str
    owner: str  # key into ORGANIZERS
    kind: str  # active | completed | draft
    stage: str  # expected stage after the seed
    desc: str
    subtitle: str
    color: str
    groups: int
    per: int
    qualifiers: int
    fmt: str
    half: int
    clubs: list  # (name, short, primary, secondary)
    live: str = "none"
    friendlies: int = 0
    extra_live: bool = False  # promote the upcoming friendly to a second live match
    variant: int = 0
    index: int = 0

    @property
    def slug(self) -> str:
        return slugify(self.name)


SHOWCASE = [
    ShowcaseDef(
        name="Apex Champions Cup 2026", season="2026", owner="alex", kind="active", stage="semis",
        desc="8 clubs in 2 groups of 4. All four per group advance into a full Quarter-final, Semi-final and Final bracket.",
        subtitle="Apex Football League  -  Knockout stage", color="#10B981", groups=2, per=4, qualifiers=4,
        fmt="quarters_semis_final", half=25, live="live", friendlies=2, extra_live=True, variant=0,
        clubs=[
            ("Northgate Rovers", "NGR", "#DC2626", "#FBBF24"), ("Harborside United", "HBU", "#2563EB", "#FFFFFF"),
            ("Ironbridge Athletic", "IBA", "#0F766E", "#FDE68A"), ("Summit Strikers", "SMS", "#7C3AED", "#F59E0B"),
            ("Delta Wanderers", "DLW", "#EA580C", "#0B0F14"), ("Royal Albion", "RAL", "#1D4ED8", "#E2E8F0"),
            ("Lakeside Town", "LKT", "#16A34A", "#FFFFFF"), ("Cobalt City", "CBC", "#0891B2", "#FB7185"),
        ],
    ),
    ShowcaseDef(
        name="Metro Premier League 2026", season="2026", owner="priya", kind="active", stage="group",
        desc="6 clubs in 2 groups of 3. The top two in each group reach the semi-finals.",
        subtitle="Metro Premier Cup  -  Group stage", color="#3B82F6", groups=2, per=3, qualifiers=2,
        fmt="semis_final", half=20, live="live", friendlies=1, variant=1,
        clubs=[
            ("Metro Dynamos", "MDY", "#0EA5E9", "#0B0F14"), ("Eastside Rapids", "ESR", "#E11D48", "#FFFFFF"),
            ("Parkview Olympic", "PVO", "#65A30D", "#FEF08A"), ("Crown Harriers", "CRH", "#9333EA", "#FFFFFF"),
            ("Quayside Celtic", "QSC", "#15803D", "#FBBF24"), ("Union Sporting", "UNS", "#F59E0B", "#1E3A8A"),
        ],
    ),
    ShowcaseDef(
        name="Winter Invitational 2025", season="2025", owner="alex", kind="completed", stage="champions",
        desc="6 clubs, 2 groups of 3, semi-finals and a final. Played in December 2025; the champion is crowned.",
        subtitle="Apex Football League  -  Season archive", color="#F59E0B", groups=2, per=3, qualifiers=2,
        fmt="semis_final", half=25, friendlies=1, variant=3,
        clubs=[
            ("Frostfield FC", "FFC", "#38BDF8", "#0B0F14"), ("Evergreen Athletic", "EVA", "#059669", "#FDE047"),
            ("Redwood Rangers", "RWR", "#B91C1C", "#FFFFFF"), ("Granite Bay United", "GBU", "#475569", "#F97316"),
            ("Aurora Sporting", "AUS", "#C026D3", "#FDE68A"), ("Blackthorn Albion", "BTA", "#1F2937", "#10B981"),
        ],
    ),
    ShowcaseDef(
        name="Summer Youth Super Cup 2026", season="2026", owner="priya", kind="draft", stage="group",
        desc="Under-16 invitational, 8 academies in 2 groups of 4. Draft: not yet public.",
        subtitle="Metro Premier Cup  -  Draft", color="#EC4899", groups=2, per=4, qualifiers=2,
        fmt="semis_final", half=20, variant=2,
        clubs=[
            ("Sunrise Academy", "SRA", "#F97316", "#FFFFFF"), ("Maple Juniors", "MPJ", "#DC2626", "#FDE68A"),
            ("Harbour Youth", "HRY", "#0284C7", "#E2E8F0"), ("Oakridge Cadets", "OKC", "#166534", "#FBBF24"),
            ("Skyline Stars", "SLS", "#6D28D9", "#F0ABFC"), ("Brightwater FC", "BWF", "#0D9488", "#0B0F14"),
            ("Pinecrest Rising", "PCR", "#BE185D", "#FFFFFF"), ("Valley Rovers", "VLR", "#CA8A04", "#1E293B"),
        ],
    ),
]
for _i, _d in enumerate(SHOWCASE):
    _d.index = _i


# ----------------------------------------------------------------------------------------------- images


@dataclass
class ImageJob:
    doc: object
    attr: str
    category: str  # crests | photos | logos | banners
    data: bytes
    mime: str


def _data_uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(data).decode()


async def resolve_images(jobs: list[ImageJob], tournament_id: PydanticObjectId, media: str) -> list[str]:
    """Stores each image and sets the URL on its document. Returns the URLs written."""
    if media == "r2":
        storage = get_storage_service()
        gate = asyncio.Semaphore(8)

        async def upload(job: ImageJob) -> str:
            async with gate:
                out = await storage.upload_image(job.data, str(tournament_id), job.category)
            setattr(job.doc, job.attr, out.url)
            return out.url

        return list(await asyncio.gather(*(upload(j) for j in jobs)))
    urls = []
    for job in jobs:
        url = _data_uri(job.data, job.mime)
        setattr(job.doc, job.attr, url)
        urls.append(url)
    return urls


# ----------------------------------------------------------------------------------------------- builder


class ShowcaseSeeder(Seeder):
    """Reuses the realistic seeder's simulation engine (fixtures, results, knockout bracket, schedule) with
    hand-picked clubs, bigger squads and generated artwork."""

    def build_showcase(self, d: ShowcaseDef, organizer: User) -> tuple[Build, list[ImageJob]]:
        spec = Spec(index=d.index, kind=d.kind, arch="showcase", stage=d.stage, live=d.live,
                    friendlies=d.friendlies, variant=d.variant)
        config = TournamentConfig(
            num_groups=d.groups, teams_per_group=d.per, qualifiers_per_group=d.qualifiers, knockout_format=d.fmt,
            half_duration_minutes=d.half,
        )
        tournament = Tournament(
            id=PydanticObjectId(), organizer_id=organizer.id, name=d.name, slug=d.slug, season=d.season,
            status=d.kind, format_description=d.desc, stage="group", config=config,
        )
        b = Build(tournament=tournament, spec=spec, organizer=organizer)
        jobs = [
            ImageJob(tournament, "logo_url", "logos", art.logo_png(d.name, d.color, d.season), "image/png"),
            ImageJob(tournament, "banner_url", "banners", art.banner_webp(d.name, d.subtitle, d.color), "image/webp"),
        ]
        self._showcase_teams(b, d, jobs)
        self._build_groups(b, {"groups": d.groups, "per": d.per})
        self._build_group_fixtures(b)
        self._play(b)
        if d.extra_live:
            pending = next((m for m in b.matches if m.stage == "extra" and m.status == "upcoming"), None)
            if pending is not None:
                self._simulate(b, pending, "live")
        self._schedule(b)
        if d.kind == "completed":
            self._shift_to_december(b)
        self._assign_scorers(b)
        self._mark_starters(b)
        return b, jobs

    def _showcase_teams(self, b: Build, d: ShowcaseDef, jobs: list[ImageJob]) -> None:
        rng = self.rng
        used: set[str] = set()
        seq = 0
        for i, (tname, short, primary, secondary) in enumerate(d.clubs):
            team = Team(id=PydanticObjectId(), tournament_id=b.tournament.id, name=tname, short_name=short,
                        color=primary)
            jobs.append(ImageJob(team, "crest_url", "crests", art.crest_png(tname, primary, secondary, i + d.index),
                                 "image/png"))
            roster, outfield = [], []
            for is_manager, number in [(True, 0)] + [(False, n) for n in SQUAD_NUMBERS]:
                while True:
                    pname = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                    if pname not in used:
                        used.add(pname)
                        break
                seq += 1
                player = Player(
                    id=PydanticObjectId(), tournament_id=b.tournament.id, team_id=team.id,
                    dcl_id=f"DCL-{seq:03d}", player_code=f"PLY-{seq:03d}", name=pname, number=number,
                    is_manager=is_manager,
                )
                jobs.append(ImageJob(player, "photo_url", "photos",
                                     art.portrait_png(number, primary, secondary, is_manager=is_manager), "image/png"))
                roster.append(player)
                if not is_manager:
                    outfield.append(player)
            b.players.extend(roster)
            b.teams[team.id] = TeamCtx(team=team, players=outfield, rating=0.75 + rng.random() * 0.6)
        b.tournament.player_seq = seq

    def _shift_to_december(self, b: Build) -> None:
        """The archive tournament happened in December 2025, whatever today's date is."""
        dated = [m for m in b.matches if m.date]
        if not dated:
            return
        last = max(datetime.fromisoformat(m.date) for m in dated)
        delta = datetime(2025, 12, 21) - last
        for m in b.matches:
            if m.date:
                m.date = (datetime.fromisoformat(m.date) + delta).date().isoformat()
            if m.started_at:
                m.started_at += delta
            if m.ended_at:
                m.ended_at += delta

    def _mark_starters(self, b: Build) -> None:
        """First STARTERS of each team's squad sheet start; the rest are on the bench."""
        seen: dict = {}
        for lineup in b.lineups:
            key = (lineup.match_id, lineup.team_id)
            seen[key] = seen.get(key, 0) + 1
            lineup.is_starting = seen[key] <= STARTERS


# ----------------------------------------------------------------------------------------------- persistence


def _is_remote_mongo(uri: str) -> bool:
    if uri.startswith("mongodb+srv://"):
        return True
    host = re.sub(r"^mongodb://([^@/]*@)?", "", uri).split("/")[0].split(":")[0].split(",")[0]
    return host not in ("localhost", "127.0.0.1", "::1", "mongo", "mongodb", "")


async def purge_tournament(t: Tournament) -> None:
    """Removes one tournament's database rows (and its R2 folder if it has uploaded media)."""
    tid = t.id
    match_ids = [m.id for m in await Match.find(Match.tournament_id == tid).to_list()]
    if match_ids:
        await MatchEvent.find({"match_id": {"$in": match_ids}}).delete()
        await MatchLineup.find({"match_id": {"$in": match_ids}}).delete()
    for model in (Match, PlayerStatistics, TournamentStanding, GroupTeam, Player, Team, Group):
        await model.find({"tournament_id": tid}).delete()
    await Tournament.find({"_id": tid}).delete()
    storage = get_storage_service()
    if storage.extract_key_from_url(t.logo_url) or storage.extract_key_from_url(t.banner_url):
        await storage.delete_prefix(f"tournaments/{tid}/")


async def reset_showcase(db) -> dict:
    users = await User.find({"username": {"$in": [u for u, _ in ORGANIZERS.values()] + list(SCORERS.values())}}).to_list()
    org_ids = [u.id for u in users if u.role == UserRole.ORGANIZER]
    slugs = [d.slug for d in SHOWCASE]
    tournaments = await Tournament.find({"slug": {"$in": slugs}, "organizer_id": {"$in": org_ids}}).to_list()
    for t in tournaments:
        await purge_tournament(t)
    if users:
        await User.find({"_id": {"$in": [u.id for u in users]}}).delete()
    await db["demo_seed_state"].delete_one({"_id": STATE_ID})
    return {"tournaments": len(tournaments), "users": len(users)}


async def _ensure_user(username: str, role: UserRole, password_hash: str, **fields) -> tuple[User, bool]:
    user = await User.find_one(User.username == username)
    if user is not None:
        if user.role != role:
            raise SystemExit(f"Username {username!r} already exists with role {user.role.value}; refusing to touch it.")
        return user, False
    user = User(id=PydanticObjectId(), username=username, password_hash=password_hash, role=role,
                email=f"{username}@example.com", **fields)
    await user.insert()
    return user, True


async def _reanchor_live(db, now: datetime) -> int:
    """Keeps the showcase's live matches live: moves each one's kick-off so it shows the same minute as when seeded."""
    state = await db["demo_seed_state"].find_one({"_id": STATE_ID})
    offsets: dict = (state or {}).get("live_offsets", {})
    count = 0
    for match_id, seconds in offsets.items():
        m = await Match.get(PydanticObjectId(match_id))
        if m is None or m.status != "live":
            continue
        m.started_at = now - timedelta(seconds=seconds)
        m.date, m.time = m.started_at.date().isoformat(), m.started_at.strftime("%H:%M")
        await m.save()
        count += 1
    return count


async def seed_showcase(media: str = "inline", reset: bool = False, dry_run: bool = False) -> dict:
    """Core of the seed; expects an initialised database (see `seed` for the guarded CLI wrapper)."""
    settings = get_settings()
    db = get_client()[settings.mongo_db_name]
    result: dict = {"database": settings.mongo_db_name, "media": media, "dry_run": dry_run}
    now = datetime.now(timezone.utc)

    if media == "r2" and not settings.is_r2_configured:
        raise SystemExit("--media r2 needs R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME set.")

    if dry_run:
        existing = {t.slug for t in await Tournament.find({"slug": {"$in": [d.slug for d in SHOWCASE]}}).to_list()}
        result["status"] = "dry-run"
        result["would_create"] = [d.name for d in SHOWCASE if d.slug not in existing or reset]
        result["would_skip"] = [d.name for d in SHOWCASE if d.slug in existing and not reset]
        return result

    if reset:
        result["removed"] = await reset_showcase(db)

    superadmin = await User.find_one(User.role == UserRole.SUPER_ADMIN)
    password_hash = hash_password(SHOWCASE_PASSWORD)
    owners: dict[str, User] = {}
    accounts = []
    for key, (username, org_name) in ORGANIZERS.items():
        user, created = await _ensure_user(username, UserRole.ORGANIZER, password_hash, organization_name=org_name,
                                           created_by=superadmin.id if superadmin else None)
        owners[key] = user
        accounts.append(dict(role="ORGANIZER", username=username, organization=org_name, created=created))
    scorers: dict = {}
    for key, username in SCORERS.items():
        user, created = await _ensure_user(username, UserRole.SCORER, password_hash, created_by=owners[key].id)
        scorers[owners[key].id] = [user]
        accounts.append(dict(role="SCORER", username=username, organization=ORGANIZERS[key][1], created=created))
    result["accounts"] = accounts
    result["superadmin"] = superadmin.username if superadmin else None

    rng = random.Random(SEED)
    seeder = ShowcaseSeeder(rng, now, superadmin, list(owners.values()), scorers)
    state = await db["demo_seed_state"].find_one({"_id": STATE_ID}) or {"_id": STATE_ID}
    live_offsets: dict = dict(state.get("live_offsets", {}))
    builds, tournaments_out = [], []

    for d in SHOWCASE:
        organizer = owners[d.owner]
        existing = await Tournament.find_one(Tournament.slug == d.slug)
        if existing is not None:
            if existing.organizer_id != organizer.id:
                raise SystemExit(f"Slug {d.slug!r} belongs to another organizer; refusing to touch it.")
            if await Team.find(Team.tournament_id == existing.id).count() >= len(d.clubs):
                tournaments_out.append(dict(name=d.name, status=existing.status, stage=existing.stage, action="skipped (exists)"))
                continue
            await purge_tournament(existing)  # a previous run died half way: rebuild it from scratch

        b, jobs = seeder.build_showcase(d, organizer)  # rng advances in a fixed order, so content is stable
        try:
            await resolve_images(jobs, b.tournament.id, media)
            await b.tournament.insert()
            await bulk_insert(Group, b.groups)
            await bulk_insert(Team, [c.team for c in b.teams.values()])
            await bulk_insert(GroupTeam, b.group_teams)
            await bulk_insert(Player, b.players)
            await bulk_insert(Match, b.matches)
            await bulk_insert(MatchLineup, b.lineups)
            await bulk_insert(MatchEvent, b.events)
            await bulk_insert(PlayerStatistics, _player_statistics([b]))
            for g in b.groups:
                await recalculate_group_standings(g.id)
            await refresh_tournament_stage(b.tournament.id)
        except BaseException:
            tour = await Tournament.get(b.tournament.id)
            await purge_tournament(tour or b.tournament)
            if media == "r2":
                await get_storage_service().delete_prefix(f"tournaments/{b.tournament.id}/")
            raise
        for m in b.matches:
            if m.status == "live":
                live_offsets[str(m.id)] = int((now - m.started_at).total_seconds())
        builds.append(b)
        t = await Tournament.get(b.tournament.id)
        tournaments_out.append(dict(name=d.name, status=t.status, stage=t.stage, action="created"))

    await db["demo_seed_state"].replace_one(
        {"_id": STATE_ID}, {"_id": STATE_ID, "seeded_at": now, "seed": SEED, "media": media, "live_offsets": live_offsets},
        upsert=True)
    result["reanchored_live"] = await _reanchor_live(db, now)
    result["problems"] = await verify(builds, random.Random(SEED)) if builds else []

    for row in tournaments_out:
        t = await Tournament.find_one(Tournament.slug == slugify(row["name"]))
        tid = t.id
        row.update(
            teams=await Team.find(Team.tournament_id == tid).count(),
            players=await Player.find(Player.tournament_id == tid).count(),
            matches=await Match.find(Match.tournament_id == tid).count(),
            live=await Match.find(Match.tournament_id == tid, Match.status == "live").count(),
            events=await MatchEvent.find({"match_id": {"$in": [m.id for m in await Match.find(Match.tournament_id == tid).to_list()]}}).count(),
            champion=bool(t.champion_team_id),
        )
    result["tournaments"] = tournaments_out
    result["status"] = "seeded" if builds else "already-seeded"
    return result


async def seed(media: str = "inline", reset: bool = False, dry_run: bool = False, allow_test_db: bool = False,
               allow_production: bool = False) -> dict:
    settings = get_settings()
    if "test" in settings.mongo_db_name.lower() and not allow_test_db:
        raise SystemExit(f"Refusing to seed the test database {settings.mongo_db_name!r} (use --allow-test-db).")
    if (settings.environment == "production" or _is_remote_mongo(settings.mongo_uri)) and not allow_production:
        raise SystemExit("Refusing to seed: ENVIRONMENT=production or a non-local MongoDB (use --allow-production).")
    await init_db()
    try:
        return await seed_showcase(media, reset, dry_run)
    finally:
        await close_db()


def print_summary(result: dict) -> None:
    print(f"Database: {result['database']}   media: {result['media']}")
    if result.get("dry_run"):
        print(f"Dry run - would create: {result['would_create']}; would skip: {result['would_skip']}")
        return
    if "removed" in result:
        print(f"Removed previous showcase data: {result['removed']}")
    print("\nTournaments")
    print(f"  {'name':<30}{'status':<11}{'stage':<10}{'teams':>6}{'players':>9}{'matches':>9}{'live':>6}{'events':>8}  action")
    for r in result["tournaments"]:
        print(f"  {r['name']:<30}{r['status']:<11}{r['stage']:<10}{r['teams']:>6}{r['players']:>9}{r['matches']:>9}"
              f"{r['live']:>6}{r['events']:>8}  {r['action']}{'  champion crowned' if r['champion'] else ''}")
    print(f"\nLogins (every showcase account uses the password {SHOWCASE_PASSWORD!r})")
    print(f"  {'role':<13}{'username':<18}{'organisation':<26}{'portal'}")
    print(f"  {'SUPER_ADMIN':<13}{(result['superadmin'] or '(none configured)'):<18}{'(your configured account)':<26}/superadmin")
    for a in result["accounts"]:
        portal = "/organizer" if a["role"] == "ORGANIZER" else "/scorer"
        print(f"  {a['role']:<13}{a['username']:<18}{a['organization']:<26}{portal}{'' if a['created'] else '  (existed)'}")
    print(f"\nLive clocks re-anchored: {result['reanchored_live']}")
    if result["problems"]:
        print("VERIFICATION PROBLEMS:")
        for p in result["problems"]:
            print(f"  - {p}")
        raise SystemExit(1)
    print("Verification: OK" if result["status"] == "seeded" else "Nothing new to verify (already seeded).")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--media", choices=("inline", "r2"), default="inline",
                        help="inline: data URIs in MongoDB (default, touches no storage); r2: upload to Cloudflare R2")
    parser.add_argument("--reset-showcase", action="store_true", help="remove only the showcase accounts/tournaments, then rebuild")
    parser.add_argument("--dry-run", action="store_true", help="report what would be created; write nothing")
    parser.add_argument("--allow-test-db", action="store_true")
    parser.add_argument("--allow-production", action="store_true",
                        help="required for ENVIRONMENT=production or any non-local MongoDB (Atlas)")


def run_cli(args: argparse.Namespace) -> None:
    print_summary(asyncio.run(seed(args.media, args.reset_showcase, args.dry_run, args.allow_test_db, args.allow_production)))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_arguments(parser)
    run_cli(parser.parse_args())


if __name__ == "__main__":
    main()
