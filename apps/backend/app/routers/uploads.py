from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.deps import check_tournament_ownership, get_current_admin
from app.core.errors import NotFoundError, ValidationAppError
from app.models import User
from app.schemas.uploads import DeleteImageOut, DeleteImageRequest, UploadCategory, UploadImageOut
from app.services.storage import get_storage_service

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/image", response_model=UploadImageOut, status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    tournament_id: str = Form(...),
    category: UploadCategory = Form(...),
    admin: User = Depends(get_current_admin),
) -> UploadImageOut:
    """Uploads an image to Cloudflare R2 under tournaments/{tournament_id}/{category}/.
    Restricted to Superadmin or the owning Tournament Organizer.
    """
    await check_tournament_ownership(admin, tournament_id)

    file_bytes = await file.read()
    if not file_bytes:
        raise ValidationAppError("Uploaded file cannot be empty")

    storage = get_storage_service()
    return await storage.upload_image(file_bytes, tournament_id, category)


@router.delete("/image", response_model=DeleteImageOut)
async def delete_image(
    payload: DeleteImageRequest,
    admin: User = Depends(get_current_admin),
) -> DeleteImageOut:
    """Deletes an image from Cloudflare R2.
    Asserts that the caller owns the tournament specified in the asset key.
    """
    storage = get_storage_service()
    key = storage.extract_key_from_url(payload.url_or_key)

    if not key:
        raise NotFoundError("Asset not found or not a valid R2 storage URL/key")

    tournament_id = storage.extract_tournament_id_from_key(key)
    if tournament_id:
        await check_tournament_ownership(admin, tournament_id)

    deleted = await storage.delete_image(key)
    return DeleteImageOut(deleted=deleted, key=key)
