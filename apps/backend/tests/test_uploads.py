import io
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.security import create_access_token
from app.models import Tournament, User, UserRole
from app.services.storage import get_storage_service


def _test_png() -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (64, 64), color=(37, 99, 235))
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
async def organizer_and_tournament():
    org = User(
        username="org_upload_test",
        password_hash="hash",
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await org.insert()

    tourn = Tournament(
        name="Upload Cup",
        season="2026",
        organizer_id=org.id,
        slug="upload-cup",
    )
    await tourn.insert()
    return org, tourn


@pytest.fixture
async def other_organizer():
    other = User(
        username="other_org_upload",
        password_hash="hash",
        role=UserRole.ORGANIZER,
        is_active=True,
    )
    await other.insert()
    return other


@pytest.fixture
async def scorer_user():
    scorer = User(
        username="scorer_upload_test",
        password_hash="hash",
        role=UserRole.SCORER,
        is_active=True,
    )
    await scorer.insert()
    return scorer


@pytest.mark.asyncio
async def test_upload_unauthenticated(async_client: AsyncClient):
    response = await async_client.post("/api/uploads/image", data={"tournament_id": "123", "category": "crests"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_upload_scorer_forbidden(async_client: AsyncClient, organizer_and_tournament, scorer_user):
    _, tourn = organizer_and_tournament
    scorer_token, _ = create_access_token(str(scorer_user.id))

    png_data = _test_png()
    response = await async_client.post(
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {scorer_token}"},
        data={"tournament_id": str(tourn.id), "category": "crests"},
        files={"file": ("crest.png", png_data, "image/png")},
    )
    assert response.status_code == 403
    assert "Admin access required" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_cross_tenant_forbidden(async_client: AsyncClient, organizer_and_tournament, other_organizer):
    _, tourn = organizer_and_tournament
    other_token, _ = create_access_token(str(other_organizer.id))

    png_data = _test_png()
    response = await async_client.post(
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {other_token}"},
        data={"tournament_id": str(tourn.id), "category": "crests"},
        files={"file": ("crest.png", png_data, "image/png")},
    )
    assert response.status_code == 403
    assert "You do not own this tournament" in response.json()["detail"]


@pytest.mark.asyncio
async def test_upload_success_mocked(async_client: AsyncClient, organizer_and_tournament):
    org, tourn = organizer_and_tournament
    org_token, _ = create_access_token(str(org.id))

    storage = get_storage_service()
    mock_s3 = MagicMock()
    storage._s3_client = mock_s3

    # Configure R2 settings on storage instance
    storage.settings.r2_account_id = "acc_test"
    storage.settings.r2_access_key_id = "key_test"
    storage.settings.r2_secret_access_key = "secret_test"
    storage.settings.r2_bucket_name = "test-bucket"
    storage.settings.r2_public_base_url = "https://cdn.matchgrid.app"

    png_data = _test_png()
    response = await async_client.post(
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {org_token}"},
        data={"tournament_id": str(tourn.id), "category": "crests"},
        files={"file": ("crest.png", png_data, "image/png")},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["tournament_id"] == str(tourn.id)
    assert data["category"] == "crests"
    assert data["content_type"] == "image/png"
    assert data["url"].startswith("https://cdn.matchgrid.app/tournaments/")
    assert data["key"].startswith(f"tournaments/{tourn.id}/crests/")
    mock_s3.put_object.assert_called_once()


@pytest.mark.asyncio
async def test_delete_image_endpoints(async_client: AsyncClient, admin_token: str, organizer_and_tournament, other_organizer):
    org, tourn = organizer_and_tournament
    org_token, _ = create_access_token(str(org.id))
    other_token, _ = create_access_token(str(other_organizer.id))

    storage = get_storage_service()
    mock_s3 = MagicMock()
    storage._s3_client = mock_s3

    storage.settings.r2_account_id = "acc_test"
    storage.settings.r2_access_key_id = "key_test"
    storage.settings.r2_secret_access_key = "secret_test"
    storage.settings.r2_bucket_name = "test-bucket"
    storage.settings.r2_public_base_url = "https://cdn.matchgrid.app"

    key = f"tournaments/{tourn.id}/crests/{'a' * 32}.png"

    # 1. Other organizer blocked (403)
    res_other = await async_client.request(
        "DELETE",
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"url_or_key": key},
    )
    assert res_other.status_code == 403
    assert "You do not own this tournament" in res_other.json()["detail"]

    # 2. Owning organizer allowed (200)
    res_owner = await async_client.request(
        "DELETE",
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {org_token}"},
        json={"url_or_key": key},
    )
    assert res_owner.status_code == 200
    assert res_owner.json() == {"deleted": True, "key": key}

    # 3. Superadmin allowed (200)
    res_admin = await async_client.request(
        "DELETE",
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"url_or_key": key},
    )
    assert res_admin.status_code == 200
    assert res_admin.json() == {"deleted": True, "key": key}

    # 4. Invalid / non-R2 key returns 404
    res_invalid = await async_client.request(
        "DELETE",
        "/api/uploads/image",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"url_or_key": "/assets/teams/default.png"},
    )
    assert res_invalid.status_code == 404
