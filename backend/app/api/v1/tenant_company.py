"""Tenant company management endpoints (tenant admin only)."""

import time
from typing import cast
from uuid import UUID

from fastapi import APIRouter, Query, Request, UploadFile
from sqlalchemy import CursorResult, func, select, update

from app.config import get_settings
from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import sanitize_filename, strip_image_metadata, validate_upload
from app.core.vat_validation import validate_vat_number
from app.models.attachment import Attachment
from app.models.audit import AuditAction, AuditLog
from app.models.email_log import EmailLog
from app.models.tenant import Tenant
from app.schemas.email_log import EmailLogListResponse, EmailLogResponse
from app.schemas.tenant import ContactPersonResponse, TenantResponse, TenantUpdate

router = APIRouter()


def _build_tenant_response(tenant: Tenant) -> TenantResponse:
    """Build a TenantResponse from a Tenant model."""
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        is_active=tenant.is_active,
        settings=tenant.settings,
        address=tenant.address,
        postal_code=tenant.postal_code,
        city=tenant.city,
        country=tenant.country,
        vat_number=tenant.vat_number,
        website=tenant.website,
        logo_url=tenant.logo_url,
        contact_persons=[ContactPersonResponse(**cp) for cp in (tenant.contact_persons or [])],
        comments=tenant.comments,
        resend_api_key=tenant.resend_api_key,
        resend_from_email=tenant.resend_from_email,
        resend_from_name=tenant.resend_from_name,
        super_user_id=tenant.super_user_id,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        user_count=0,  # Not needed for this context
        module_count=0,  # Not needed for this context
    )


@router.get("", response_model=TenantResponse)
async def get_my_company(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TenantResponse:
    """
    Get the current tenant's company information.

    Only accessible by tenant admins.
    """
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError("Tenant not found")

    return _build_tenant_response(tenant)


@router.put("", response_model=TenantResponse)
async def update_my_company(
    company_data: TenantUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> TenantResponse:
    """
    Update the current tenant's company information.

    Only accessible by tenant admins.
    Note: slug and is_active cannot be changed by tenant admins.
    """
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError("Tenant not found")

    # Tenant admins cannot change slug or is_active
    update_data = company_data.model_dump(exclude_unset=True)
    update_data.pop("slug", None)
    update_data.pop("is_active", None)

    for field, value in update_data.items():
        setattr(tenant, field, value)

    # Log action
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.TENANT_UPDATE,
        resource_type="tenant",
        resource_id=tenant.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(tenant)

    return _build_tenant_response(tenant)


@router.post("/logo")
async def upload_my_company_logo(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Upload a logo for the current tenant's company.

    Only accessible by tenant admins.
    """
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    # Get form data
    form = await request.form()
    raw_file = form.get("file")

    if not isinstance(raw_file, UploadFile):
        raise ValidationError("No file provided")
    file: UploadFile = raw_file

    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError("Tenant not found")

    # Read and validate file
    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "tenant_logo")
    file_data = strip_image_metadata(file_data, verified_type)
    file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "logo")

    # Delete existing logo attachment if present
    if tenant.logo_url:
        existing_attachment = await db.execute(
            select(Attachment).where(
                Attachment.entity_type == "tenant_logo",
                Attachment.entity_id == current_user.tenant_id,
            )
        )
        existing = existing_attachment.scalar_one_or_none()
        if existing:
            await db.delete(existing)

    # Create attachment
    attachment = Attachment(
        tenant_id=current_user.tenant_id,
        entity_type="tenant_logo",
        entity_id=current_user.tenant_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=len(file_data),
        file_data=file_data,
    )
    db.add(attachment)

    # Update tenant logo_url - use admin endpoint which doesn't require auth for GET
    # Include timestamp to bust browser cache when logo is replaced
    tenant.logo_url = f"/admin/tenants/{current_user.tenant_id}/logo?v={int(time.time())}"

    await db.commit()

    return {"message": "Logo uploaded successfully", "logo_url": tenant.logo_url}


@router.delete("/logo")
async def delete_my_company_logo(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete the current tenant's company logo.

    Only accessible by tenant admins.
    """
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError("Tenant not found")

    # Find and delete attachment
    attachment_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == current_user.tenant_id,
        )
    )
    attachment = attachment_result.scalar_one_or_none()

    if attachment:
        await db.delete(attachment)

    # Clear logo_url
    tenant.logo_url = None

    await db.commit()

    return {"message": "Logo deleted successfully"}


@router.get("/email-defaults")
async def get_email_defaults(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:  # type: ignore[type-arg]
    """Return the global Resend email defaults and tenant key status.

    Only accessible by tenant admins.
    """
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(select(Tenant.resend_api_key).where(Tenant.id == current_user.tenant_id))
    tenant_key = result.scalar_one_or_none()

    settings = get_settings()
    return {
        "resend_from_email": settings.RESEND_FROM_EMAIL,
        "resend_from_name": settings.RESEND_FROM_NAME,
        "resend_api_key_set": bool(settings.RESEND_API_KEY),
        "tenant_api_key_set": bool(tenant_key),
    }


# --- Email failure log endpoints ---


@router.get("/email-failures/count")
async def get_email_failure_count(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:  # type: ignore[type-arg]
    """Return count of unacknowledged email failures for badge display."""
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(
        select(func.count(EmailLog.id)).where(
            EmailLog.tenant_id == current_user.tenant_id,
            EmailLog.acknowledged.is_(False),
        )
    )
    return {"unacknowledged": result.scalar_one()}


@router.get("/email-failures", response_model=EmailLogListResponse)
async def get_email_failures(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    acknowledged: bool | None = Query(None),
) -> EmailLogListResponse:
    """Return paginated email failure logs for the current tenant."""
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    base = select(EmailLog).where(EmailLog.tenant_id == current_user.tenant_id)
    count_base = select(func.count(EmailLog.id)).where(EmailLog.tenant_id == current_user.tenant_id)

    if acknowledged is not None:
        base = base.where(EmailLog.acknowledged == acknowledged)
        count_base = count_base.where(EmailLog.acknowledged == acknowledged)

    # Total matching
    total = (await db.execute(count_base)).scalar_one()

    # Total unacknowledged (always returned for badge)
    unack_count = (
        await db.execute(
            select(func.count(EmailLog.id)).where(
                EmailLog.tenant_id == current_user.tenant_id,
                EmailLog.acknowledged.is_(False),
            )
        )
    ).scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    rows = (await db.execute(base.order_by(EmailLog.created_at.desc()).offset(offset).limit(page_size))).scalars().all()

    return EmailLogListResponse(
        items=[EmailLogResponse.model_validate(r) for r in rows],
        total=total,
        total_unacknowledged=unack_count,
        page=page,
        page_size=page_size,
    )


@router.post("/email-failures/{failure_id}/acknowledge", response_model=EmailLogResponse)
async def acknowledge_email_failure(
    failure_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> EmailLogResponse:
    """Acknowledge a single email failure."""
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    result = await db.execute(
        select(EmailLog).where(
            EmailLog.id == failure_id,
            EmailLog.tenant_id == current_user.tenant_id,
        )
    )
    log_entry = result.scalar_one_or_none()
    if not log_entry:
        raise NotFoundError("Email failure log not found")

    log_entry.acknowledged = True
    log_entry.acknowledged_at = func.now()
    log_entry.acknowledged_by = current_user.user_id
    await db.commit()
    await db.refresh(log_entry)

    return EmailLogResponse.model_validate(log_entry)


@router.post("/email-failures/acknowledge-all")
async def acknowledge_all_email_failures(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:  # type: ignore[type-arg]
    """Acknowledge all unacknowledged email failures for the current tenant."""
    if current_user.is_super_admin or current_user.tenant_id is None:
        raise ValidationError("This endpoint is for tenant admins only")

    update_result = await db.execute(
        update(EmailLog)
        .where(
            EmailLog.tenant_id == current_user.tenant_id,
            EmailLog.acknowledged.is_(False),
        )
        .values(
            acknowledged=True,
            acknowledged_at=func.now(),
            acknowledged_by=current_user.user_id,
        )
    )
    await db.commit()

    return {"acknowledged_count": cast(CursorResult, update_result).rowcount}


@router.post("/validate-vat")
async def validate_vat(
    current_user: CurrentUserDep,
    vat_number: str = Query(..., min_length=2),
    country: str = Query(..., min_length=1),
) -> dict:  # type: ignore[type-arg]
    """Validate a VAT number using stdnum, regex fallback, and VIES API.

    Standalone endpoint — no conference context required.
    Accepts both ISO country codes (DE) and full names (Germany).
    """
    return await validate_vat_number(vat_number, country)
