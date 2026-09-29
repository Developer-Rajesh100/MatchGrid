from beanie import PydanticObjectId
from bson.errors import InvalidId
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.models import Admin

_security = HTTPBearer(auto_error=False)


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security),
) -> Admin:
    """Protects admin/control endpoints. Public read endpoints never depend on this."""
    if credentials is None:
        raise UnauthorizedError("Not authenticated")

    admin_id = decode_access_token(credentials.credentials)
    if admin_id is None:
        raise UnauthorizedError("Invalid or expired token")

    try:
        admin = await Admin.get(PydanticObjectId(admin_id))
    except InvalidId:
        admin = None
    if admin is None:
        raise UnauthorizedError("Admin account no longer exists")

    return admin
