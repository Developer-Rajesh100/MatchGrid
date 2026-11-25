import io
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.core.config import Settings
from app.core.errors import PayloadTooLargeError, ServiceUnavailableError, ValidationAppError
from app.services.storage import StorageService


def _create_test_image(format: str = "PNG", size: tuple[int, int] = (64, 64)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=(16, 185, 129))
    img.save(buf, format=format)
    return buf.getvalue()


def test_storage_validation_valid_formats():
    storage = StorageService(Settings())

    # PNG
    png_bytes = _create_test_image("PNG", (100, 100))
    ctype, ext, w, h = storage.validate_image_bytes(png_bytes)
    assert ctype == "image/png"
    assert ext == ".png"
    assert w == 100 and h == 100

    # JPEG
    jpeg_bytes = _create_test_image("JPEG", (80, 80))
    ctype, ext, w, h = storage.validate_image_bytes(jpeg_bytes)
    assert ctype == "image/jpeg"
    assert ext == ".jpg"
    assert w == 80 and h == 80

    # WEBP
    webp_bytes = _create_test_image("WEBP", (120, 120))
    ctype, ext, w, h = storage.validate_image_bytes(webp_bytes)
    assert ctype == "image/webp"
    assert ext == ".webp"
    assert w == 120 and h == 120


def test_storage_validation_rejects_non_image():
    storage = StorageService(Settings())

    with pytest.raises(ValidationAppError, match="Uploaded file is not a valid image"):
        storage.validate_image_bytes(b"<html><script>alert(1)</script></html>")

    with pytest.raises(ValidationAppError, match="Image file cannot be empty"):
        storage.validate_image_bytes(b"")


def test_storage_validation_rejects_oversized_payload():
    storage = StorageService(Settings())
    fake_oversized = b"0" * (5 * 1024 * 1024 + 10)

    with pytest.raises(PayloadTooLargeError, match="exceeds maximum permitted size"):
        storage.validate_image_bytes(fake_oversized)


def test_storage_validation_rejects_invalid_dimensions():
    storage = StorageService(Settings())

    # Too small (<16px)
    tiny_bytes = _create_test_image("PNG", (8, 8))
    with pytest.raises(ValidationAppError, match="too small"):
        storage.validate_image_bytes(tiny_bytes)

    # Too large (>4096px)
    huge_bytes = _create_test_image("PNG", (4097, 100))
    with pytest.raises(ValidationAppError, match="exceed maximum allowed limit"):
        storage.validate_image_bytes(huge_bytes)


def test_extract_key_from_url_safe_prefix_guard():
    settings = Settings(
        r2_account_id="acc123",
        r2_access_key_id="key123",
        r2_secret_access_key="secret123",
        r2_bucket_name="matchgrid-media",
        r2_public_base_url="https://cdn.matchgrid.app",
    )
    storage = StorageService(settings)

    # Raw key
    raw_key = "tournaments/67448a1234567890abcdef12/crests/abc12345.png"
    assert storage.extract_key_from_url(raw_key) == raw_key

    # Full CDN URL
    cdn_url = f"https://cdn.matchgrid.app/{raw_key}"
    assert storage.extract_key_from_url(cdn_url) == raw_key

    # Safely ignores local static asset paths
    assert storage.extract_key_from_url("/assets/teams/default.png") is None
    assert storage.extract_key_from_url("http://localhost:5173/assets/players/DCL-001.jpg") is None
    assert storage.extract_key_from_url("https://external-site.com/image.jpg") is None
    assert storage.extract_key_from_url(None) is None


def test_extract_tournament_id_from_key():
    storage = StorageService(Settings())
    key = "tournaments/67448a1234567890abcdef12/crests/" + "a" * 32 + ".png"
    assert storage.extract_tournament_id_from_key(key) == "67448a1234567890abcdef12"
    assert storage.extract_tournament_id_from_key("invalid/key/path.png") is None
    # strict shape only: wrong category / short name / traversal are not media keys
    for bad in (
        "tournaments/67448a1234567890abcdef12/crests/abc.png",
        "tournaments/67448a1234567890abcdef12/other/" + "a" * 32 + ".png",
        "tournaments/not-an-id/crests/" + "a" * 32 + ".png",
        "tournaments/67448a1234567890abcdef12/crests/../" + "a" * 32 + ".png",
    ):
        assert storage.extract_tournament_id_from_key(bad) is None


@pytest.mark.asyncio
async def test_unconfigured_r2_handling():
    unconfigured_settings = Settings(
        r2_account_id="",
        r2_access_key_id="",
        r2_secret_access_key="",
        r2_bucket_name="",
    )
    storage = StorageService(unconfigured_settings)
    img_bytes = _create_test_image()

    # Upload raises 503
    with pytest.raises(ServiceUnavailableError, match="not configured"):
        await storage.upload_image(img_bytes, "67448a1234567890abcdef12", "crests")

    # Delete is a safe no-op returning False
    res = await storage.delete_image("tournaments/67448a1234567890abcdef12/crests/abc.png")
    assert res is False


@pytest.mark.asyncio
async def test_upload_and_delete_with_mocked_s3():
    configured_settings = Settings(
        r2_account_id="test_acc",
        r2_access_key_id="test_key",
        r2_secret_access_key="test_secret",
        r2_bucket_name="test_bucket",
        r2_public_base_url="https://pub-test.r2.dev",
    )
    storage = StorageService(configured_settings)
    mock_s3 = MagicMock()
    storage._s3_client = mock_s3

    img_bytes = _create_test_image("PNG", (128, 128))
    t_id = "67448a1234567890abcdef12"

    # Upload
    out = await storage.upload_image(img_bytes, t_id, "crests")
    assert out.tournament_id == t_id
    assert out.category == "crests"
    assert out.content_type == "image/png"
    assert out.width == 128 and out.height == 128
    assert out.url.startswith("https://pub-test.r2.dev/tournaments/")
    assert out.key.startswith(f"tournaments/{t_id}/crests/")

    # Verify mock_s3.put_object call
    mock_s3.put_object.assert_called_once()
    kwargs = mock_s3.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "test_bucket"
    assert kwargs["Key"] == out.key
    assert kwargs["ContentType"] == "image/png"
    assert kwargs["CacheControl"] == "public, max-age=31536000, immutable"

    # Delete
    deleted = await storage.delete_image(out.url)
    assert deleted is True
    mock_s3.delete_object.assert_called_once_with(Bucket="test_bucket", Key=out.key)
