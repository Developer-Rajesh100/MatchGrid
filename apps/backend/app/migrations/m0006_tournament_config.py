"""Tournament Engine Migration:
1. Backfills Tournament.config with default TournamentConfig if missing.
2. Backfills existing knockout matches with bracket_slot and round_order.
"""

from app.models import Match, Tournament, TournamentConfig

NAME = "0006_tournament_config"


async def up() -> None:
    # 1. Backfill Tournaments
    tournaments = await Tournament.find_all().to_list()
    for t in tournaments:
        if not getattr(t, "config", None):
            t.config = TournamentConfig(
                num_groups=2,
                teams_per_group=3,
                qualifiers_per_group=2,
                knockout_format="semis_final",
                points_win=3,
                points_draw=1,
                points_loss=0,
                half_duration_minutes=25,
            )
            await t.save()

    # 2. Backfill existing knockout match bracket slots
    matches = await Match.find_all().to_list()
    for m in matches:
        changed = False
        if m.stage == "semi":
            if getattr(m, "bracket_slot", None) is None:
                m.bracket_slot = "SF1" if "1" in (m.label or "") else "SF2"
                changed = True
            if getattr(m, "round_order", None) is None:
                m.round_order = 1
                changed = True
        elif m.stage == "final":
            if getattr(m, "bracket_slot", None) is None:
                m.bracket_slot = "FINAL"
                changed = True
            if getattr(m, "round_order", None) is None:
                m.round_order = 2
                changed = True
        if changed:
            await m.save()
