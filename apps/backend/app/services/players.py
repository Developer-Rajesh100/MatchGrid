from beanie import PydanticObjectId
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError, NotFoundError
from app.models import Match, MatchEvent, MatchLineup, Player, PlayerStatistics, Team
from app.schemas.player import (
    GoalLogEntryOut,
    MatchHistoryEntryOut,
    PlayerDetailOut,
    PlayerStatsOut,
    PlayerCreate,
    PlayerUpdate,
)
from app.services.serializers import player_to_out


async def _unset_other_managers(team_id: PydanticObjectId, keep_player_id: PydanticObjectId) -> None:
    await Player.find(Player.team_id == team_id, Player.is_manager == True).update(  # noqa: E712
        {"$set": {"is_manager": False}},
    )
    await Player.find(Player.id == keep_player_id).update({"$set": {"is_manager": True}})


async def create_player(payload: PlayerCreate) -> Player:
    team = await Team.get(PydanticObjectId(payload.team_id))
    if team is None:
        raise NotFoundError("Team not found")

    existing_count = await Player.find_all().count()
    dcl_id = f"DCL-{existing_count + 1:03d}"
    for attempt in range(1, 6):
        try:
            player = Player(
                tournament_id=team.tournament_id,
                team_id=team.id,
                dcl_id=dcl_id,
                name=payload.name,
                number=payload.number,
                is_manager=False,
                photo_url=payload.photo_url,
            )
            await player.insert()
            break
        except DuplicateKeyError as exc:
            if "dcl_id" in str(exc):
                dcl_id = f"DCL-{existing_count + 1 + attempt:03d}"
                continue
            raise ConflictError(
                f"Jersey number {payload.number} is already used on this team"
            ) from exc
    else:  # pragma: no cover - defensive
        raise ConflictError("Could not allocate a unique DCL ID, try again")

    if payload.is_manager:
        await _unset_other_managers(team.id, player.id)
        player.is_manager = True

    return player


async def update_player(player: Player, payload: PlayerUpdate) -> Player:
    data = payload.model_dump(exclude_unset=True)
    make_manager = data.pop("is_manager", None)

    # Checked explicitly rather than relying on catching DuplicateKeyError
    # from .save(): Beanie's revisioned save() intercepts the unique-index
    # violation itself and re-raises it as RevisionIdWasChanged (an
    # "updated by someone else" signal), so a plain except DuplicateKeyError
    # here never actually fires — found via a test added during the Timer/
    # Half-Time audit's Test Coverage follow-up. Without this check, an
    # admin renumbering a player to an already-used jersey number would hit
    # an unhandled 500 instead of a clean error.
    new_number = data.get("number")
    if new_number is not None and new_number != player.number:
        conflict = await Player.find_one(Player.team_id == player.team_id, Player.number == new_number)
        if conflict is not None:
            raise ConflictError(f"Jersey number {new_number} is already used on this team")

    old_photo = player.photo_url
    for field, value in data.items():
        setattr(player, field, value)

    await player.save()

    new_photo = player.photo_url
    if old_photo and new_photo != old_photo:
        from app.services.storage import get_storage_service
        await get_storage_service().delete_image(old_photo)

    if make_manager is True:
        await _unset_other_managers(player.team_id, player.id)
        player.is_manager = True
    elif make_manager is False:
        player.is_manager = False
        await player.save()

    return player


async def delete_player(player: Player) -> None:
    has_events = await MatchEvent.find(MatchEvent.player_id == player.id).count()
    has_lineups = await MatchLineup.find(MatchLineup.player_id == player.id).count()
    if has_events or has_lineups:
        raise ConflictError(
            "Cannot remove a player who already has recorded match events or lineup entries"
        )
    old_photo = player.photo_url
    await player.delete()
    if old_photo:
        from app.services.storage import get_storage_service
        await get_storage_service().delete_image(old_photo)


async def get_player_detail(player: Player) -> PlayerDetailOut:
    team = await Team.get(player.team_id)
    stats_row = await PlayerStatistics.find_one(PlayerStatistics.player_id == player.id)
    stats = PlayerStatsOut(
        appearances=stats_row.appearances if stats_row else 0,
        goals=stats_row.goals if stats_row else 0,
        assists=stats_row.assists if stats_row else 0,
        yellow_cards=stats_row.yellow_cards if stats_row else 0,
        red_cards=stats_row.red_cards if stats_row else 0,
        potm_awards=stats_row.potm_awards if stats_row else 0,
    )

    matches = await Match.find(
        {
            "$or": [{"team1_id": player.team_id}, {"team2_id": player.team_id}],
            "status": {"$ne": "upcoming"},
            "stage": {"$ne": "extra"},
        }
    ).sort("match_number").to_list()

    opponents = await Team.find(
        {"_id": {"$in": [m.team2_id if m.team1_id == player.team_id else m.team1_id for m in matches]}}
    ).to_list()
    opponents_by_id = {t.id: t for t in opponents}

    # One query for every event across all of this player's matches, instead
    # of the previous 2 queries per match (compute_score's own goal-event
    # fetch, plus a separate full-event fetch right after) — found during the
    # Timer/Half-Time audit's Performance & Scalability follow-up.
    match_ids = [m.id for m in matches]
    all_events = (
        await MatchEvent.find({"match_id": {"$in": match_ids}}).to_list() if match_ids else []
    )
    events_by_match: dict = {}
    for e in all_events:
        events_by_match.setdefault(e.match_id, []).append(e)

    history: list[MatchHistoryEntryOut] = []
    goal_log: list[GoalLogEntryOut] = []

    for match in matches:
        is_team1 = match.team1_id == player.team_id
        opponent_id = match.team2_id if is_team1 else match.team1_id
        opponent = opponents_by_id.get(opponent_id)
        events = events_by_match.get(match.id, [])
        score1 = sum(1 for e in events if e.type == "goal" and e.team_id == match.team1_id)
        score2 = sum(1 for e in events if e.type == "goal" and e.team_id == match.team2_id)
        my_score, opp_score = (score1, score2) if is_team1 else (score2, score1)

        if match.status == "live":
            result = "Live"
        elif my_score > opp_score:
            result = "Won"
        elif my_score < opp_score:
            result = "Lost"
        else:
            result = "Drew"

        goals = sum(1 for e in events if e.type == "goal" and e.player_id == player.id)
        assists = sum(1 for e in events if e.type == "goal" and e.assist_player_id == player.id)
        yellow = sum(1 for e in events if e.type == "yellow" and e.player_id == player.id)
        red = sum(1 for e in events if e.type == "red" and e.player_id == player.id)
        potm = any(e.type == "potm" and e.player_id == player.id for e in events)
        label = match.label or "Group stage"

        history.append(
            MatchHistoryEntryOut(
                match_id=str(match.id),
                label=label,
                opponent_name=opponent.name if opponent else "TBD",
                result=result,
                my_score=my_score,
                opponent_score=opp_score,
                goals=goals,
                assists=assists,
                yellow_cards=yellow,
                red_cards=red,
                potm=potm,
            )
        )

        for e in events:
            if e.type == "goal" and e.player_id == player.id:
                goal_log.append(
                    GoalLogEntryOut(
                        match_id=str(match.id),
                        label=label,
                        opponent_name=opponent.name if opponent else "TBD",
                        minute=e.minute,
                    )
                )

    base = player_to_out(player, team)
    return PlayerDetailOut(**base.model_dump(), stats=stats, history=history, goal_log=goal_log)
