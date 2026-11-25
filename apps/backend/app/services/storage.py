import asyncio
import io
import logging
import re
import uuid
from typing import Any, Tuple

import boto3
from botocore.config import Config
from PIL import Image, UnidentifiedImageError

from app.core.config import Settings, get_settings
from app.core.errors import (
    PayloadTooLargeError,
    ServiceUnavailableError,
    UnprocessableEntityError,
    ValidationAppError,
)
from app.schemas.uploads import UploadCategory, UploadImageOut

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MIN_DIMENSION = 16
MAX_DIMENSION = 4096

ALLOWED_FORMATS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}

VALID_CATEGORIES = {"crests", "photos", "logos", "banners"}

# The only key shape this service ever writes (see generate_key). Anything else
# under "tournaments/" is not ours to delete or reference.
MEDIA_KEY_RE = re.compile(
    r"^tournaments/(?P<tournament_id>[0-9a-fA-F]{24})/(?:crests|photos|logos|banners)/"
    r"[0-9a-fA-F]{32}\.(?:jpg|png|webp)$"
)


class StorageService:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._s3_client: Any = None

    @property
    def s3_client(self) -> Any:
        if self._s3_client is None:
            if not self.settings.is_r2_configured:
                raise ServiceUnavailableError("Cloudflare R2 media storage is not configured")
            self._s3_client = boto3.client(
                "s3",
                endpoint_url=self.settings.r2_endpoint_url,
                aws_access_key_id=self.settings.r2_access_key_id,
                aws_secret_access_key=self.settings.r2_secret_access_key,
                region_name="auto",
                config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
            )
        return self._s3_client

    def validate_image_bytes(self, file_bytes: bytes) -> Tuple[str, str, int, int]:
        """Validates payload size, magic bytes via Pillow, dimension bounds, and returns:
        (content_type, extension, width, height)
        """
        if len(file_bytes) > MAX_FILE_SIZE:
            raise PayloadTooLargeError(
                f"Image file exceeds maximum permitted size of 5 MB ({len(file_bytes)} bytes)"
            )

        if not file_bytes:
            raise UnprocessableEntityError("Image file cannot be empty")

        try:
            with Image.open(io.BytesIO(file_bytes)) as probe:
                probe.verify()  # structural integrity check (truncated / tampered files fail here)
            with Image.open(io.BytesIO(file_bytes)) as img:
                img_format = (img.format or "").upper()
                if img_format not in ALLOWED_FORMATS:
                    raise UnprocessableEntityError(
                        f"Unsupported image format '{img_format}'. Allowed formats: JPEG, PNG, WebP"
                    )

                width, height = img.size
                if width < MIN_DIMENSION or height < MIN_DIMENSION:
                    raise UnprocessableEntityError(
                        f"Image dimensions ({width}x{height}) are too small (minimum {MIN_DIMENSION}x{MIN_DIMENSION}px)"
                    )
                if width > MAX_DIMENSION or height > MAX_DIMENSION:
                    raise UnprocessableEntityError(
                        f"Image dimensions ({width}x{height}) exceed maximum allowed limit of {MAX_DIMENSION}x{MAX_DIMENSION}px"
                    )

                content_type, extension = ALLOWED_FORMATS[img_format]
                return content_type, extension, width, height
        except (UnidentifiedImageError, OSError) as exc:
            raise UnprocessableEntityError("Uploaded file is not a valid image or is corrupted") from exc

    def generate_key(self, tournament_id: str, category: str, extension: str) -> str:
        unique_id = uuid.uuid4().hex
        return f"tournaments/{tournament_id}/{category}/{unique_id}{extension}"

    def extract_key_from_url(self, url_or_key: str | None) -> str | None:
        """Extracts the R2 storage key ('tournaments/<t_id>/<category>/<file>').
        Only matches URLs matching R2_PUBLIC_BASE_URL or already starting with 'tournaments/'.
        Safely ignores local paths (e.g. '/assets/...') and external third-party URLs.
        """
        if not url_or_key or not isinstance(url_or_key, str):
            return None

        cleaned = url_or_key.strip()

        # If it's already an R2 key
        if cleaned.startswith("tournaments/"):
            return cleaned

        # If it's a full public CDN URL
        public_base = (self.settings.r2_public_base_url or "").rstrip("/")
        if public_base and cleaned.startswith(public_base):
            key = cleaned[len(public_base) :].lstrip("/")
            if key.startswith("tournaments/"):
                return key

        # If it contains tournaments/<id>/...
        match = re.search(
            r"(tournaments/[0-9a-fA-F]{24}/(?:crests|photos|logos|banners)/[^?#]+)", cleaned
        )
        if match:
            return match.group(1)

        return None

    def extract_tournament_id_from_key(self, key: str | None) -> str | None:
        """Tournament id of a strictly well-formed media key, else None."""
        if not key:
            return None
        match = MEDIA_KEY_RE.match(key)
        return match.group("tournament_id").lower() if match else None

    async def upload_image(
        self,
        file_bytes: bytes,
        tournament_id: str,
        category: UploadCategory,
    ) -> UploadImageOut:
        if not self.settings.is_r2_configured:
            raise ServiceUnavailableError("Cloudflare R2 media storage is not configured")

        if category not in VALID_CATEGORIES:
            raise UnprocessableEntityError(
                f"Invalid category '{category}'. Allowed: {', '.join(sorted(VALID_CATEGORIES))}"
            )

        content_type, ext, width, height = self.validate_image_bytes(file_bytes)
        key = self.generate_key(tournament_id, category, ext)

        def _sync_put() -> None:
            self.s3_client.put_object(
                Bucket=self.settings.r2_bucket_name,
                Key=key,
                Body=file_bytes,
                ContentType=content_type,
                CacheControl="public, max-age=31536000, immutable",
            )

        await asyncio.to_thread(_sync_put)

        public_base = (self.settings.r2_public_base_url or "").rstrip("/")
        url = f"{public_base}/{key}" if public_base else f"/{key}"

        return UploadImageOut(
            url=url,
            key=key,
            category=category,
            tournament_id=tournament_id,
            content_type=content_type,
            size_bytes=len(file_bytes),
            width=width,
            height=height,
        )

    async def delete_image(self, url_or_key: str | None) -> bool:
        """Safely removes an image from R2.
        If R2 is unconfigured or the key is not an R2 key (e.g. local /assets/...),
        returns False safely as a no-op without raising an error.
        """
        if not self.settings.is_r2_configured:
            logger.debug("R2 not configured; skipping deletion of %s", url_or_key)
            return False

        key = self.extract_key_from_url(url_or_key)
        if not key or not MEDIA_KEY_RE.match(key):
            return False

        def _sync_delete() -> None:
            self.s3_client.delete_object(
                Bucket=self.settings.r2_bucket_name,
                Key=key,
            )

        try:
            await asyncio.to_thread(_sync_delete)
            return True
        except Exception as exc:
            logger.warning("Failed to delete R2 object key %s: %s", key, exc)
            return False


    async def delete_prefix(self, prefix: str) -> int:
        """Deletes every object under `prefix` (paginated). Returns the number deleted.
        Only ever called with a tournament prefix; failures are logged, never raised,
        so a storage hiccup cannot undo an already-committed database delete."""
        if not self.settings.is_r2_configured or not re.match(r"^tournaments/[0-9a-fA-F]{24}/$", prefix):
            return 0

        def _sync_purge() -> int:
            deleted = 0
            token = None
            while True:
                kwargs = {"Bucket": self.settings.r2_bucket_name, "Prefix": prefix}
                if token:
                    kwargs["ContinuationToken"] = token
                page = self.s3_client.list_objects_v2(**kwargs)
                objects = [{"Key": o["Key"]} for o in page.get("Contents", [])]
                if objects:
                    self.s3_client.delete_objects(
                        Bucket=self.settings.r2_bucket_name, Delete={"Objects": objects, "Quiet": True}
                    )
                    deleted += len(objects)
                if not page.get("IsTruncated"):
                    return deleted
                token = page.get("NextContinuationToken")

        try:
            return await asyncio.to_thread(_sync_purge)
        except Exception as exc:
            logger.warning("Failed to purge R2 prefix %s: %s", prefix, exc)
            return 0


_storage_service: StorageService | None = None


def get_storage_service() -> StorageService:
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService(get_settings())
    return _storage_service
