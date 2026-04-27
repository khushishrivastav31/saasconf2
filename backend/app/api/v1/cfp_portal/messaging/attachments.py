"""Portal-message attachment upload + download endpoints."""

import uuid as _uuid
from uuid import UUID

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, validate_upload
from app.models.attachment import Attachment
from app.models.messaging import Message, MessageParticipant
from app.schemas.attachment import AttachmentResponse

router = APIRouter()


@router.post("/portal/messages/upload", response_model=AttachmentResponse, status_code=201)
async def upload_portal_message_attachment(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
) -> AttachmentResponse:
    """Upload a file for a portal message (pre-upload before sending)."""
    tenant_id = current_applicant.tenant_id

    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(f"File size exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)")

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "message")
    safe_filename = sanitize_filename(file.filename or "unnamed")

    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type="message",
        entity_id=_uuid.uuid4(),  # placeholder
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        uploaded_by=None,  # applicants are not in users table
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


@router.get("/portal/messages/attachments/{attachment_id}/download")
async def download_portal_message_attachment(
    attachment_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> Response:
    """Download a message attachment (applicant must be participant of the thread)."""
    tenant_id = current_applicant.tenant_id
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

    # Verify the applicant is a participant in the thread that owns this message
    msg_result = await db.execute(
        select(Message).where(
            Message.id == attachment.entity_id,
            Message.tenant_id == tenant_id,
        )
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise NotFoundError("Attachment not found")

    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == message.thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == current_applicant.applicant_id,
        )
    )
    if not p_result.scalar_one_or_none():
        raise NotFoundError("Attachment not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename),
            "Content-Length": str(attachment.file_size),
        },
    )
