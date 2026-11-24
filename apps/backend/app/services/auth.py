from app.core.security import verify_password
from app.models import Admin, User, UserRole


async def authenticate_admin(username: str, password: str) -> User | Admin | None:
    """Authenticates by username/password across users and legacy admins."""
    # Check Admin first so legacy admin credential changes are immediately reflected
    admin = await Admin.find_one(Admin.username == username)
    if admin is not None:
        if not verify_password(password, admin.password_hash):
            return None
        # Keep User document in sync if present
        user = await User.find_one(User.username == username)
        if user is not None and user.password_hash != admin.password_hash:
            user.password_hash = admin.password_hash
            await user.save()
        return admin

    user = await User.find_one(User.username == username)
    if user is not None:
        if not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    return None
