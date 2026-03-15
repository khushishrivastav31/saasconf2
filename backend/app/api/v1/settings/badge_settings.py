"""Badge settings endpoints.

Provides CRUD operations for conference-level badge configuration including:
- Badge templates per role (attendee, speaker, sponsor, etc.)
- Conditional image management
- QR code field configuration
- Badge PDF preview
"""

import uuid as uuid_mod
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import sanitize_filename, strip_image_metadata, validate_upload
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.schemas.badge import BadgeConditionalImage, BadgeSettingsResponse, BadgeSettingsUpdate

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_badge_settings(settings: dict) -> BadgeSettingsResponse:
    """Build a BadgeSettingsResponse from a conference.settings dict."""
    return BadgeSettingsResponse(
        badge_templates=settings.get("badge_templates", {}),
        badge_orientation=settings.get("badge_orientation", "landscape"),
        badge_qr_fields=settings.get("badge_qr_fields", []),
        badge_conditional_images=[BadgeConditionalImage(**img) for img in settings.get("badge_conditional_images", [])],
    )


# ---------------------------------------------------------------------------
# GET / PUT badge-settings
# ---------------------------------------------------------------------------


@router.get("/badge-settings", response_model=BadgeSettingsResponse)
async def get_badge_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BadgeSettingsResponse:
    """Get badge configuration for conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    return _read_badge_settings(conference.settings or {})


@router.put("/badge-settings", response_model=BadgeSettingsResponse)
async def update_badge_settings(
    conference_id: UUID,
    data: BadgeSettingsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BadgeSettingsResponse:
    """Update badge configuration. Requires admin access."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    settings = conference.settings or {}
    update_data = data.model_dump(exclude_unset=True, mode="json")

    conference.settings = {**settings, **update_data}
    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    return _read_badge_settings(conference.settings or {})


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------


@router.post("/badge-settings/preview")
async def preview_badge_pdf(
    conference_id: UUID,
    data: BadgeSettingsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    badge_type: str = "attendee",
) -> StreamingResponse:
    """Generate a preview badge PDF with mock data (unsaved settings)."""
    from sqlalchemy.orm import joinedload

    result = await db.execute(
        select(Conference)
        .options(joinedload(Conference.tenant))
        .where(Conference.id == conference_id, Conference.tenant_id == current_user.tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Merge preview settings with existing
    preview_settings = {**(conference.settings or {})}
    update_data = data.model_dump(exclude_unset=True)
    for key in (
        "badge_templates",
        "badge_orientation",
        "badge_qr_fields",
        "badge_conditional_images",
    ):
        if key in update_data:
            preview_settings[key] = update_data[key]

    from app.core.badge_pdf import generate_badge_pdf_from_data

    mock_data = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane.doe@example.com",
        "phone": "+49 170 1234567",
        "job_title": "Senior Engineer",
        "department": "Engineering",
        "pronouns": "she/her",
        "company_name": "Acme Corp",
        "booking_option": "2-Day Conference Pass",
        "registration_date": "2026-03-01",
    }

    pdf_bytes = await generate_badge_pdf_from_data(
        mock_data=mock_data,
        settings=preview_settings,
        conference=conference,
        badge_type=badge_type,
        db=db,
    )

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=badge_preview.pdf"},
    )


# ---------------------------------------------------------------------------
# Conditional image upload / delete / serve
# ---------------------------------------------------------------------------


@router.post("/badge-settings/conditional-images")
async def upload_conditional_image(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
    name: str = Form(...),
    placeholder: str = Form(...),
    condition_type: str = Form(...),
    condition_value: str = Form(...),
) -> BadgeSettingsResponse:
    """Upload a conditional image for badge templates."""
    await check_conference_admin(conference_id, current_user, db)

    # Validate condition_type
    if condition_type not in ("booking_option", "conference_day", "registration_item"):
        raise ValidationError("condition_type must be one of: booking_option, conference_day, registration_item")

    # Read and validate file
    file_data = await file.read()
    if not file_data:
        raise ValidationError("Empty file")

    file_size = len(file_data)
    app_settings = get_settings()
    if file_size > app_settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise ValidationError(
            f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum ({app_settings.MAX_UPLOAD_SIZE_MB}MB)"
        )

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "badge_conditional_image")
    file_data = strip_image_metadata(file_data, verified_type)
    file_size = len(file_data)
    safe_name = sanitize_filename(file.filename or "badge-image")

    # Create attachment
    attachment = Attachment(
        tenant_id=current_user.tenant_id,
        entity_type="badge_conditional_image",
        entity_id=conference_id,
        filename=safe_name,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.flush()

    # Update conference settings
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()
    settings = conference.settings or {}

    images: list[dict] = list(settings.get("badge_conditional_images", []))
    images.append(
        {
            "id": str(uuid_mod.uuid4()),
            "name": name,
            "placeholder": placeholder.upper().replace(" ", "_"),
            "condition_type": condition_type,
            "condition_value": condition_value,
            "attachment_id": str(attachment.id),
        }
    )
    settings["badge_conditional_images"] = images
    conference.settings = settings
    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    return _read_badge_settings(conference.settings or {})


@router.delete("/badge-settings/conditional-images/{image_id}")
async def delete_conditional_image(
    conference_id: UUID,
    image_id: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BadgeSettingsResponse:
    """Delete a conditional image from badge settings."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()
    settings = conference.settings or {}

    images: list[dict] = list(settings.get("badge_conditional_images", []))
    target = next((img for img in images if img["id"] == image_id), None)
    if not target:
        raise NotFoundError("Conditional image not found")

    # Delete attachment if exists
    if target.get("attachment_id"):
        att_result = await db.execute(select(Attachment).where(Attachment.id == UUID(target["attachment_id"])))
        attachment = att_result.scalar_one_or_none()
        if attachment:
            await db.delete(attachment)

    images = [img for img in images if img["id"] != image_id]
    settings["badge_conditional_images"] = images
    conference.settings = settings
    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    return _read_badge_settings(conference.settings or {})


@router.get("/badge-settings/conditional-images/{attachment_id}/file")
async def serve_conditional_image(
    conference_id: UUID,
    attachment_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Serve a conditional image file for editor preview."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type == "badge_conditional_image",
            Attachment.entity_id == conference_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Image not found")

    return StreamingResponse(
        BytesIO(attachment.file_data),
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'inline; filename="{attachment.filename}"',
            "Cache-Control": "public, max-age=86400",
        },
    )
