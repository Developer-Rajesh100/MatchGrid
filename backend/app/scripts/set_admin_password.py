"""Sets (or rotates) the single admin account's credentials.

This system has exactly one admin account by design (see
reference/plan.txt §8, docs/DATABASE_DESIGN.md §2 — the Admin schema has no
role/permissions field at all). This script enforces that: it refuses to
run if more than one admin document somehow exists, and it updates the one
account in place rather than ever creating a second one.

Usage:
    python -m app.scripts.set_admin_password --password 'a-strong-password'
    python -m app.scripts.set_admin_password                       # prompts securely (not echoed)
    python -m app.scripts.set_admin_password --username newname --password '...'
    python -m app.scripts.set_admin_password --generate             # generates and prints a strong password
"""

import argparse
import asyncio
import getpass
import secrets
import string

from app.core.database import close_db, init_db
from app.core.security import hash_password
from app.models import Admin

MIN_PASSWORD_LENGTH = 12
# Excludes visually-ambiguous characters (0/O, 1/l/I) so a printed password
# is easy to type back correctly.
_PASSWORD_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def generate_password(length: int = 20) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


async def set_admin_password(username: str | None, password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

    admins = await Admin.find_all().to_list()
    if len(admins) > 1:
        raise RuntimeError(
            f"Expected at most one admin account, found {len(admins)} — refusing to guess which "
            "one to update. This system is designed for exactly one admin; resolve this manually."
        )

    if admins:
        admin = admins[0]
        if username:
            admin.username = username
        admin.password_hash = hash_password(password)
        await admin.save()
    else:
        admin = Admin(username=username or "admin", password_hash=hash_password(password))
        await admin.insert()

    return admin.username


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default=None, help="Leave unset to keep the current username")
    parser.add_argument("--password", default=None, help="Omit to be prompted securely, or use --generate")
    parser.add_argument(
        "--generate", action="store_true", help="Generate a strong random password instead of prompting"
    )
    args = parser.parse_args()

    if args.generate:
        password = generate_password()
    elif args.password:
        password = args.password
    else:
        password = getpass.getpass("New admin password: ")
        confirm = getpass.getpass("Confirm: ")
        if password != confirm:
            print("Passwords did not match.")
            return

    await init_db()
    try:
        username = await set_admin_password(args.username, password)
    finally:
        await close_db()

    print(f"Admin credentials set. Username: {username}")
    if args.generate:
        print(f"Generated password: {password}")
        print("Store this securely now — it is not saved anywhere else.")


if __name__ == "__main__":
    asyncio.run(main())
