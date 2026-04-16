"""Training user management endpoints — enable/disable, resend invite, reset password."""

import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
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
