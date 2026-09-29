from app.core.security import verify_password
from app.models import Admin


async def authenticate_admin(username: str, password: str) -> Admin | None:
    admin = await Admin.find_one(Admin.username == username)
    if admin is None:
        return None
    if not verify_password(password, admin.password_hash):
        return None
    return admin
