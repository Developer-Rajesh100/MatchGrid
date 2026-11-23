"""Creates the fixed knockout match slots (Semi-final 1, Semi-final 2, Final)
if they don't already exist. Idempotent.

Unlike group matches (which depend on teams/groups being assigned first),
these 3 slots always exist for this tournament's fixed format — same
reasoning as migration 0002 creating the singleton Tournament/Groups.
Without this, a deployment that never runs the dev seed script (i.e. any
real deployment using Part 4's data importer instead) would have no way to
ever generate semi-finals: app.services.matches.generate_semis() requires 2
existing stage="semi" match documents to fill in, and previously only the
dev-only seed script created them.
"""

from app.models import Match, Tournament

NAME = "0004_knockout_match_slots"

SLOTS = [
    {"match_number": 7, "stage": "semi", "label": "Semi-final 1"},
    {"match_number": 8, "stage": "semi", "label": "Semi-final 2"},
    {"match_number": 9, "stage": "final", "label": "Final"},
]


async def up() -> None:
    tournament = await Tournament.find_one()
    if tournament is None:
        return

    for slot in SLOTS:
        existing = await Match.find_one(
            Match.tournament_id == tournament.id, Match.stage == slot["stage"], Match.label == slot["label"]
        )
        if existing is None:
            await Match(
                tournament_id=tournament.id,
                match_number=slot["match_number"],
                stage=slot["stage"],
                label=slot["label"],
                status="upcoming",
            ).insert()
