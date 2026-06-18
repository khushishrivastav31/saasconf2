"""CFP Applicant Portal - File upload and download endpoints."""

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.file_validation import (
    playback_content_type,
    safe_content_disposition,
    sanitize_filename,
    strip_image_metadata,
    validate_upload,
)
from app.models.attachment import Attachment
from app.models.cfp import (
    PaperStatus,
)

from .papers import _get_applicant_or_cospeaker_paper

router = APIRouter()

PORTAL_ALLOWED_ENTITY_TYPES = {"applicant_picture", "applicant_video", "paper_video", "paper_file", "speaker_expense"}


@router.post("/portal/attachments")
async def upload_portal_attachment(
    current: CurrentApplicantDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    description: str | None = Form(None),
) -> dict:
    """Upload an attachment (picture/video/file) for the current applicant or their paper."""
    if entity_type not in PORTAL_ALLOWED_ENTITY_TYPES:
        raise ValidationError(f"Invalid entity_type: {entity_type}")

    # Validate ownership
    if entity_type in ("applicant_picture", "applicant_video"):
        if str(current.applicant_id) != entity_id:
            raise AuthorizationError("You can only upload media for your own profile")
    elif entity_type in ("paper_video", "paper_file"):
        paper = await _get_applicant_or_cospeaker_paper(db, entity_id, current.applicant_id, current.tenant_id)
        if paper.status != PaperStatus.DRAFT.value:
            raise ValidationError("Can only upload files for draft papers")
    elif entity_type == "speaker_expense":
        from app.models.speaker_expense import SpeakerExpense

        exp_result = await db.execute(
            select(SpeakerExpense).where(
                SpeakerExpense.id == entity_id,
                SpeakerExpense.cfp_applicant_id == current.applicant_id,
                SpeakerExpense.tenant_id == current.tenant_id,
            )
        )
        if not exp_result.scalar_one_or_none():
            raise AuthorizationError("Expense not found or not yours")

    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    verified_type = validate_upload(file_data, file.content_type or "application/octet-stream", entity_type)
    if entity_type == "applicant_picture":
        file_data = strip_image_metadata(file_data, verified_type)
        file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "upload")

    # Delete existing attachment of same type for this entity (only keep latest).
    # For paper_file, description holds the field_key — scope the replace to that field.
    # Exception: speaker_expense allows multiple receipts.
    if entity_type not in ("speaker_expense",):
        stmt = select(Attachment).where(
            Attachment.tenant_id == current.tenant_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        if entity_type == "paper_file" and description is not None:
            stmt = stmt.where(Attachment.description == description)
        existing_result = await db.execute(stmt)
        for old in existing_result.scalars().all():
            await db.delete(old)

    attachment = Attachment(
        tenant_id=current.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description=description,
    )
    db.add(attachment)
    await db.commit()

    return {"id": str(attachment.id), "filename": attachment.filename, "file_size": file_size}


@router.get("/portal/attachments/{attachment_id}/download")
async def download_portal_attachment(
    attachment_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> Response:
    """Download an attachment."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == current.tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    return Response(
        content=attachment.file_data,
        media_type=playback_content_type(attachment.content_type),
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Content-Length": str(attachment.file_size),
        },
    )
