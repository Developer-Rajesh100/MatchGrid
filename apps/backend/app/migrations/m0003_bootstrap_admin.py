"""Historical migration: used to create the legacy `admins` bootstrap account.

The legacy Admin collection has been retired (see m0007_migrate_legacy_admins);
the bootstrap SUPER_ADMIN is now created directly in `users` by m0005 and by
the startup bootstrap. This migration only keeps the production-safety check so
that a production deploy still refuses to run with a placeholder password.
"""

from app.core.config import get_settings
from app.core.production_safety import check_bootstrap_password

NAME = "0003_bootstrap_admin"


async def up() -> None:
    settings = get_settings()

    problems = check_bootstrap_password(settings)
    if problems:
        raise RuntimeError(
            "Refusing to bootstrap the production admin account with an insecure password:\n"
            + "\n".join(f"  - {p}" for p in problems)
        )
