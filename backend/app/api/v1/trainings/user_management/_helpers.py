"""Shared helpers for the user_management sub-routers."""

from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.portal_user import PortalUser


async def get_portal_user(db: DbSessionDep, user_id: UUID, tenant_id: UUID) -> PortalUser:
    """Get portal user by ID, ensuring tenant isolation."""
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id, PortalUser.tenant_id == tenant_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Portal user not found")
    return user


def portal_user_to_dict(user: PortalUser) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "pronouns": user.pronouns,
        "title": user.title,
        "company": user.company,
        "bio": user.bio,
        "social_links": user.social_links or {},
        "address_line_1": user.address_line_1,
        "address_line_2": user.address_line_2,
        "city": user.city,
        "postal_code": user.postal_code,
        "country": user.country,
        "is_active": user.is_active,
        "has_password": user.password_hash is not None,
        "email_verified": user.email_verified_at is not None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
