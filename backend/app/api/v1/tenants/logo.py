"""Tenant logo management endpoints (super admin only)."""

import time
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSessionDep, SuperAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.models.tenant import Tenant

router = APIRouter()


@router.post("/{tenant_id}/logo")
async def upload_tenant_logo(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Upload a logo for a tenant.

    Only accessible by super admins.
    """
    from fastapi import UploadFile, File
    from app.models.attachment import Attachment

    # Get form data
    form = await request.form()
    file: UploadFile | None = form.get("file")

    if not file:
        raise ValidationError("No file provided")

    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

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
                Attachment.entity_id == tenant_id,
            )
        )
        existing = existing_attachment.scalar_one_or_none()
        if existing:
            await db.delete(existing)

    # Create attachment
    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type="tenant_logo",
        entity_id=tenant_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
    )
    db.add(attachment)

    # Update tenant logo_url (timestamp busts browser cache on replace)
    tenant.logo_url = f"/admin/tenants/{tenant_id}/logo?v={int(time.time())}"

    await db.commit()

    return {"message": "Logo uploaded successfully", "logo_url": tenant.logo_url}


@router.get("/{tenant_id}/logo")
async def get_tenant_logo(
    tenant_id: UUID,
    db: DbSessionDep,
) -> bytes:
    """Get the tenant logo image."""
    from fastapi.responses import Response
    from app.models.attachment import Attachment
    from app.db.session import set_rls_context

    # Set RLS context to allow access (logos are public)
    await set_rls_context(db, is_super_admin=True)

    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()

    if not attachment:
        raise NotFoundError("Logo not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.delete("/{tenant_id}/logo")
async def delete_tenant_logo(
    tenant_id: UUID,
    current_user: SuperAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete the tenant logo.

    Only accessible by super admins.
    """
    from app.models.attachment import Attachment

    # Verify tenant exists
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise NotFoundError(f"Tenant with ID '{tenant_id}' not found")

    # Find and delete attachment
    attachment_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "tenant_logo",
            Attachment.entity_id == tenant_id,
        )
    )
    attachment = attachment_result.scalar_one_or_none()

    if attachment:
        await db.delete(attachment)

    # Clear logo_url
    tenant.logo_url = None

    await db.commit()

    return {"message": "Logo deleted successfully"}
