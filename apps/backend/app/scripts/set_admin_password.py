"""Sets (or rotates) a SUPER_ADMIN account's credentials.

Operates on the `users` collection (the legacy `admins` collection has been
retired). With exactly one SUPER_ADMIN it updates that account in place; with
several it refuses to guess unless --username names one of them; with none it
creates the account.

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
from app.models import User, UserRole

MIN_PASSWORD_LENGTH = 12
# Excludes visually-ambiguous characters (0/O, 1/l/I) so a printed password
# is easy to type back correctly.
_PASSWORD_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def generate_password(length: int = 20) -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(length))


async def set_admin_password(username: str | None, password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

    admins = await User.find(User.role == UserRole.SUPER_ADMIN).to_list()
    if len(admins) > 1:
        named = [a for a in admins if username and a.username == username]
        if len(named) != 1:
            raise RuntimeError(
                f"Found {len(admins)} super-admin accounts — pass --username naming the one to update."
            )
        admins = named

    if admins:
        admin = admins[0]
        if username:
            admin.username = username
        admin.password_hash = hash_password(password)
        await admin.save()
    else:
        admin = User(
            username=username or "admin",
            password_hash=hash_password(password),
            role=UserRole.SUPER_ADMIN,
            is_active=True,
        )
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
