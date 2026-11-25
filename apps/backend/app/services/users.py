from beanie import PydanticObjectId

from app.models import Match


async def unassign_scorer_everywhere(scorer_id: PydanticObjectId) -> None:
    """Removes a scorer from every match's assigned_scorer_ids (used when the scorer is deleted)."""
    await Match.find({"assigned_scorer_ids": scorer_id}).update({"$pull": {"assigned_scorer_ids": scorer_id}})
