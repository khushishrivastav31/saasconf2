"""Tenant-level portal user admin actions — access, invite, reset, impersonate, merge.

Every handler writes a ``CustomerEvent`` row *and* an ``AuditLog`` row so
the user detail panel has a timeline and the global audit log has a
cross-referenceable trail. Actions operate on the unified ``PortalUser`` and
respect both training-side and conference-side linked records.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import ConflictError, NotFoundError
from app.core.portal_security import generate_password_reset_token
from app.core.security.pii_crypto import read_pii
from app.core.utils import utcnow
from app.models.audit import AuditAction
from app.models.cfp_applicants import CFPApplicant
from app.models.customer_event import CustomerEventType
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalRefreshToken
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_registration import TrainingRegistrationAttendee
from app.services.base import BaseService

from ._helpers import (
    get_portal_user,
    has_active_assignment,
    write_history,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal-users", tags=["Portal Users"])


class MergeUsersRequest(BaseModel):
    source_user_id: str


def _portal_set_password_url(portal_base_url: str, tenant_slug: str, token: str) -> str:
    """Build the portal set-password URL. Trainings-style link; routes to the
    unified portal set-password handler."""
    return f"{portal_base_url}/{tenant_slug}/trainings/portal/set-password?token={token}"


@router.put("/{user_id}/toggle-access")
async def toggle_portal_access(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Enable or disable a portal user's access.

    Deactivation is blocked if the user has an active training-side OR
    conference-side commitment. The blocker side is returned in the error
    detail so the admin knows where to park/unlink first.
    """
    user = await get_portal_user(db, user_id, current_user.tenant_id)

    if user.is_active:
        has_active, side = await has_active_assignment(db, user, current_user.tenant_id)
        if has_active:
            side_label = "training" if side == "training" else "conference"
            raise ConflictError(f"Cannot deactivate: user is assigned to an active {side_label}")

    deactivating = user.is_active
    user.is_active = not user.is_active

    # Mirror the event into TrainingAttendeeHistory for any linked attendees so
    # the Trainings-side timeline stays in sync (backwards compat).
    att_result = await db.execute(
        select(TrainingAttendee.id).where(
            TrainingAttendee.portal_user_id == user.id,
            TrainingAttendee.tenant_id == current_user.tenant_id,
        )
    )
    training_event_type = "portal_deactivated" if deactivating else "portal_activated"
    notes = "Portal account deactivated" if deactivating else "Portal account activated"
    for att_id in att_result.scalars().all():
        db.add(
            TrainingAttendeeHistory(
                tenant_id=current_user.tenant_id,
                attendee_id=att_id,
                event_type=training_event_type,
                notes=notes,
                created_by=current_user.user_id,
            )
        )

    await write_history(
        db,
        tenant_id=current_user.tenant_id,
        portal_user_id=user.id,
        event_type=(CustomerEventType.PORTAL_DEACTIVATED if deactivating else CustomerEventType.PORTAL_ACTIVATED),
        created_by=current_user.user_id,
        notes=notes,
    )
    db.add(
        BaseService.create_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PORTAL_USER_TOGGLE_ACCESS,
            resource_type="portal_user",
            resource_id=user.id,
            details={"is_active": user.is_active},
            subject_email_hash=user.email_hash,
        )
    )

    await db.commit()

    status = "enabled" if user.is_active else "disabled"
    logger.info("Portal user %s access %s by admin %s", read_pii(user, "email"), status, current_user.user_id)
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

    await write_history(
        db,
        tenant_id=current_user.tenant_id,
        portal_user_id=user.id,
        event_type=CustomerEventType.PORTAL_INVITE_RESENT,
        created_by=current_user.user_id,
        notes="Invite email resent",
    )
    db.add(
        BaseService.create_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PORTAL_USER_RESEND_INVITE,
            resource_type="portal_user",
            resource_id=user.id,
            subject_email_hash=user.email_hash,
        )
    )
    await db.commit()

    set_password_url = _portal_set_password_url(settings.PORTAL_BASE_URL, tenant.slug, raw_token)

    user_email = read_pii(user, "email") or ""
    try:
        await send_email(
            to=user_email,
            subject=f"Set up your portal account — {tenant.name}",
            html=f"""<p>Hi {user.first_name},</p>
<p>You've been invited to access the portal. Click below to set your password:</p>
<p><a href="{set_password_url}" style="display: inline-block; padding: 12px 24px;
background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;
font-weight: bold;">Set Your Password</a></p>
<p>This link is valid for 7 days.</p>
<p>Best regards,<br/>{tenant.name}</p>""",
            tenant_from_name=tenant.name,
        )
    except Exception as exc:
        logger.warning("Failed to send portal invite to %s: %s", user_email, exc)
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

    await write_history(
        db,
        tenant_id=current_user.tenant_id,
        portal_user_id=user.id,
        event_type=CustomerEventType.PORTAL_PASSWORD_RESET_SENT,
        created_by=current_user.user_id,
        notes="Admin-initiated password reset email sent",
    )
    db.add(
        BaseService.create_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PORTAL_USER_RESET_PASSWORD,
            resource_type="portal_user",
            resource_id=user.id,
            subject_email_hash=user.email_hash,
        )
    )
    await db.commit()

    reset_url = _portal_set_password_url(settings.PORTAL_BASE_URL, tenant.slug, raw_token)

    user_email = read_pii(user, "email") or ""
    try:
        await send_email(
            to=user_email,
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
        logger.warning("Failed to send password reset to %s: %s", user_email, exc)
        raise HTTPException(status_code=502, detail="Failed to send reset email") from exc

    logger.info("Admin password reset for %s by %s", user_email, current_user.user_id)
    return {"message": "Password reset email sent"}


@router.post("/{user_id}/impersonate")
async def impersonate_portal_user(
    user_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Generate a short-lived portal access token for admin impersonation."""
    from app.core.portal_security import create_portal_access_token

    user = await get_portal_user(db, user_id, current_user.tenant_id)

    if not user.is_active:
        raise HTTPException(status_code=422, detail="Cannot impersonate a deactivated user")

    access_token = create_portal_access_token(user.id, user.tenant_id)

    await write_history(
        db,
        tenant_id=current_user.tenant_id,
        portal_user_id=user.id,
        event_type=CustomerEventType.PORTAL_IMPERSONATED,
        created_by=current_user.user_id,
        notes="Admin started an impersonation session",
    )
    db.add(
        BaseService.create_audit_log(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PORTAL_USER_IMPERSONATE,
            resource_type="portal_user",
            resource_id=user.id,
            subject_email_hash=user.email_hash,
        )
    )
    await db.commit()

    user_email = read_pii(user, "email")
    logger.info("Admin %s impersonating portal user %s", current_user.user_id, user_email)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "portal_user_email": user_email,
        "portal_user_name": f"{user.first_name} {user.last_name}",
    }


@router.post("/{target_user_id}/merge")
async def merge_portal_users(
    target_user_id: UUID,
    data: MergeUsersRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Merge source portal user into target.

    Moves every linked record — training attendees + history +
    registration-attendee + offer-attendee links on the training side, and
    CFPApplicant link on the conference side — then deletes the source
    portal_user. Writes a ``merged_from`` row on the source (the detail-panel
    cross-reference survives the delete because the history table cascades
    from portal_user, so the source's history goes with it — we also write a
    ``merged_into`` row on the *target* with the source email in ``meta`` so
    the target's timeline shows the event).
    """
    from app.models.tenant import Tenant

    tenant_id = current_user.tenant_id
    source_user_id = UUID(data.source_user_id)

    if target_user_id == source_user_id:
        raise HTTPException(status_code=422, detail="Cannot merge a user with itself")

    target = await get_portal_user(db, target_user_id, tenant_id)
    source = await get_portal_user(db, source_user_id, tenant_id)

    # Move training-side records first.
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

    # Move conference-side CFPApplicant link if present.
    source_cfp_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.portal_user_id == source.id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    source_cfp_applicant = source_cfp_result.scalar_one_or_none()

    if source_cfp_applicant:
        target_cfp_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.portal_user_id == target.id,
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        if not target_cfp_result.scalar_one_or_none():
            source_cfp_applicant.portal_user_id = target.id
            merged_records += 1

    # Password and last-login are kept best-available.
    if not target.password_hash and source.password_hash:
        target.password_hash = source.password_hash

    if source.last_login_at and (not target.last_login_at or source.last_login_at > target.last_login_at):
        target.last_login_at = source.last_login_at

    source_email = read_pii(source, "email")
    target_email = read_pii(target, "email")

    source_company = source.company
    target_company = target.company

    # Pre-delete history writes — source's row will vanish with the CASCADE.
    await write_history(
        db,
        tenant_id=tenant_id,
        portal_user_id=target.id,
        event_type=CustomerEventType.PORTAL_MERGED_INTO,
        created_by=current_user.user_id,
        notes=f"Merged from {source_email}",
        meta={
            "source_user_id": str(source.id),
            "source_email": source_email,
            "merged_records": merged_records,
            "source_company": source_company,
            "target_company": target_company,
            "company_changed": source_company != target_company,
        },
    )

    # Look up the tenant name for a richer audit line (cheap — we already
    # issued ~4 queries by now).
    tenant = await db.get(Tenant, tenant_id)
    tenant_name = tenant.name if tenant else ""

    db.add(
        BaseService.create_audit_log(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.PORTAL_USER_MERGE,
            resource_type="portal_user",
            resource_id=target.id,
            details={
                "source_user_id": str(source.id),
                "source_email": source_email,
                "target_email": target_email,
                "merged_records": merged_records,
                "tenant_name": tenant_name,
            },
            subject_email_hash=target.email_hash,
        )
    )

    await db.delete(source)
    await db.commit()

    logger.info(
        "Merged portal user %s into %s (%d records moved) by admin %s",
        source_email,
        target_email,
        merged_records,
        current_user.user_id,
    )

    return {
        "message": f"Merged {source_email} into {target_email}",
        "merged_records": merged_records,
        "target_user_id": str(target.id),
    }
