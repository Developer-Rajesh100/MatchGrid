"""Tournament-scoped media URL rules shared by every entity that stores an image URL
(team crest/logo, player photo, tournament logo/banner)."""

import re
from typing import Optional

from beanie import PydanticObjectId

from app.core.errors import UnprocessableEntityError
from app.models import Player, Team, Tournament
from app.services.storage import get_storage_service


def validate_media_url(value: Optional[str], tournament_id: PydanticObjectId | str | None) -> Optional[str]:
    """Accepts empty values, plain http(s) / site-relative URLs, and R2 keys or URLs that
    belong to `tournament_id`. Rejects another tournament's media, malformed
    `tournaments/...` keys, and unsafe schemes (e.g. javascript:).

    `tournament_id=None` (tournament not created yet) accepts no R2 media at all."""
    if value is None or value == "":
        return None
    cleaned = value.strip()
    storage = get_storage_service()

    key = storage.extract_key_from_url(cleaned)
    if key is not None:
        owner = storage.extract_tournament_id_from_key(key)
        if owner is None or tournament_id is None or owner != str(tournament_id).lower():
            raise UnprocessableEntityError("Image must be uploaded to this tournament's own media folder")
        return cleaned

    if cleaned.startswith(("https://", "http://", "/")) and not cleaned.startswith("//"):
        return cleaned
    raise UnprocessableEntityError("Image URL must be an http(s) URL or an uploaded tournament image")


async def release_media(url: Optional[str], tournament_id: PydanticObjectId) -> bool:
    """Deletes a replaced/removed R2 object, but only if it lives in this tournament's
    folder and no team, player or tournament still references it."""
    storage = get_storage_service()
    key = storage.extract_key_from_url(url)
    if not key or storage.extract_tournament_id_from_key(key) != str(tournament_id).lower():
        return False

    pattern = {"$regex": re.escape(key)}
    still_used = (
        await Team.find({"$or": [{"crest_url": pattern}, {"logo_url": pattern}]}).count()
        or await Player.find({"photo_url": pattern}).count()
        or await Tournament.find({"$or": [{"logo_url": pattern}, {"banner_url": pattern}]}).count()
    )
    if still_used:
        return False
    return await storage.delete_image(key)
