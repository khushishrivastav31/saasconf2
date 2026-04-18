"""Training portal users — access control, invite/reset, impersonation, merge."""

import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import ConflictError, NotFoundError
from app.core.portal_security import generate_password_reset_token
from app.core.utils import utcnow
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalRefreshToken
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

from ._helpers import get_portal_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["training-users"])


class MergeUsersRequest(BaseModel):
    source_user_id: str


async def _has_active_training_assignment(db: DbSessionDep, user_id: UUID, tenant_id: UUID) -> bool:
    """Return True if the portal user is still attached to any active training.

    "Active training" = non-parked attendee, on an active placement, via either a
    non-cancelled registration or an accepted offer. Parked attendees never count.
    """
    reg_q = (
        select(func.count(TrainingRegistrationAttendee.id))
        .join(TrainingAttendee, TrainingRegistrationAttendee.attendee_id == TrainingAttendee.id)
        .join(TrainingRegistration, TrainingRegistrationAttendee.registration_id == TrainingRegistration.id)
        .join(ProgramYearTraining, TrainingRegistration.placement_id == ProgramYearTraining.id)
        .where(
            TrainingAttendee.portal_user_id == user_id,
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.status != "parked",
            TrainingRegistration.status != "cancelled",
            ProgramYearTraining.is_active.is_(True),
        )
    )
    if ((await db.execute(reg_q)).scalar() or 0) > 0:
        return True

    offer_q = (
        select(func.count(OfferAttendee.id))
        .join(TrainingAttendee, OfferAttendee.attendee_id == TrainingAttendee.id)
        .join(ProgramYearTraining, OfferAttendee.placement_id == ProgramYearTraining.id)
        .join(CustomerOffer, OfferAttendee.offer_id == CustomerOffer.id)
        .where(
            TrainingAttendee.portal_user_id == user_id,
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.status != "parked",
            CustomerOffer.status == "accepted",
            ProgramYearTraining.is_active.is_(True),
        )
    )
    return ((await db.execute(offer_q)).scalar() or 0) > 0


@router.put("/{user_id}/toggle-access")
async def toggle_portal_access(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Enable or disable a portal user's access.

    Deactivation is blocked if the user is still attached to an active training
    (non-parked attendee + active placement + non-cancelled registration or
    accepted offer). Park the attendee first, or deactivate the placement.

    This endpoint toggles ``PortalUser.is_active`` only — it does not mutate
    ``TrainingAttendee.status``. Activating a user does not restore them to the
    parking lot; attendee status is controlled by the explicit Deactivate /
    Reactivate actions on the attendee itself. Read endpoints derive an
    *effective* status (``parked`` + dead portal → reported as ``inactive``)
    so the parking lot hides deactivated users without mutating the attendee.

    Writes a ``portal_activated`` or ``portal_deactivated`` history event on
    every linked attendee for audit purposes.
    """
    user = await get_portal_user(db, user_id, current_user.tenant_id)

    if user.is_active and await _has_active_training_assignment(db, user.id, current_user.tenant_id):
        raise ConflictError("Cannot deactivate: user is assigned to an active training")

    deactivating = user.is_active
    user.is_active = not user.is_active

    att_result = await db.execute(
        select(TrainingAttendee.id).where(
            TrainingAttendee.portal_user_id == user.id,
            TrainingAttendee.tenant_id == current_user.tenant_id,
        )
    )
    event_type = "portal_deactivated" if deactivating else "portal_activated"
    notes = "Portal account deactivated" if deactivating else "Portal account activated"
    for att_id in att_result.scalars().all():
        db.add(
            TrainingAttendeeHistory(
                tenant_id=current_user.tenant_id,
                attendee_id=att_id,
                event_type=event_type,
                notes=notes,
                created_by=current_user.user_id,
            )
        )

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

    user = await get_portal_user(db, user_id, current_user.tenant_id)
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

    user = await get_portal_user(db, user_id, current_user.tenant_id)
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

    user = await get_portal_user(db, user_id, current_user.tenant_id)

    if not user.is_active:
        raise HTTPException(status_code=422, detail="Cannot impersonate a deactivated user")

    access_token = create_portal_access_token(user.id, user.tenant_id)

    logger.info("Admin %s impersonating portal user %s", current_user.user_id, user.email)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "portal_user_email": user.email,
        "portal_user_name": f"{user.first_name} {user.last_name}",
    }


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

    tenant_id = current_user.tenant_id
    source_user_id = UUID(data.source_user_id)

    if target_user_id == source_user_id:
        raise HTTPException(status_code=422, detail="Cannot merge a user with itself")

    target = await get_portal_user(db, target_user_id, tenant_id)
    source = await get_portal_user(db, source_user_id, tenant_id)

    source_att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.portal_user_id == source.id,
            TrainingAttendee.tenant_id == tenant_id,
        )
    )
    source_attendees = source_att_result.scalars().all()

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
            history_result = await db.execute(
                select(TrainingAttendeeHistory).where(TrainingAttendeeHistory.attendee_id == src_att.id)
            )
            for h in history_result.scalars().all():
                h.attendee_id = target_attendee.id
                merged_records += 1

            ra_result = await db.execute(
                select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.attendee_id == src_att.id)
            )
            for ra in ra_result.scalars().all():
                ra.attendee_id = target_attendee.id
                merged_records += 1

            oa_result = await db.execute(select(OfferAttendee).where(OfferAttendee.attendee_id == src_att.id))
            for oa in oa_result.scalars().all():
                oa.attendee_id = target_attendee.id
                merged_records += 1

            await db.delete(src_att)
        else:
            src_att.portal_user_id = target.id
            target_attendee = src_att
            merged_records += 1

    source_cfp = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == source.id))
    source_cfp_applicant = source_cfp.scalar_one_or_none()

    if source_cfp_applicant:
        target_cfp = await db.execute(select(CFPApplicant).where(CFPApplicant.portal_user_id == target.id))
        if not target_cfp.scalar_one_or_none():
            source_cfp_applicant.portal_user_id = target.id
            merged_records += 1

    if not target.password_hash and source.password_hash:
        target.password_hash = source.password_hash

    if source.last_login_at and (not target.last_login_at or source.last_login_at > target.last_login_at):
        target.last_login_at = source.last_login_at

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
