from functools import lru_cache

from app.core.security import hash_password, verify_password
from app.models import User


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """A real hash of a throwaway value, used so unknown usernames cost the same as known ones."""
    return hash_password("timing-parity-placeholder")


async def authenticate_admin(username: str, password: str) -> User | None:
    """Authenticates an active user (SUPER_ADMIN, ORGANIZER or SCORER) by username/password.

    A password hash is verified on every path (including unknown or inactive accounts) so response
    time does not reveal which usernames exist."""
    user = await User.find_one(User.username == username)
    password_ok = verify_password(password, user.password_hash if user else _dummy_hash())
    if user is None or not user.is_active or not password_ok:
        return None
    return user
