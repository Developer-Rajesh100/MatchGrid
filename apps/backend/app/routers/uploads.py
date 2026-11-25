from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.deps import check_tournament_ownership, get_current_admin
from app.core.errors import NotFoundError, PayloadTooLargeError, UnprocessableEntityError
from app.models import User
from app.schemas.uploads import DeleteImageOut, DeleteImageRequest, UploadCategory, UploadImageOut
from app.services.storage import MAX_FILE_SIZE, get_storage_service

router = APIRouter(prefix="/uploads", tags=["uploads"])


_CHUNK_SIZE = 64 * 1024


async def _read_capped(file: UploadFile) -> bytes:
    """Reads the upload in chunks and stops as soon as it exceeds the size cap, so an oversized
    (or endless) body is rejected without ever being held in memory."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_CHUNK_SIZE):
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            raise PayloadTooLargeError(
                f"Image file exceeds maximum permitted size of {MAX_FILE_SIZE // (1024 * 1024)} MB"
            )
        chunks.append(chunk)
    return b"".join(chunks)


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

    file_bytes = await _read_capped(file)
    if not file_bytes:
        raise UnprocessableEntityError("Uploaded file cannot be empty")

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

    # Only keys of the exact shape this service writes are deletable, and the caller
    # must own the tournament named in the key (no key shape skips the check).
    tournament_id = storage.extract_tournament_id_from_key(key)
    if not tournament_id:
        raise NotFoundError("Asset not found or not a valid R2 storage URL/key")
    await check_tournament_ownership(admin, tournament_id)

    deleted = await storage.delete_image(key)
    return DeleteImageOut(deleted=deleted, key=key)
