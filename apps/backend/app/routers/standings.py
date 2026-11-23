from beanie import PydanticObjectId
from fastapi import APIRouter

from app.core.errors import NotFoundError
from app.models import Group, Team
from app.schemas.standing import GroupStandingsOut, StandingOut
from app.services.standings import sorted_group_standings
from app.services.tournament_scope import get_active_tournament_id

router = APIRouter(prefix="/standings", tags=["standings"])


async def _group_standings_out(group: Group) -> GroupStandingsOut:
    rows = await sorted_group_standings(group.id)
    teams = {t.id: t for t in await Team.find({"_id": {"$in": [r.team_id for r in rows]}}).to_list()}
    return GroupStandingsOut(
        group_id=str(group.id),
        group_name=group.name,
        standings=[
            StandingOut(
                team_id=str(r.team_id),
                team_name=teams[r.team_id].name if r.team_id in teams else "Unknown",
                team_color=teams[r.team_id].color if r.team_id in teams else "#888888",
                played=r.played,
                won=r.won,
                drawn=r.drawn,
                lost=r.lost,
                goals_for=r.goals_for,
                goals_against=r.goals_against,
                goal_difference=r.goal_difference,
                points=r.points,
            )
            for r in rows
        ],
    )


@router.get("", response_model=list[GroupStandingsOut])
async def list_standings() -> list[GroupStandingsOut]:
    tournament_id = await get_active_tournament_id()
    groups = await Group.find(Group.tournament_id == tournament_id).sort("name").to_list()
    return [await _group_standings_out(g) for g in groups]


@router.get("/{group_id}", response_model=GroupStandingsOut)
async def get_group_standings(group_id: str) -> GroupStandingsOut:
    group = await Group.get(PydanticObjectId(group_id))
    if group is None:
        raise NotFoundError("Group not found")
    return await _group_standings_out(group)
