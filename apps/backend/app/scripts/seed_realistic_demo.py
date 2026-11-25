"""Realistic, idempotent demo data: a platform that looks live and busy.

Populates every collection with ~50 tournaments (completed with champions, active across the group /
quarters / semis / final stages with matches live and at half time right now, and upcoming drafts),
their clubs, squads, groups, fixtures, knockout brackets (including penalty-shootout deciders),
friendlies, cancelled fixtures, lineups, events, and the materialized standings / player statistics.

Everything is generated with real model objects and the app's own rules; standings and tournament
stage then come from the real services, and a verification pass checks the result against them.

Safety:
  * Idempotent: a marker document records a finished seed; running again does nothing.
  * `--reset` removes only what this script created (users named `demo_*` and the tournaments they
    own, with all their children) and reseeds. Other data is never touched.
  * Never touches Cloudflare R2: crests, logos and banners are inline SVG data URIs, and the tournament
    delete used by `--reset` does not call the storage service.
  * Refuses to run against a database whose name contains "test" (the pytest database) or against
    ENVIRONMENT=production, unless explicitly allowed.
  * Deterministic structure/results for a given `--seed`; only "live right now" timestamps depend on
    the clock.

Usage (from apps/backend):
    ./.venv/bin/python -m app.scripts.seed_realistic_demo                # seed if not seeded yet
    ./.venv/bin/python -m app.scripts.seed_realistic_demo --reset        # wipe demo data, reseed
    ./.venv/bin/python -m app.scripts.seed_realistic_demo --tournaments 12
"""

import argparse
import asyncio
import base64
import math
import random
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Optional

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
    User,
    UserRole,
)
from app.services.bracket import recompute_bracket
from app.services.matches import compute_circle_method_pairs
from app.services.player_stats import recalculate_player_statistics
from app.services.standings import recalculate_group_standings
from app.services.tournament_stage import (
    _LEGACY_PAIRINGS,
    KNOCKOUT_SIZES,
    _fold_order,
    refresh_tournament_stage,
)

STATE_ID = "realistic_demo"
DEMO_PREFIX = "demo_"
DEMO_PASSWORD = "DemoPass#2026"

ORGANIZERS = [
    ("premier_street", "Premier Street League"),
    ("metro_sevens", "Metro 7s Football Association"),
    ("coastal_futsal", "Coastal Futsal Federation"),
    ("highland_youth", "Highland Youth Football"),
    ("riverside_community", "Riverside Community Sports"),
    ("capital_network", "Capital City Club Network"),
    ("northern_lights", "Northern Lights Sports Council"),
    ("evergreen_union", "Evergreen Athletics Union"),
]
SCORERS_TOTAL = 20

CUPS = [
    "Autumn Cup", "Premier Shield", "Champions Trophy", "Winter Classic", "City Challenge", "Super 7s",
    "Founders Cup", "Community Cup", "Golden Boot Series", "Skyline Invitational", "Harbour Cup",
    "Midnight League", "Heritage Trophy", "Pioneer Cup", "Summit Series", "Unity Cup", "Iron Bridge Cup",
    "Lakeside Classic", "Phoenix Trophy", "Titan Shield", "Ember Cup", "Meridian Open", "Cobalt Series",
    "Anchor Cup", "Beacon League", "Crown Invitational", "Falcon Trophy", "Gateway Cup", "Horizon Shield",
    "Jubilee Cup", "Kingfisher Series", "Landmark Trophy", "Monarch Cup", "Nova League", "Orchard Classic",
    "Prairie Cup", "Quartz Series", "Redwood Trophy", "Sterling Cup", "Thunder Shield", "Ultra Series",
    "Vanguard Cup", "Willow Trophy", "Zenith Classic", "Atlas Cup", "Birch League", "Cascade Shield",
    "Dune Series", "Echo Cup", "Frontier Trophy",
]
CITIES = [
    "Ashford", "Bayview", "Cedar Park", "Dunmore", "Eastgate", "Fairhaven", "Glenrock", "Harborside",
    "Ironwood", "Juniper", "Kingsbridge", "Lakemont", "Maplewood", "Northfield", "Oakridge", "Pinecrest",
    "Queensway", "Redcliff", "Stonebridge", "Thornhill", "Upland", "Valemont", "Westbrook", "Yarrow",
    "Aldergrove", "Brookfield", "Copperton", "Driftwood", "Elmhurst", "Foxhollow", "Granite Bay", "Hillcrest",
    "Ivyside", "Jasper Hill", "Kestrel Point", "Larkspur", "Millbrook", "Nightingale", "Orchard Hill", "Pebble Creek",
    "Quarry Lane", "Ravenswood", "Silverlake", "Tidewater", "Underhill", "Violet Bay", "Whitecliff", "Yewtree",
    "Amberley", "Birchwood", "Crestview", "Dovetail", "Emberfield", "Fernhill", "Goldcrest", "Heatherton",
]
SUFFIXES = [
    "FC", "United", "Athletic", "Rovers", "City", "Wanderers", "Town", "Sporting", "Dynamos", "Strikers",
    "Royals", "Rangers", "Albion", "Olympic", "Academy", "Celtic", "Rapids", "Harriers",
]
FIRST = [
    "Aiden", "Bruno", "Carlos", "Diego", "Eli", "Felix", "Gabriel", "Hugo", "Ivan", "Jonas", "Kai", "Leo",
    "Mateo", "Noah", "Oscar", "Pablo", "Quinn", "Rafael", "Samir", "Tomas", "Umar", "Victor", "Wes", "Xavier",
    "Yusuf", "Zane", "Arjun", "Bilal", "Chidi", "Dev", "Emeka", "Farid", "Gio", "Hassan", "Idris", "Jamal",
    "Kofi", "Luca", "Marco", "Nico", "Omar", "Paolo", "Rohan", "Sven", "Tariq", "Uri", "Vikram", "Wen",
    "Yann", "Zayd", "Adrian", "Basil", "Cyrus", "Dario", "Enzo", "Fabio", "Gael", "Hiro", "Ilya", "Joel",
]
LAST = [
    "Silva", "Okafor", "Novak", "Haddad", "Mendes", "Kowalski", "Tanaka", "Romero", "Nakamura", "Petrov",
    "Santos", "Mbeki", "Larsen", "Costa", "Ibrahim", "Fischer", "Moreau", "Rossi", "Khan", "Alvarez",
    "Bianchi", "Dubois", "Eriksen", "Fernandez", "Greco", "Hansen", "Ito", "Jovanovic", "Kim", "Lopez",
    "Martins", "Nguyen", "Ortega", "Pereira", "Quiroga", "Rahman", "Sato", "Torres", "Ueda", "Vargas",
    "Weber", "Yildiz", "Zielinski", "Abara", "Boateng", "Cruz", "Diallo", "Estrada", "Ferreira", "Gomez",
    "Horvat", "Ivanov", "Jensen", "Kaya", "Lindqvist", "Moretti", "Ndiaye", "Olsen", "Park", "Reyes",
]
PALETTE = [
    "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E", "#10B981", "#14B8A6", "#06B6D4",
    "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#64748B",
]
VENUES = [
    "Riverside Arena", "Memorial Park Pitch 1", "Memorial Park Pitch 2", "Harbour Sports Complex",
    "Northgate Stadium", "Community Dome", "Eastside Turf", "Lakeside Ground", "Victory Fields", "Central Court",
]
JERSEYS = [1, 3, 4, 5, 7, 8, 9, 10, 11, 14, 17, 19, 21, 23]

ARCHETYPES = {
    "A": dict(groups=2, per=3, q=2, fmt="semis_final"),
    "B": dict(groups=2, per=4, q=2, fmt="semis_final"),
    "C": dict(groups=2, per=4, q=4, fmt="quarters_semis_final"),
    "D": dict(groups=4, per=3, q=2, fmt="quarters_semis_final"),
    "E": dict(groups=1, per=6, q=2, fmt="none"),
    "F": dict(groups=2, per=4, q=2, fmt="none"),
    "G": dict(groups=4, per=3, q=1, fmt="semis_final"),
}
POINT_RULES = [(3, 1, 0), (3, 1, 0), (3, 1, 0), (2, 1, 0), (3, 2, 1)]
HALVES = [20, 25, 25, 30, 35]
PENALTY_SHARE = 0.28


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "tournament"


# ----------------------------------------------------------------------------------------- artwork


def _data_uri(svg: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def crest_svg(name: str, color: str) -> str:
    initials = "".join(w[0] for w in name.split()[:2]).upper()
    return _data_uri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
        f'<path d="M48 5 L87 19 V50 C87 73 69 87 48 93 C27 87 9 73 9 50 V19 Z" fill="{color}"/>'
        '<path d="M48 5 L87 19 V50 C87 73 69 87 48 93 Z" fill="#000" opacity=".14"/>'
        '<path d="M48 12 L80 24 V50 C80 68 65 80 48 85 C31 80 16 68 16 50 V24 Z" fill="none" stroke="#fff" '
        'stroke-opacity=".55" stroke-width="2"/>'
        f'<text x="48" y="58" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" '
        f'fill="#fff" text-anchor="middle">{initials}</text></svg>'
    )


def player_svg(name: str, color: str) -> str:
    initials = "".join(w[0] for w in name.split()[:2]).upper()
    return _data_uri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">'
        f'<rect width="80" height="80" rx="14" fill="{color}"/>'
        '<circle cx="40" cy="31" r="14" fill="#fff" opacity=".85"/>'
        '<path d="M12 80 C12 56 28 49 40 49 C52 49 68 56 68 80 Z" fill="#fff" opacity=".85"/>'
        f'<text x="40" y="74" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" '
        f'fill="{color}" text-anchor="middle">{initials}</text></svg>'
    )


def logo_svg(name: str, color: str) -> str:
    initials = "".join(w[0] for w in name.split()[:2]).upper()
    return _data_uri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
        f'<circle cx="48" cy="48" r="44" fill="#0B0F14" stroke="{color}" stroke-width="5"/>'
        f'<circle cx="48" cy="48" r="32" fill="{color}" opacity=".18"/>'
        '<path d="M34 28 H62 V44 C62 54 56 60 48 60 C40 60 34 54 34 44 Z" fill="#F59E0B"/>'
        '<rect x="44" y="60" width="8" height="8" fill="#F59E0B"/><rect x="38" y="68" width="20" height="5" fill="#F59E0B"/>'
        f'<text x="48" y="48" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="800" '
        f'fill="#0B0F14" text-anchor="middle">{initials}</text></svg>'
    )


def banner_svg(color: str) -> str:
    return _data_uri(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{color}"/>'
        '<stop offset="1" stop-color="#0B0F14"/></linearGradient></defs>'
        '<rect width="1200" height="300" fill="url(#g)"/>'
        '<g fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"><rect x="60" y="40" width="1080" '
        'height="220" rx="8"/><line x1="600" y1="40" x2="600" y2="260"/><circle cx="600" cy="150" r="46"/></g></svg>'
    )


# ----------------------------------------------------------------------------------------- planning


@dataclass
class Spec:
    index: int
    kind: str  # completed | active | draft
    arch: str
    stage: str = "group"  # expected tournament.stage after the seed
    live: str = "none"  # none | live | ht  (a match in progress right now)
    second_live: bool = False
    friendlies: int = 0
    cancel_one: bool = False
    variant: int = 0


def plan_tournaments(total: int) -> list[Spec]:
    completed = max(1, round(total * 22 / 50))
    draft = max(1, round(total * 8 / 50)) if total >= 3 else 0
    active = max(1, total - completed - draft)
    completed = total - active - draft

    done_cycle = ["A", "B", "C", "D", "E", "G", "B", "A", "C", "D", "E"]
    # (arch, stage, live) for the active tournaments, in a fixed, varied order
    active_cycle = [
        ("B", "group", "live"), ("C", "semis", "ht"), ("A", "group", "live"), ("D", "quarters", "live"),
        ("F", "group", "live"), ("A", "semis", "live"), ("C", "final", "ht"), ("E", "group", "live"),
        ("D", "semis", "live"), ("B", "final", "live"), ("G", "semis", "ht"), ("A", "group", "none"),
        ("C", "quarters", "live"), ("B", "group", "ht"), ("D", "quarters", "none"), ("B", "semis", "live"),
        ("A", "final", "none"), ("D", "group", "live"), ("C", "semis", "ht"), ("F", "group", "none"),
    ]
    draft_cycle = ["A", "B", "C", "D", "E", "F", "G", "B"]

    specs: list[Spec] = []
    for i in range(completed):
        specs.append(Spec(0, "completed", done_cycle[i % len(done_cycle)], "champions", variant=i,
                          friendlies=i % 3, cancel_one=i % 5 == 0))
    for i in range(active):
        arch, stage, live = active_cycle[i % len(active_cycle)]
        specs.append(Spec(0, "active", arch, stage, live, second_live=(i % 4 == 0 and stage == "group"),
                          friendlies=1 + i % 2, cancel_one=i % 6 == 3, variant=i))
    for i in range(draft):
        specs.append(Spec(0, "draft", draft_cycle[i % len(draft_cycle)], "group", variant=i, friendlies=i % 2))
    for n, s in enumerate(specs):
        s.index = n
    return specs


# ----------------------------------------------------------------------------------------- simulation


def poisson(rng: random.Random, lam: float) -> int:
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return min(k, 7)
        k += 1


@dataclass
class TeamCtx:
    team: Team
    players: list[Player]  # outfield players (not the manager)
    rating: float


@dataclass
class Build:
    tournament: Tournament
    spec: Spec
    organizer: User
    teams: dict = field(default_factory=dict)  # team id -> TeamCtx
    groups: list = field(default_factory=list)  # Group docs
    group_members: dict = field(default_factory=dict)  # group id -> [team id]
    group_teams: list = field(default_factory=list)
    players: list = field(default_factory=list)
    matches: list = field(default_factory=list)  # in schedule order
    events: list = field(default_factory=list)
    lineups: list = field(default_factory=list)
    expected_stage: str = "group"
    champion: Optional[PydanticObjectId] = None


class Seeder:
    def __init__(self, rng: random.Random, now: datetime, superadmin: User, organizers: list, scorers: dict):
        self.rng, self.now = rng, now
        self.superadmin = superadmin
        self.organizers = organizers
        self.scorers = scorers  # organizer id -> [scorer users]
        self.used_slugs: set[str] = set()
        self.name_counter = 0

    # ---- names -------------------------------------------------------------------------------

    def tournament_name(self, spec: Spec, org_short: str) -> tuple[str, str]:
        cup = CUPS[spec.index % len(CUPS)]
        year = {"completed": self.rng.choice([2025, 2025, 2026]), "active": 2026, "draft": 2027}[spec.kind]
        if spec.kind == "draft":
            year = 2027
        return f"{org_short} {cup} {year}", str(year)

    def team_names(self, n: int) -> list[str]:
        combos = [f"{c} {s}" for c in CITIES for s in SUFFIXES]
        self.rng.shuffle(combos)
        seen_city: set[str] = set()
        out: list[str] = []
        for name in combos:
            city = name.rsplit(" ", 1)[0] if name.rsplit(" ", 1)[1] in SUFFIXES else name
            if city in seen_city:
                continue
            seen_city.add(city)
            out.append(name)
            if len(out) == n:
                break
        return out

    # ---- build one tournament ------------------------------------------------------------------

    def build(self, spec: Spec) -> Build:
        rng = self.rng
        arch = ARCHETYPES[spec.arch]
        organizer = self.organizers[spec.index % len(self.organizers)]
        org_short = organizer.organization_name.split()[0]
        name, season = self.tournament_name(spec, org_short)
        slug = slugify(name)
        base, n = slug, 2
        while slug in self.used_slugs:
            slug, n = f"{base}-{n}", n + 1
        self.used_slugs.add(slug)

        win, draw, loss = POINT_RULES[spec.index % len(POINT_RULES)]
        half = HALVES[spec.index % len(HALVES)]
        config = TournamentConfig(
            num_groups=arch["groups"], teams_per_group=arch["per"], qualifiers_per_group=arch["q"],
            knockout_format=arch["fmt"], points_win=win, points_draw=draw, points_loss=loss,
            half_duration_minutes=half,
        )
        tcolor = PALETTE[spec.index % len(PALETTE)]
        if arch["fmt"] == "none":
            desc = (
                "Single league table, every team plays each other once"
                if arch["groups"] == 1 else f"{arch['groups']} groups of {arch['per']} teams, decided on the group tables"
            )
        else:
            nxt = "quarter-finals" if arch["fmt"] == "quarters_semis_final" else "semi-finals"
            desc = f"{arch['groups']} groups of {arch['per']} teams, top {arch['q']} advance to the {nxt}"
        status = {"completed": "completed", "active": "active", "draft": "draft"}[spec.kind]
        tournament = Tournament(
            id=PydanticObjectId(), organizer_id=organizer.id, name=name, slug=slug, season=season, status=status,
            format_description=desc, stage="group", config=config, logo_url=logo_svg(name, tcolor),
            banner_url=banner_svg(tcolor),
        )
        b = Build(tournament=tournament, spec=spec, organizer=organizer)

        self._build_teams(b, arch, tcolor)
        self._build_groups(b, arch)
        self._build_group_fixtures(b)
        self._play(b)
        self._schedule(b)
        self._assign_scorers(b)
        return b

    def _build_teams(self, b: Build, arch: dict, tcolor: str) -> None:
        rng = self.rng
        n_teams = arch["groups"] * arch["per"]
        names = self.team_names(n_teams)
        colors = PALETTE[:]
        rng.shuffle(colors)
        person_names: set[str] = set()
        seq = 0
        for i, tname in enumerate(names):
            color = colors[i % len(colors)]
            short = "".join(ch for ch in tname if ch.isalpha())[:3].upper()
            team = Team(
                id=PydanticObjectId(), tournament_id=b.tournament.id, name=tname, short_name=short, color=color,
                crest_url=crest_svg(tname, color), logo_url=crest_svg(tname, color),
            )
            numbers = sorted(rng.sample(JERSEYS, 7))
            outfield = []
            roster = []
            # the manager first, then the squad
            for is_manager, number in [(True, 0)] + [(False, n) for n in numbers]:
                while True:
                    pname = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                    if pname not in person_names:
                        person_names.add(pname)
                        break
                seq += 1
                player = Player(
                    id=PydanticObjectId(), tournament_id=b.tournament.id, team_id=team.id, dcl_id=f"DCL-{seq:03d}",
                    player_code=f"PLY-{seq:03d}", name=pname, number=number, is_manager=is_manager,
                    photo_url=player_svg(pname, color),
                )
                roster.append(player)
                if not is_manager:
                    outfield.append(player)
            b.players.extend(roster)
            b.teams[team.id] = TeamCtx(team=team, players=outfield, rating=0.75 + rng.random() * 0.6)
        b.tournament.player_seq = seq

    def _build_groups(self, b: Build, arch: dict) -> None:
        team_ids = list(b.teams)
        self.rng.shuffle(team_ids)
        for gi in range(arch["groups"]):
            group = Group(id=PydanticObjectId(), tournament_id=b.tournament.id, name=chr(65 + gi))
            members = team_ids[gi * arch["per"]:(gi + 1) * arch["per"]]
            b.groups.append(group)
            b.group_members[group.id] = members
            for tid in members:
                b.group_teams.append(GroupTeam(id=PydanticObjectId(), tournament_id=b.tournament.id,
                                               group_id=group.id, team_id=tid))

    def _new_match(self, b: Build, **kw) -> Match:
        return Match(id=PydanticObjectId(), tournament_id=b.tournament.id, match_number=0, **kw)

    def _build_group_fixtures(self, b: Build) -> None:
        per_group = [compute_circle_method_pairs(b.group_members[g.id]) for g in b.groups]
        longest = max(len(p) for p in per_group)
        for i in range(longest):
            for g, pairs in zip(b.groups, per_group):
                if i < len(pairs):
                    t1, t2 = pairs[i]
                    b.matches.append(self._new_match(b, stage="group", group_id=g.id, team1_id=t1, team2_id=t2))

    # ---- results -------------------------------------------------------------------------------

    def _duration(self, b: Build) -> int:
        return 2 * b.tournament.config.half_duration_minutes

    def _simulate(self, b: Build, m: Match, state: str, force_decided: bool = False,
                  penalties: bool = False, elapsed_min: Optional[int] = None) -> None:
        """Sets the match status/clock and records its lineup and events. `state`: ft | live | ht."""
        rng, cfg = self.rng, b.tournament.config
        dur = self._duration(b)
        t1, t2 = b.teams[m.team1_id], b.teams[m.team2_id]
        organizer_id = b.organizer.id

        if state == "ft":
            minutes, frac = dur, 1.0
        elif state == "ht":
            minutes, frac = cfg.half_duration_minutes, 0.5
        else:
            minutes = elapsed_min if elapsed_min is not None else rng.randint(6, dur - 4)
            frac = minutes / dur

        lam1 = max(0.35, min(3.2, 1.35 * t1.rating / t2.rating)) * frac
        lam2 = max(0.35, min(3.2, 1.35 * t2.rating / t1.rating)) * frac
        g1, g2 = poisson(rng, lam1), poisson(rng, lam2)
        if state == "ft" and force_decided:
            if penalties:
                g2 = g1
            else:
                while g1 == g2:
                    g1, g2 = poisson(rng, lam1 + 0.4), poisson(rng, lam2)
                    if g1 == g2:
                        g1 += 1

        def pick(ctx: TeamCtx, exclude=None) -> Player:
            pool = [p for p in ctx.players if p is not exclude]
            weights = [1 + p.number % 5 + (3 if p.number in (9, 10, 11) else 0) for p in pool]
            return rng.choices(pool, weights=weights, k=1)[0]

        for ctx, goals in ((t1, g1), (t2, g2)):
            for minute in sorted(rng.randint(1, max(1, minutes)) for _ in range(goals)):
                scorer = pick(ctx)
                assist = pick(ctx, exclude=scorer) if rng.random() < 0.65 else None
                b.events.append(MatchEvent(
                    id=PydanticObjectId(), match_id=m.id, type="goal", team_id=ctx.team.id, player_id=scorer.id,
                    assist_player_id=assist.id if assist else None, minute=minute, created_by=organizer_id))
        for _ in range(poisson(rng, 1.0 * (0.4 + frac))):
            ctx = rng.choice((t1, t2))
            b.events.append(MatchEvent(
                id=PydanticObjectId(), match_id=m.id, type="yellow", team_id=ctx.team.id,
                player_id=pick(ctx).id, minute=rng.randint(2, max(3, minutes)), created_by=organizer_id))
        if rng.random() < 0.07 * (0.4 + frac):
            ctx = rng.choice((t1, t2))
            b.events.append(MatchEvent(
                id=PydanticObjectId(), match_id=m.id, type="red", team_id=ctx.team.id,
                player_id=pick(ctx).id, minute=rng.randint(10, max(11, minutes)), created_by=organizer_id))
        if state == "ft":
            if g1 != g2:
                star_ctx = t1 if g1 > g2 else t2
            elif m.winner_override_id is not None or penalties:
                star_ctx = rng.choice((t1, t2))
            else:
                star_ctx = rng.choice((t1, t2))
            goal_scorers = [e.player_id for e in b.events if e.match_id == m.id and e.type == "goal"
                            and e.team_id == star_ctx.team.id]
            star = goal_scorers[0] if goal_scorers else pick(star_ctx).id
            b.events.append(MatchEvent(
                id=PydanticObjectId(), match_id=m.id, type="potm", team_id=star_ctx.team.id, player_id=star,
                minute=None, created_by=organizer_id))
            if penalties and g1 == g2:
                m.winner_override_id = rng.choice((t1, t2)).team.id

        for ctx in (t1, t2):
            for i, p in enumerate(ctx.players):
                b.lineups.append(MatchLineup(id=PydanticObjectId(), match_id=m.id, team_id=ctx.team.id,
                                             player_id=p.id, is_starting=i < 6))

        # clock fields; the schedule pass fills date/time and absolute kickoff for finished matches
        m.status = "live" if state in ("live", "ht") else "full_time"
        m.duration_minutes = dur
        if state == "ht":
            m.is_half_time = True
            m.elapsed_seconds = cfg.half_duration_minutes * 60
            m.started_at = self.now - timedelta(seconds=m.elapsed_seconds + 240)
        elif state == "live":
            m.is_half_time = False
            m.elapsed_seconds = 0
            m.started_at = self.now - timedelta(minutes=minutes, seconds=rng.randint(0, 50))

    def _winner(self, b: Build, m: Match) -> Optional[PydanticObjectId]:
        g1 = sum(1 for e in b.events if e.match_id == m.id and e.type == "goal" and e.team_id == m.team1_id)
        g2 = sum(1 for e in b.events if e.match_id == m.id and e.type == "goal" and e.team_id == m.team2_id)
        if m.status != "full_time":
            return None
        return m.team1_id if g1 > g2 else m.team2_id if g2 > g1 else m.winner_override_id

    def _table(self, b: Build, group: Group) -> list[PydanticObjectId]:
        """Group order by points, goal difference, goals for, name (the app's own ordering)."""
        cfg = b.tournament.config
        rows = {tid: [0, 0, 0] for tid in b.group_members[group.id]}  # points, gd, gf
        for m in b.matches:
            if m.stage != "group" or m.group_id != group.id or m.status != "full_time":
                continue
            g1 = sum(1 for e in b.events if e.match_id == m.id and e.type == "goal" and e.team_id == m.team1_id)
            g2 = sum(1 for e in b.events if e.match_id == m.id and e.type == "goal" and e.team_id == m.team2_id)
            for tid, gf, ga in ((m.team1_id, g1, g2), (m.team2_id, g2, g1)):
                rows[tid][1] += gf - ga
                rows[tid][2] += gf
                rows[tid][0] += cfg.points_win if gf > ga else cfg.points_draw if gf == ga else cfg.points_loss
        return sorted(rows, key=lambda t: (-rows[t][0], -rows[t][1], -rows[t][2], b.teams[t].team.name))

    def _play(self, b: Build) -> None:
        rng, spec, cfg = self.rng, b.spec, b.tournament.config
        group_matches = [m for m in b.matches if m.stage == "group"]
        total = len(group_matches)

        # ---- group stage states
        if spec.kind == "draft":
            states = ["up"] * total
        elif spec.kind == "completed" or spec.stage != "group":
            states = ["ft"] * total
        else:
            done = max(2, int(total * (0.35 + 0.45 * rng.random())))
            done = min(done, total - 1)
            states = ["ft"] * done + ["up"] * (total - done)
            if spec.live != "none":
                states[done] = spec.live
                if spec.second_live and done + 1 < total - 1:
                    states[done + 1] = "live"
        if spec.cancel_one and spec.kind != "draft" and total > 3:
            if spec.kind == "completed":
                states[-1] = "cancelled"  # a fixture that was rained off and never replayed
            else:
                for i in range(total - 1, -1, -1):
                    if states[i] == "up":
                        states[i] = "cancelled"
                        break
        for m, st in zip(group_matches, states):
            if st == "cancelled":
                m.status = "cancelled"
            elif st != "up":
                self._simulate(b, m, st)

        # ---- knockout
        fmt = cfg.knockout_format
        if fmt != "none" and spec.kind != "draft" and (spec.kind == "completed" or spec.stage != "group"):
            self._build_knockout(b)
        elif spec.kind == "completed" and fmt == "none":
            standing = self._table(b, b.groups[0])
            b.champion = standing[0]

        # ---- friendlies
        pool = list(b.teams)
        for i in range(spec.friendlies):
            t1, t2 = rng.sample(pool, 2)
            m = self._new_match(b, stage="extra", label="Friendly", team1_id=t1, team2_id=t2,
                                notes=rng.choice(["Warm-up fixture", "Charity friendly", "Exhibition match"]))
            b.matches.append(m)
            if spec.kind == "draft" or (spec.kind == "active" and i == spec.friendlies - 1):
                m.status = "upcoming"
            else:
                self._simulate(b, m, "ft")

        # the tournament's own stage / champion expectation (checked later against the real services)
        b.expected_stage = spec.stage if spec.kind != "draft" else "group"
        if fmt == "none":
            b.expected_stage = "champions" if spec.kind == "completed" else "group"

    def _build_knockout(self, b: Build) -> None:
        rng, spec, cfg = self.rng, b.spec, b.tournament.config
        fmt, k = cfg.knockout_format, cfg.qualifiers_per_group
        size = KNOCKOUT_SIZES[fmt]
        tables = [self._table(b, g) for g in b.groups]

        legacy = _LEGACY_PAIRINGS.get((size, len(tables), k))
        pool = [(r, g_idx, tid) for g_idx, table in enumerate(tables) for r, tid in enumerate(table[:k])]
        if legacy is not None and len(pool) == size:
            pairings = [(tables[g1][r1], tables[g2][r2]) for (g1, r1), (g2, r2) in legacy]
        else:
            pool.sort(key=lambda x: (x[0], x[1]))
            seeds = [tid for *_x, tid in pool[:size]]
            pairings = [(seeds[a], seeds[c]) for a, c in _fold_order(size)]

        quarters_fmt = fmt == "quarters_semis_final"
        slots: dict[str, Match] = {}

        def slot(stage, name, label, round_order, notes=None) -> Match:
            m = self._new_match(b, stage=stage, bracket_slot=name, round_order=round_order, label=label, notes=notes)
            slots[name] = m
            b.matches.append(m)
            return m

        if quarters_fmt:
            for i in range(4):
                q = slot("quarter", f"QF{i + 1}", f"Quarter-final {i + 1}", 1)
                q.team1_id, q.team2_id = pairings[i]
            slot("semi", "SF1", "Semi-final 1", 2, "Winner QF1 vs Winner QF2")
            slot("semi", "SF2", "Semi-final 2", 2, "Winner QF3 vs Winner QF4")
            slot("final", "FINAL", "Final", 3, "Winner SF1 vs Winner SF2")
        else:
            for i, (n, notes) in enumerate((("SF1", "Group A (2nd) vs Group B (1st)"), ("SF2", "Group B (2nd) vs Group A (1st)"))):
                s = slot("semi", n, f"Semi-final {i + 1}", 1, notes if len(tables) == 2 else None)
                s.team1_id, s.team2_id = pairings[i]

        completed = spec.kind == "completed"
        stage = spec.stage
        live = spec.live
        variant = spec.variant

        def run(m: Match, state: str) -> None:
            if state == "up":
                return
            if state == "ft":
                self._simulate(b, m, "ft", force_decided=True, penalties=rng.random() < PENALTY_SHARE)
            else:
                self._simulate(b, m, state)

        def advance(src: str, dst: str, field_name: str) -> None:
            winner = self._winner(b, slots[src])
            target = slots.get(dst)
            if winner is not None and target is not None:
                setattr(target, field_name, winner)

        def ensure_final() -> Match:
            if "FINAL" not in slots:
                slot("final", "FINAL", "Final", 2, "Winner SF1 vs Winner SF2")
            return slots["FINAL"]

        if quarters_fmt:
            qstates = ["ft"] * 4 if completed else None
            if not completed:
                if stage == "quarters":
                    qstates = [live if live != "none" else "up", "up", "up", "up"]
                elif stage == "semis":
                    qstates = ["ft", "ft", "ft", "ft"] if variant % 2 == 0 else ["ft", "ft", live if live != "none" else "up", "up"]
                else:
                    qstates = ["ft"] * 4
            for i, st in enumerate(qstates):
                run(slots[f"QF{i + 1}"], st)
            for i, (src, dst, fld) in enumerate((("QF1", "SF1", "team1_id"), ("QF2", "SF1", "team2_id"),
                                                 ("QF3", "SF2", "team1_id"), ("QF4", "SF2", "team2_id"))):
                advance(src, dst, fld)

        # semis
        if completed or stage == "final":
            sstates = ["ft", "ft"]
        elif stage == "semis":
            if quarters_fmt and variant % 2 == 1:
                sstates = ["up", "up"]  # semis are only half filled in
            else:
                sstates = ["ft", live if live != "none" else "up"]
        else:
            sstates = ["up", "up"]
        for name, st in zip(("SF1", "SF2"), sstates):
            if slots[name].team1_id and slots[name].team2_id:
                run(slots[name], st)
        for src, fld in (("SF1", "team1_id"), ("SF2", "team2_id")):
            if self._winner(b, slots[src]) is not None:
                ensure_final()
                advance(src, "FINAL", fld)

        # final
        if "FINAL" in slots and slots["FINAL"].team1_id and slots["FINAL"].team2_id:
            if completed:
                run(slots["FINAL"], "ft")
            elif stage == "final":
                run(slots["FINAL"], live if live != "none" else "up")
        if completed and "FINAL" in slots:
            b.champion = self._winner(b, slots["FINAL"])

    # ---- schedule ------------------------------------------------------------------------------

    def _schedule(self, b: Build) -> None:
        rng, spec = self.rng, b.spec
        today = self.now.date()
        times = ["10:00", "13:30", "16:00"]
        league = [m for m in b.matches if m.stage != "extra"]
        friendlies = [m for m in b.matches if m.stage == "extra"]
        order = league + friendlies
        for n, m in enumerate(order, start=1):
            m.match_number = n

        if spec.kind == "completed":
            span = math.ceil(len(league) / 3) + 2
            end = date(2026, 10, 24) - timedelta(days=rng.randint(0, 300))
            start = end - timedelta(days=span)
        elif spec.kind == "draft":
            start = today + timedelta(days=rng.randint(9, 70))
        else:
            first_open = next((i for i, m in enumerate(league) if m.status != "full_time"), len(league))
            start = today - timedelta(days=first_open // 3)

        for k, m in enumerate(league):
            day = start + timedelta(days=k // 3)
            m.date, m.time = day.isoformat(), times[k % 3]
            m.venue = VENUES[(spec.index + k) % len(VENUES)]
        for i, m in enumerate(friendlies):
            if m.status == "full_time":
                day = start + timedelta(days=rng.randint(0, max(1, math.ceil(len(league) / 3))))
                if spec.kind == "active" and day >= today:
                    day = today - timedelta(days=rng.randint(1, 6))
            else:
                day = max(today, start) + timedelta(days=rng.randint(1, 12))
            m.date, m.time, m.venue = day.isoformat(), times[(i + 1) % 3], VENUES[(spec.index + i + 3) % len(VENUES)]

        for m in order:
            if m.status == "live":  # in progress right now: today, kicked off when the clock says so
                m.date = m.started_at.date().isoformat()
                m.time = m.started_at.strftime("%H:%M")
            elif m.status == "full_time":
                kickoff = datetime.fromisoformat(f"{m.date}T{m.time}:00").replace(tzinfo=timezone.utc)
                if kickoff >= self.now - timedelta(hours=1):
                    kickoff = self.now - timedelta(hours=2, minutes=rng.randint(0, 50))
                    m.date, m.time = kickoff.date().isoformat(), kickoff.strftime("%H:%M")
                m.started_at = kickoff
                m.ended_at = kickoff + timedelta(minutes=(m.duration_minutes or 50) + rng.randint(4, 10))

    def _assign_scorers(self, b: Build) -> None:
        mine = self.scorers.get(b.organizer.id, [])
        if not mine:
            return
        for n, m in enumerate(b.matches):
            if m.status in ("live", "upcoming") or (m.status == "full_time" and n % 2 == 0):
                m.assigned_scorer_ids = [mine[(b.spec.index + n) % len(mine)].id]


# ----------------------------------------------------------------------------------------- persistence


async def bulk_insert(model, docs: list, chunk: int = 1000) -> None:
    for i in range(0, len(docs), chunk):
        await model.insert_many(docs[i:i + chunk])


def _player_statistics(builds: list[Build]) -> list[PlayerStatistics]:
    out = []
    for b in builds:
        extra = {m.id for m in b.matches if m.stage == "extra"}
        player_team = {p.id: p.team_id for p in b.players}
        stats: dict = {}

        def row(pid):
            return stats.setdefault(pid, dict(appearances=0, goals=0, assists=0, yellow_cards=0, red_cards=0,
                                             potm_awards=0))

        for le in b.lineups:
            if le.match_id not in extra:
                row(le.player_id)["appearances"] += 1
        for e in b.events:
            if e.match_id in extra:
                continue
            if e.type == "goal":
                row(e.player_id)["goals"] += 1
                if e.assist_player_id:
                    row(e.assist_player_id)["assists"] += 1
            elif e.type == "yellow":
                row(e.player_id)["yellow_cards"] += 1
            elif e.type == "red":
                row(e.player_id)["red_cards"] += 1
            elif e.type == "potm":
                row(e.player_id)["potm_awards"] += 1
        for pid, values in stats.items():
            out.append(PlayerStatistics(id=PydanticObjectId(), tournament_id=b.tournament.id, player_id=pid,
                                        team_id=player_team[pid], **values))
    return out


async def remove_demo_data(db) -> dict:
    """Removes exactly what a previous run created. Never touches R2 or non-demo data."""
    demo_users = await User.find({"username": {"$regex": f"^{DEMO_PREFIX}"}}).to_list()
    demo_ids = [u.id for u in demo_users]
    tournaments = await Tournament.find({"organizer_id": {"$in": demo_ids}}).to_list() if demo_ids else []
    t_ids = [t.id for t in tournaments]
    removed = {"tournaments": len(t_ids), "users": len(demo_ids)}
    if t_ids:
        match_ids = [m.id for m in await Match.find({"tournament_id": {"$in": t_ids}}).to_list()]
        if match_ids:
            await MatchEvent.find({"match_id": {"$in": match_ids}}).delete()
            await MatchLineup.find({"match_id": {"$in": match_ids}}).delete()
        for model in (Match, PlayerStatistics, GroupTeam, Player, Team, Group):
            await model.find({"tournament_id": {"$in": t_ids}}).delete()
        from app.models import TournamentStanding

        await TournamentStanding.find({"tournament_id": {"$in": t_ids}}).delete()
        await Tournament.find({"_id": {"$in": t_ids}}).delete()
    if demo_ids:
        await User.find({"_id": {"$in": demo_ids}}).delete()
    await db["demo_seed_state"].delete_one({"_id": STATE_ID})
    return removed


async def verify(builds: list[Build], rng: random.Random) -> list[str]:
    """Checks the seeded database against the app's own services. Returns a list of problems."""
    problems: list[str] = []
    for b in builds:
        t = await Tournament.get(b.tournament.id)
        if t.stage != b.expected_stage:
            problems.append(f"{t.slug}: stage {t.stage!r}, expected {b.expected_stage!r}")
        if b.spec.kind == "completed":
            if t.status != "completed" or t.champion_team_id is None:
                problems.append(f"{t.slug}: completed tournament has status {t.status!r} / champion {t.champion_team_id}")
            elif b.champion and t.champion_team_id != b.champion:
                problems.append(f"{t.slug}: champion differs from the simulated winner")
        if b.spec.kind == "active" and t.status != "active":
            problems.append(f"{t.slug}: active tournament has status {t.status!r}")
        if b.spec.kind == "draft" and (t.status != "draft" or t.champion_team_id):
            problems.append(f"{t.slug}: draft tournament is {t.status!r}")
        changed = await recompute_bracket(t.id)
        if changed:
            problems.append(f"{t.slug}: bracket was not self-consistent ({len(changed)} slot(s) changed)")
    squad = [p for b in builds for p in b.players if not p.is_manager]
    sample = rng.sample(squad, min(25, len(squad)))
    for p in sample:
        before = await PlayerStatistics.find_one(PlayerStatistics.player_id == p.id)
        after = await recalculate_player_statistics(p.id)
        fields = ("appearances", "goals", "assists", "yellow_cards", "red_cards", "potm_awards")
        if before is None:
            if after and any(getattr(after, f) for f in fields):
                problems.append(f"player {p.name}: missing statistics row")
        elif any(getattr(before, f) != getattr(after, f) for f in fields):
            problems.append(f"player {p.name}: seeded statistics differ from a fresh recalculation")
    return problems


async def seed_demo(total: int = 50, seed_value: int = 2026, reset: bool = False) -> dict:
    """Core of the seed. Expects an initialised database (see `seed` for the CLI wrapper)."""
    settings = get_settings()
    db = get_client()[settings.mongo_db_name]
    result: dict = {"database": settings.mongo_db_name}
    if reset:
        result["removed"] = await remove_demo_data(db)
    state = await db["demo_seed_state"].find_one({"_id": STATE_ID})
    if state is not None:
        result["status"] = "already-seeded"
        result["seeded"] = state.get("summary")
        return result

    rng = random.Random(seed_value)
    now = datetime.now(timezone.utc)
    password_hash = hash_password(DEMO_PASSWORD)  # hashed once and shared: demo logins all use it

    superadmin = await User.find_one(User.role == UserRole.SUPER_ADMIN)
    created_superadmin = superadmin is None
    if created_superadmin:
        superadmin = User(id=PydanticObjectId(), username=f"{DEMO_PREFIX}superadmin", password_hash=password_hash,
                          role=UserRole.SUPER_ADMIN, email="demo_superadmin@example.com")
        await superadmin.insert()

    organizers = [
        User(id=PydanticObjectId(), username=f"{DEMO_PREFIX}{slug}", password_hash=password_hash,
             role=UserRole.ORGANIZER, organization_name=org_name, email=f"{DEMO_PREFIX}{slug}@example.com",
             created_by=superadmin.id)
        for slug, org_name in ORGANIZERS
    ]
    scorers_by_org: dict = {o.id: [] for o in organizers}
    scorers = []
    for i in range(SCORERS_TOTAL):
        owner = organizers[i % len(organizers)]
        s = User(id=PydanticObjectId(), username=f"{DEMO_PREFIX}scorer_{i + 1:02d}", password_hash=password_hash,
                 role=UserRole.SCORER, created_by=owner.id)
        scorers.append(s)
        scorers_by_org[owner.id].append(s)
    await bulk_insert(User, organizers + scorers)

    seeder = Seeder(rng, now, superadmin, organizers, scorers_by_org)
    seeder.used_slugs = {t.slug for t in await Tournament.find_all().to_list() if t.slug}
    builds = [seeder.build(spec) for spec in plan_tournaments(total)]

    await bulk_insert(Tournament, [b.tournament for b in builds])
    await bulk_insert(Group, [g for b in builds for g in b.groups])
    await bulk_insert(Team, [c.team for b in builds for c in b.teams.values()])
    await bulk_insert(GroupTeam, [gt for b in builds for gt in b.group_teams])
    await bulk_insert(Player, [p for b in builds for p in b.players])
    await bulk_insert(Match, [m for b in builds for m in b.matches])
    await bulk_insert(MatchLineup, [x for b in builds for x in b.lineups])
    await bulk_insert(MatchEvent, [e for b in builds for e in b.events])
    await bulk_insert(PlayerStatistics, _player_statistics(builds))

    # standings and stage / champion come from the app's own services, not from this script
    for b in builds:
        for g in b.groups:
            await recalculate_group_standings(g.id)
        t = await refresh_tournament_stage(b.tournament.id)
        if b.champion and t.champion_team_id != b.champion:
            pass  # reported by verify()
    problems = await verify(builds, rng)

    counts = {
        "users": await User.find_all().count(),
        "tournaments": await Tournament.find_all().count(),
        "teams": await Team.find_all().count(),
        "players": await Player.find_all().count(),
        "groups": await Group.find_all().count(),
        "matches": await Match.find_all().count(),
        "live_matches": await Match.find(Match.status == "live").count(),
        "half_time_matches": await Match.find(Match.is_half_time == True, Match.status == "live").count(),  # noqa: E712
        "match_events": await MatchEvent.find_all().count(),
        "match_lineups": await MatchLineup.find_all().count(),
    }
    summary = {
        "demo_password": DEMO_PASSWORD,
        "superadmin": superadmin.username,
        "superadmin_created_by_seed": created_superadmin,
        "organizers": [o.username for o in organizers],
        "scorers": len(scorers),
        "tournaments": {k: sum(1 for b in builds if b.spec.kind == k) for k in ("completed", "active", "draft")},
        "stages": {s: sum(1 for b in builds if b.spec.kind == "active" and b.spec.stage == s)
                   for s in ("group", "quarters", "semis", "final")},
        "problems": problems,
    }
    await db["demo_seed_state"].replace_one(
        {"_id": STATE_ID}, {"_id": STATE_ID, "seeded_at": now, "summary": summary, "seed": seed_value}, upsert=True)
    result.update(status="seeded", counts=counts, **summary)
    return result


async def seed(total: int = 50, seed_value: int = 2026, reset: bool = False,
               allow_test_db: bool = False, allow_production: bool = False) -> dict:
    settings = get_settings()
    if settings.environment == "production" and not allow_production:
        raise SystemExit("Refusing to seed demo data with ENVIRONMENT=production (use --allow-production).")
    if "test" in settings.mongo_db_name.lower() and not allow_test_db:
        raise SystemExit(f"Refusing to seed the test database {settings.mongo_db_name!r} (use --allow-test-db).")
    await init_db()
    try:
        return await seed_demo(total, seed_value, reset)
    finally:
        await close_db()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="remove the previously seeded demo data, then reseed")
    parser.add_argument("--tournaments", type=int, default=50, help="how many tournaments to create (default 50)")
    parser.add_argument("--seed", type=int, default=2026, help="random seed for the generated structure/results")
    parser.add_argument("--allow-test-db", action="store_true")
    parser.add_argument("--allow-production", action="store_true")
    args = parser.parse_args()

    result = asyncio.run(seed(args.tournaments, args.seed, args.reset, args.allow_test_db, args.allow_production))
    print(f"Database: {result['database']}")
    if "removed" in result:
        print(f"Removed previous demo data: {result['removed']}")
    if result["status"] == "already-seeded":
        print("Demo data is already seeded - nothing to do (use --reset to rebuild it).")
        return
    print("Seeded:")
    for name, count in result["counts"].items():
        print(f"  {name:<18} {count}")
    print(f"Tournaments: {result['tournaments']}  active stages: {result['stages']}")
    print(f"Logins (all use password {result['demo_password']!r}): organizers {', '.join(result['organizers'][:3])}, ...; "
          f"scorers demo_scorer_01..{result['scorers']:02d}")
    if result["problems"]:
        print("VERIFICATION PROBLEMS:")
        for p in result["problems"]:
            print(f"  - {p}")
        raise SystemExit(1)
    print("Verification: OK")


if __name__ == "__main__":
    main()
