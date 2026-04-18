"""Training portal users — list, detail, profile update, create-for-attendee."""

import logging
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import hash_email, read_pii
from app.models.portal_user import PortalUser
from app.models.training_attendee import TrainingAttendee

from ._helpers import get_portal_user, portal_user_to_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["training-users"])


class UpdatePortalUserProfile(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    pronouns: str | None = None
    title: str | None = None
    company: str | None = None
    bio: str | None = None
    social_links: dict | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None


@router.get("")
async def list_portal_users(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    search: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> dict:
    """List all portal users for this tenant with their linked training attendees."""
    tenant_id = current_user.tenant_id

    base = select(PortalUser).where(PortalUser.tenant_id == tenant_id)

    if search:
        q = f"%{search}%"
        base = base.where(PortalUser.first_name.ilike(q) | PortalUser.last_name.ilike(q) | PortalUser.email.ilike(q))

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.order_by(PortalUser.last_name, PortalUser.first_name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(items_q)
    users = result.scalars().all()

    user_ids = [u.id for u in users]
    att_map: dict[UUID, str] = {}
    if user_ids:
        att_result = await db.execute(
            select(TrainingAttendee.portal_user_id, TrainingAttendee.status).where(
                TrainingAttendee.portal_user_id.in_(user_ids)
            )
        )
        for pu_id, status in att_result.all():
            att_map[pu_id] = status

    items = [
        {
            "id": str(u.id),
            "email": read_pii(u, "email"),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": read_pii(u, "phone"),
            "is_active": u.is_active,
            "has_password": u.password_hash is not None,
            "email_verified": u.email_verified_at is not None,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "training_attendee_status": att_map.get(u.id),
        }
        for u in users
    ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{user_id}")
async def get_portal_user_detail(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get full portal user profile including picture/video URLs."""
    from app.models.attachment import Attachment

    user = await get_portal_user(db, user_id, current_user.tenant_id)
    result = portal_user_to_dict(user)

    att_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type.in_(["portal_user_picture", "portal_user_video"]),
            Attachment.entity_id == user.id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )
    for att in att_result.scalars().all():
        if att.entity_type == "portal_user_picture":
            result["picture_id"] = str(att.id)
            result["picture_filename"] = att.filename
        elif att.entity_type == "portal_user_video":
            result["video_id"] = str(att.id)
            result["video_filename"] = att.filename

    return result


@router.put("/{user_id}")
async def update_portal_user_profile(
    user_id: UUID,
    data: UpdatePortalUserProfile,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update a portal user's profile fields."""
    user = await get_portal_user(db, user_id, current_user.tenant_id)

    update_fields = data.model_dump(exclude_unset=True)

    if update_fields.get("bio"):
        from app.core.html_sanitize import sanitize_html

        update_fields["bio"] = sanitize_html(update_fields["bio"])

    for field, value in update_fields.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    logger.info("Updated portal user %s profile by admin %s", read_pii(user, "email"), current_user.user_id)
    return portal_user_to_dict(user)


@router.post("/create-for-attendee/{attendee_id}")
async def create_portal_user_for_attendee(
    attendee_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Create a portal_user for an attendee that doesn't have one yet."""
    tenant_id = current_user.tenant_id

    att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == tenant_id,
        )
    )
    att = att_result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")

    if att.portal_user_id:
        user = await db.get(PortalUser, att.portal_user_id)
        if user:
            return {"portal_user_id": str(user.id), "created": False}

    existing = await db.execute(
        select(PortalUser).where(
            PortalUser.tenant_id == tenant_id,
            PortalUser.email_hash == hash_email(att.email),
        )
    )
    portal_user = existing.scalar_one_or_none()

    if not portal_user:
        portal_user = PortalUser(
            tenant_id=tenant_id,
            email=att.email,
            first_name=att.first_name,
            last_name=att.last_name,
            is_active=True,
        )
        db.add(portal_user)
        await db.flush()

    att.portal_user_id = portal_user.id
    await db.commit()

    logger.info("Created/linked portal user for attendee %s by admin %s", att.email, current_user.user_id)
    return {"portal_user_id": str(portal_user.id), "created": True}
