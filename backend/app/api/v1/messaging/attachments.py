"""Admin messaging attachment endpoints."""

import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import validate_upload, sanitize_filename, safe_content_disposition
from app.models.attachment import Attachment
from app.schemas.attachment import AttachmentResponse

from app.core.conference_helpers import get_conference_for_tenant

from ._shared import MODULE_CODE

router = APIRouter()


@router.post(
    "/upload",
    response_model=AttachmentResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def upload_message_attachment(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
) -> AttachmentResponse:
    """Upload a file for a message (pre-upload before sending)."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "message")
    safe_filename = sanitize_filename(file.filename or "unnamed")

    # Store with a placeholder entity_id; will be updated when message is sent
    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type="message",
        entity_id=uuid.uuid4(),  # placeholder
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        uploaded_by=current_user.user_id,
    )
    db.add(attachment)
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


@router.get(
    "/attachments/{attachment_id}/download",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def download_message_attachment(
    conference_id: UUID,
    attachment_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Response:
    """Download a message attachment."""
    tenant_id = current_user.tenant_id
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "message",
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename),
            "Content-Length": str(attachment.file_size),
        },
    )
