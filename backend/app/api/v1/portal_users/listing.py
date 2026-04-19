"""Tenant-level portal users — list, detail, profile update."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.security.pii_crypto import hash_email, read_pii
from app.models.cfp_applicants import CFPApplicant
from app.models.portal_user import PortalUser
from app.models.registration import Registration
from app.models.training_attendee import TrainingAttendee

from ._helpers import get_portal_user, portal_user_to_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal-users", tags=["Portal Users"])


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
) -> dict[str, Any]:
    """List all portal users for the current tenant with linkage hints."""
    tenant_id = current_user.tenant_id

    base = select(PortalUser).where(PortalUser.tenant_id == tenant_id)

    if search:
        q = f"%{search}%"
        name_clause = PortalUser.first_name.ilike(q) | PortalUser.last_name.ilike(q)
        if "@" in search:
            base = base.where(name_clause | (PortalUser.email_hash == hash_email(search)))
        else:
            base = base.where(name_clause)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.order_by(PortalUser.last_name, PortalUser.first_name).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(items_q)
    users = result.scalars().all()

    user_ids = [u.id for u in users]
    user_hashes = [u.email_hash for u in users if u.email_hash]

    att_map: dict[UUID, str] = {}
    cfp_link_ids: set[UUID] = set()
    if user_ids:
        att_result = await db.execute(
            select(TrainingAttendee.portal_user_id, TrainingAttendee.status).where(
                TrainingAttendee.portal_user_id.in_(user_ids)
            )
        )
        for pu_id, status in att_result.all():
            att_map[pu_id] = status

        cfp_result = await db.execute(
            select(CFPApplicant.portal_user_id).where(
                CFPApplicant.portal_user_id.in_(user_ids),
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        cfp_link_ids = {row[0] for row in cfp_result.all() if row[0] is not None}

    reg_hashes: set[str] = set()
    if user_hashes:
        reg_result = await db.execute(
            select(Registration.email_hash).where(
                Registration.tenant_id == tenant_id,
                Registration.email_hash.in_(user_hashes),
            )
        )
        reg_hashes = {row[0] for row in reg_result.all() if row[0]}

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
            "has_cfp_link": u.id in cfp_link_ids,
            "has_registration_link": bool(u.email_hash and u.email_hash in reg_hashes),
        }
        for u in users
    ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{user_id}")
async def get_portal_user_detail(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict[str, Any]:
    """Get full portal user profile plus linkage + media hints."""
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

    # Linkage summary.
    training_att = await db.execute(
        select(TrainingAttendee.id, TrainingAttendee.status).where(
            TrainingAttendee.portal_user_id == user.id,
            TrainingAttendee.tenant_id == current_user.tenant_id,
        )
    )
    attendee_rows = training_att.all()

    cfp_link = await db.execute(
        select(func.count(CFPApplicant.id)).where(
            CFPApplicant.portal_user_id == user.id,
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )

    reg_count = 0
    if user.email_hash:
        reg_result = await db.execute(
            select(func.count(Registration.id)).where(
                Registration.tenant_id == current_user.tenant_id,
                Registration.email_hash == user.email_hash,
            )
        )
        reg_count = int(reg_result.scalar() or 0)

    result["linkages"] = {
        "training_attendee_count": len(attendee_rows),
        "training_attendee_status": attendee_rows[0][1] if attendee_rows else None,
        "cfp_applicant_count": int(cfp_link.scalar() or 0),
        "registration_count": reg_count,
    }

    return result


@router.put("/{user_id}")
async def update_portal_user_profile(
    user_id: UUID,
    data: UpdatePortalUserProfile,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict[str, Any]:
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
