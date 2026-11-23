"""Admin credential rotation — enforces exactly one admin account, per
reference/plan.txt §8. Used to set up the real (non-dev-placeholder)
admin login."""

import pytest

from app.core.security import hash_password
from app.models import Admin
from app.scripts.set_admin_password import (
    MIN_PASSWORD_LENGTH,
    _PASSWORD_ALPHABET,
    generate_password,
    set_admin_password,
)
from app.services.auth import authenticate_admin


async def test_updates_the_existing_admins_password(admin):
    old_hash = admin.password_hash

    await set_admin_password(None, "a-brand-new-strong-password")

    updated = await Admin.get(admin.id)
    assert updated.password_hash != old_hash
    assert await authenticate_admin("testadmin", "a-brand-new-strong-password") is not None
    assert await authenticate_admin("testadmin", "testpass123") is None  # old password now dead


async def test_can_also_rename_the_username_while_rotating(admin):
    await set_admin_password("newname", "a-brand-new-strong-password")

    assert await authenticate_admin("newname", "a-brand-new-strong-password") is not None
    assert await authenticate_admin("testadmin", "a-brand-new-strong-password") is None


async def test_creates_an_admin_if_none_exists(clean_db):
    assert await Admin.find_all().count() == 0

    username = await set_admin_password("admin", "a-brand-new-strong-password")

    assert username == "admin"
    assert await Admin.find_all().count() == 1
    assert await authenticate_admin("admin", "a-brand-new-strong-password") is not None


async def test_refuses_to_update_if_more_than_one_admin_exists(clean_db):
    await Admin(username="a", password_hash=hash_password("whatever-password-1")).insert()
    await Admin(username="b", password_hash=hash_password("whatever-password-2")).insert()

    with pytest.raises(RuntimeError):
        await set_admin_password(None, "a-brand-new-strong-password")


async def test_rejects_a_too_short_password(admin):
    with pytest.raises(ValueError):
        await set_admin_password(None, "short")


def test_generate_password_is_long_enough_and_from_the_safe_alphabet():
    password = generate_password()
    assert len(password) >= MIN_PASSWORD_LENGTH
    assert all(c in _PASSWORD_ALPHABET for c in password)
    # Ambiguous characters are deliberately excluded so a printed password
    # can be typed back correctly.
    assert not any(c in password for c in "0O1lI")


def test_generate_password_is_actually_random():
    assert generate_password() != generate_password()
