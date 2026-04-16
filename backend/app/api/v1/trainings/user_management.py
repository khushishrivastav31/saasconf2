"""Training user management endpoints — enable/disable, resend invite, reset password."""

import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.portal_security import generate_password_reset_token
from app.core.utils import utcnow
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.training_attendee import TrainingAttendee

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["training-users"])


async def _get_portal_user(db: DbSessionDep, user_id: UUID, tenant_id: UUID) -> PortalUser:
    """Get portal user by ID, ensuring tenant isolation."""
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id, PortalUser.tenant_id == tenant_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Portal user not found")
    return user


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

    # Batch-load linked training attendees
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
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "phone": u.phone,
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


@router.put("/{user_id}/toggle-access")
async def toggle_portal_access(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Enable or disable a portal user's access."""
    user = await _get_portal_user(db, user_id, current_user.tenant_id)
    user.is_active = not user.is_active
    await db.commit()

    status = "enabled" if user.is_active else "disabled"
    logger.info("Portal user %s access %s by admin %s", user.email, status, current_user.user_id)
    return {"id": str(user.id), "is_active": user.is_active, "message": f"Portal access {status}"}


@router.post("/{user_id}/resend-invite")
async def resend_portal_invite(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Resend the password-set invite email to a portal user."""
    from app.config import get_settings
    from app.core.email import send_email
    from app.models.tenant import Tenant

    user = await _get_portal_user(db, user_id, current_user.tenant_id)
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    settings = get_settings()

    raw_token, token_hash = generate_password_reset_token()
    db.add(
        PortalRefreshToken(
            portal_user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(days=7),
        )
    )
    await db.commit()

    set_password_url = f"{settings.PORTAL_BASE_URL}/{tenant.slug}/trainings/portal/set-password?token={raw_token}"

    try:
        await send_email(
            to=user.email,
            subject=f"Set up your training portal account — {tenant.name}",
            html=f"""<p>Hi {user.first_name},</p>
<p>You've been invited to access the training portal. Click below to set your password:</p>
<p><a href="{set_password_url}" style="display: inline-block; padding: 12px 24px;
background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;
font-weight: bold;">Set Your Password</a></p>
<p>This link is valid for 7 days.</p>
<p>Best regards,<br/>{tenant.name}</p>""",
            tenant_from_name=tenant.name,
        )
    except Exception as exc:
        logger.warning("Failed to send portal invite to %s: %s", user.email, exc)
        raise HTTPException(status_code=502, detail="Failed to send invite email") from exc

    return {"message": "Invite email sent"}


@router.post("/{user_id}/reset-password")
async def admin_reset_portal_password(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Admin-initiated password reset — sends a reset link to the user."""
    from app.config import get_settings
    from app.core.email import send_email
    from app.models.tenant import Tenant

    user = await _get_portal_user(db, user_id, current_user.tenant_id)
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    settings = get_settings()

    raw_token, token_hash = generate_password_reset_token()
    db.add(
        PortalRefreshToken(
            portal_user_id=user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=1),
        )
    )
    await db.commit()

    reset_url = f"{settings.PORTAL_BASE_URL}/{tenant.slug}/trainings/portal/set-password?token={raw_token}"

    try:
        await send_email(
            to=user.email,
            subject=f"Password reset — {tenant.name}",
            html=f"""<p>Hi {user.first_name},</p>
<p>An administrator has requested a password reset for your account. Click below to set a new password:</p>
<p><a href="{reset_url}" style="display: inline-block; padding: 12px 24px;
background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;
font-weight: bold;">Reset Password</a></p>
<p>This link expires in 1 hour.</p>
<p>Best regards,<br/>{tenant.name}</p>""",
            tenant_from_name=tenant.name,
        )
    except Exception as exc:
        logger.warning("Failed to send password reset to %s: %s", user.email, exc)
        raise HTTPException(status_code=502, detail="Failed to send reset email") from exc

    logger.info("Admin password reset for %s by %s", user.email, current_user.user_id)
    return {"message": "Password reset email sent"}


# ── Merge Duplicate Users ────────────────────────────────────────────────────


class MergeUsersRequest(BaseModel):
    source_user_id: str


@router.post("/{target_user_id}/merge")
async def merge_portal_users(
    target_user_id: UUID,
    data: MergeUsersRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Merge source portal user into target. Moves all linked records, deletes source.

    - Training attendees from source → re-linked to target portal_user
    - Attendee history preserved
    - Registration attendee links preserved
    - Offer attendee links preserved
    - CFP applicant link moved if source has one
    - Source portal_user + source training_attendee deleted
    """
    from app.models.cfp_applicants import CFPApplicant
    from app.models.offer_attendee import OfferAttendee
    from app.models.training_attendee_history import TrainingAttendeeHistory
    from app.models.training_registration import TrainingRegistrationAttendee

    tenant_id = current_user.tenant_id
    source_user_id = UUID(data.source_user_id)

    if target_user_id == source_user_id:
        raise HTTPException(status_code=422, detail="Cannot merge a user with itself")

    target = await _get_portal_user(db, target_user_id, tenant_id)
    source = await _get_portal_user(db, source_user_id, tenant_id)

    # 1. Find training attendees linked to source
    source_att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.portal_user_id == source.id,
            TrainingAttendee.tenant_id == tenant_id,
        )
    )
    source_attendees = source_att_result.scalars().all()

    # Find target attendee (if any)
    target_att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.portal_user_id == target.id,
            TrainingAttendee.tenant_id == tenant_id,
        )
    )
    target_attendee = target_att_result.scalars().first()

    merged_records = 0

    for src_att in source_attendees:
        if target_attendee:
            # Move history events from source attendee → target attendee
            await db.execute(select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == src_att.id))
            history_result = await db.execute(
                select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == src_att.id)
            )
            for h in history_result.scalars().all():
                h.attendee_id = target_attendee.id
                merged_records += 1

            # Move registration attendee links
            ra_result = await db.execute(
                select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.attendee_id == src_att.id)
            )
            for ra in ra_result.scalars().all():
                ra.attendee_id = target_attendee.id
                merged_records += 1

            # Move offer attendee links
            oa_result = await db.execute(select(OfferAttendee).where(OfferAttendee.attendee_id == src_att.id))
            for oa in oa_result.scalars().all():
                oa.attendee_id = target_attendee.id
                merged_records += 1

            # Delete the source attendee (now empty)
            await db.delete(src_att)
        else:
            # No target attendee — just re-link source attendee to target portal_user
            src_att.portal_user_id = target.id
            target_attendee = src_att  # Use this as the target for subsequent iterations
            merged_records += 1

    # 2. Move CFP applicant link if source has one and target doesn't
    source_cfp = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == source.id))
    source_cfp_applicant = source_cfp.scalar_one_or_none()

    if source_cfp_applicant:
        target_cfp = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == target.id))
        if not target_cfp.scalar_one_or_none():
            source_cfp_applicant.portal_user_id = target.id
            merged_records += 1

    # 3. Copy password if target doesn't have one but source does
    if not target.password_hash and source.password_hash:
        target.password_hash = source.password_hash

    # 4. Update target last_login if source was more recent
    if source.last_login_at and (not target.last_login_at or source.last_login_at > target.last_login_at):
        target.last_login_at = source.last_login_at

    # 5. Delete source portal_user (cascade deletes refresh tokens)
    await db.delete(source)
    await db.commit()

    logger.info(
        "Merged portal user %s into %s (%d records moved) by admin %s",
        source.email,
        target.email,
        merged_records,
        current_user.user_id,
    )

    return {
        "message": f"Merged {source.email} into {target.email}",
        "merged_records": merged_records,
        "target_user_id": str(target.id),
    }


# ── Impersonate ──────────────────────────────────────────────────────────────


@router.post("/{user_id}/impersonate")
async def impersonate_portal_user(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Generate a portal access token for admin to view portal as this user.

    Returns a short-lived access token (no refresh token) for the portal user.
    Only tenant admins can impersonate.
    """
    from app.core.portal_security import create_portal_access_token

    user = await _get_portal_user(db, user_id, current_user.tenant_id)

    if not user.is_active:
        raise HTTPException(status_code=422, detail="Cannot impersonate a deactivated user")

    # Create short-lived access token (uses standard expiry)
    access_token = create_portal_access_token(user.id, user.tenant_id)

    logger.info("Admin %s impersonating portal user %s", current_user.user_id, user.email)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "portal_user_email": user.email,
        "portal_user_name": f"{user.first_name} {user.last_name}",
    }
