"""Creates the bootstrap admin account (from env-configured credentials) if
no admin account exists yet. Idempotent."""

from app.core.config import get_settings
from app.core.production_safety import check_bootstrap_password
from app.core.security import hash_password
from app.models import Admin

NAME = "0003_bootstrap_admin"


async def up() -> None:
    settings = get_settings()

    problems = check_bootstrap_password(settings)
    if problems:
        raise RuntimeError(
            "Refusing to bootstrap the production admin account with an insecure password:\n"
            + "\n".join(f"  - {p}" for p in problems)
        )

    existing = await Admin.find_one(Admin.username == settings.admin_bootstrap_username)
    if existing is not None:
        return

    await Admin(
        username=settings.admin_bootstrap_username,
        password_hash=hash_password(settings.admin_bootstrap_password),
    ).insert()
