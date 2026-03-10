"""File attachment endpoints."""

from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.schemas.attachment import AttachmentListResponse, AttachmentResponse

router = APIRouter()

ALLOWED_ENTITY_TYPES = {
    "location",
    "volunteer",
    "conference",
    "service_provider",
    "applicant_picture",
    "applicant_video",
    "paper_video",
    "sponsor_logo",
    "sponsor_package_contract",
    "screen_overlay_image",
    "invoice",
}


@router.get("", response_model=AttachmentListResponse)
async def list_attachments(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    entity_type: str = Query(..., description="Entity type (location, volunteer, conference)"),
    entity_id: UUID = Query(..., description="Entity ID"),
) -> AttachmentListResponse:
    """List attachments for a specific entity."""
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise ValidationError(f"Invalid entity_type '{entity_type}'")

    tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must have tenant context")

    query = (
        select(Attachment)
        .where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    result = await db.execute(query)
    attachments = result.scalars().all()

    items = [
        AttachmentResponse(
            id=a.id,
            tenant_id=a.tenant_id,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            filename=a.filename,
            content_type=a.content_type,
            file_size=a.file_size,
            description=a.description,
            uploaded_by=a.uploaded_by,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in attachments
    ]
    return AttachmentListResponse(items=items, total=len(items))


@router.post("", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: UUID = Form(...),
    description: str | None = Form(None),
) -> AttachmentResponse:
    """Upload a file attachment."""
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise ValidationError(f"Invalid entity_type '{entity_type}'")

    tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must have tenant context")

    # Read file content
    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    # Validate MIME type via magic bytes
    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, entity_type)
    if entity_type in {"applicant_picture", "sponsor_logo"}:
        file_data = strip_image_metadata(file_data, verified_type)
        file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "unnamed")

    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description=description,
        uploaded_by=current_user.user_id,
    )
    db.add(attachment)

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="attachment.upload",
        resource_type="attachment",
        resource_id=attachment.id,
        details={
            "filename": attachment.filename,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "file_size": file_size,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(attachment)

    return AttachmentResponse(
        id=attachment.id,
        tenant_id=attachment.tenant_id,
        entity_type=attachment.entity_type,
        entity_id=attachment.entity_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        description=attachment.description,
        uploaded_by=attachment.uploaded_by,
        created_at=attachment.created_at,
        updated_at=attachment.updated_at,
    )


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Response:
    """Download an attachment file."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must have tenant context")

    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError(f"Attachment with ID '{attachment_id}' not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename),
            "Content-Length": str(attachment.file_size),
        },
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an attachment."""
    tenant_id = current_user.tenant_id
    if current_user.is_super_admin:
        if tenant_id is None:
            raise ValidationError("Super admin must have tenant context")

    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError(f"Attachment with ID '{attachment_id}' not found")

    filename = attachment.filename

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="attachment.delete",
        resource_type="attachment",
        resource_id=attachment_id,
        details={
            "filename": filename,
            "entity_type": attachment.entity_type,
            "entity_id": str(attachment.entity_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(attachment)
    await db.commit()

    return {"message": f"Attachment '{filename}' deleted successfully"}
