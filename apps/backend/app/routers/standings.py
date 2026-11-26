from typing import Optional
from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_optional_user

from app.core.errors import NotFoundError
from app.models import Group, Team, User
from app.schemas.standing import GroupStandingsOut, StandingOut
from app.services.standings import sorted_group_standings
from app.services.tournament_scope import ensure_tournament_visible, resolve_tournament_id

router = APIRouter(prefix="/standings", tags=["standings"])


async def _group_standings_out(group: Group, teams: dict | None = None) -> GroupStandingsOut:
    if teams is None:
        teams = {t.id: t for t in await Team.find(Team.tournament_id == group.tournament_id).to_list()}
    rows = await sorted_group_standings(group.id, teams)
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
                crest_url=teams[r.team_id].crest if r.team_id in teams else None,
            )
            for r in rows
        ],
    )


@router.get("", response_model=list[GroupStandingsOut])
async def list_standings(
    tournament_id: Optional[str] = Query(default=None),
    tournament_slug: Optional[str] = Query(default=None),
    viewer: Optional[User] = Depends(get_optional_user),
) -> list[GroupStandingsOut]:
    tid = await resolve_tournament_id(tournament_id, tournament_slug, viewer)
    groups = await Group.find(Group.tournament_id == tid).sort("name").to_list()
    teams = {t.id: t for t in await Team.find(Team.tournament_id == tid).to_list()}
    return [await _group_standings_out(g, teams) for g in groups]


@router.get("/{group_id}", response_model=GroupStandingsOut)
async def get_group_standings(group_id: str, viewer: Optional[User] = Depends(get_optional_user)) -> GroupStandingsOut:
    group = await Group.get(PydanticObjectId(group_id))
    if group is None:
        raise NotFoundError("Group not found")
    try:
        await ensure_tournament_visible(group.tournament_id, viewer)
    except NotFoundError:
        raise NotFoundError("Group not found")
    return await _group_standings_out(group)
