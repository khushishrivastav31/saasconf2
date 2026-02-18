"""Conference logo management endpoints."""

import time
from uuid import UUID

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.db.session import set_rls_context
from app.models.attachment import Attachment
from app.models.audit import AuditAction, AuditLog
from app.models.conference import Conference

from ._shared import MODULE_CODE

router = APIRouter()


@router.post("/{conference_id}/logo", dependencies=[Depends(require_module(MODULE_CODE))])
async def upload_conference_logo(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    """
    Upload or replace the conference logo.

    Only image files (JPEG, PNG, WebP, GIF) are allowed.
    Replaces any existing logo.
    """
    # Check conference exists and user has admin access
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

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
    verified_type = validate_upload(file_data, content_type, "conference_logo")
    file_data = strip_image_metadata(file_data, verified_type)
    file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "logo")

    # Delete existing logo if any
    existing_logo = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == conference.tenant_id,
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    old_logo = existing_logo.scalar_one_or_none()
    if old_logo:
        await db.delete(old_logo)

    # Create new attachment
    attachment = Attachment(
        tenant_id=conference.tenant_id,
        entity_type="conference_logo",
        entity_id=conference_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description="Conference logo",
        uploaded_by=current_user.user_id,
    )
    db.add(attachment)

    # Update conference logo_url to point to download endpoint (relative to /api/v1)
    # Include timestamp to bust browser cache when logo is replaced
    conference.logo_url = f"/conferences/{conference_id}/logo?v={int(time.time())}"
    flag_modified(conference, "logo_url")

    # Audit log
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference_id,
        details={"action": "logo_upload", "filename": safe_filename, "file_size": file_size},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {
        "message": "Logo uploaded successfully",
        "logo_url": conference.logo_url,
        "filename": safe_filename,
        "content_type": verified_type,
        "file_size": file_size,
    }


@router.get("/{conference_id}/logo")
async def get_conference_logo(
    conference_id: UUID,
    db: DbSessionDep,
) -> Response:
    """
    Download the conference logo (public endpoint).

    Returns the logo image file. No authentication required since logos
    are typically public content displayed on conference pages.
    """
    # Logos are public — bypass RLS
    await set_rls_context(db, is_super_admin=True)

    # Find logo attachment directly by conference_id
    logo_result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    logo = logo_result.scalar_one_or_none()
    if not logo:
        raise NotFoundError("Conference logo not found")

    return Response(
        content=logo.file_data,
        media_type=logo.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(logo.filename, "inline"),
            "Content-Length": str(logo.file_size),
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.delete("/{conference_id}/logo", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_conference_logo(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """
    Delete the conference logo.
    """
    # Check conference exists and user has admin access
    await check_conference_admin_access(db, current_user.user_id, conference_id)

    result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Find and delete logo attachment (if exists)
    logo_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == conference.tenant_id,
            Attachment.entity_type == "conference_logo",
            Attachment.entity_id == conference_id,
        )
    )
    logo = logo_result.scalar_one_or_none()
    if logo:
        await db.delete(logo)

    # Always clear logo_url (handles both actual attachments and stale URL data)
    conference.logo_url = None
    flag_modified(conference, "logo_url")

    # Audit log
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action=AuditAction.CONFERENCE_UPDATE,
        resource_type="conference",
        resource_id=conference_id,
        details={"action": "logo_delete"},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": "Logo deleted successfully"}
