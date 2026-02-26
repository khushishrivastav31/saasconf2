"""Screen overlay management endpoints (conference-scoped)."""

import time
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.db.session import set_rls_context
from app.models.attachment import Attachment
from app.models.screen_overlay import ScreenOverlay
from app.schemas.screen_overlay import (
    ScreenOverlayCreate,
    ScreenOverlayListResponse,
    ScreenOverlayResponse,
    ScreenOverlayUpdate,
)
from app.services.conference import ConferenceService

router = APIRouter()

MODULE_CODE = "conferences"

svc = ConferenceService


@router.get(
    "",
    response_model=ScreenOverlayListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_screen_overlays(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> ScreenOverlayListResponse:
    """List screen overlays for a conference."""
    await svc.resolve_conference(db, conference_id, current_user.tenant_id)

    query = (
        select(ScreenOverlay)
        .where(
            ScreenOverlay.conference_id == conference_id,
            ScreenOverlay.tenant_id == current_user.tenant_id,
        )
        .order_by(ScreenOverlay.display_order, ScreenOverlay.created_at.desc())
    )

    result = await svc.list_resources(db, query, page, page_size)

    items = [ScreenOverlayResponse.model_validate(o) for o in result.items]

    return ScreenOverlayListResponse(items=items, total=result.total)


@router.post(
    "",
    response_model=ScreenOverlayResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_screen_overlay(
    conference_id: UUID,
    overlay_data: ScreenOverlayCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ScreenOverlayResponse:
    """Create a new screen overlay for a conference."""
    await svc.require_admin(db, current_user, conference_id)
    conference = await svc.resolve_conference(db, conference_id, current_user.tenant_id)

    # Validate: scheduled type requires schedule_date
    if overlay_data.trigger_type == "scheduled" and overlay_data.schedule_date is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=422,
            detail="schedule_date is required when trigger_type is 'scheduled'",
        )

    overlay = ScreenOverlay(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        trigger_type=overlay_data.trigger_type,
        title=overlay_data.title,
        body_text=overlay_data.body_text,
        animation_style=overlay_data.animation_style,
        duration_seconds=overlay_data.duration_seconds,
        is_active=overlay_data.is_active,
        schedule_date=overlay_data.schedule_date,
        display_order=overlay_data.display_order,
    )

    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="screen_overlay.create",
        resource_type="screen_overlay",
        resource_id=overlay.id,
        details={
            "title": overlay.title,
            "conference_id": str(conference.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    await svc.create_resource(db, overlay, audit_log=audit_log)

    return ScreenOverlayResponse.model_validate(overlay)


@router.get(
    "/{overlay_id}",
    response_model=ScreenOverlayResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_screen_overlay(
    conference_id: UUID,
    overlay_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ScreenOverlayResponse:
    """Get a single screen overlay."""
    result = await db.execute(
        select(ScreenOverlay).where(
            ScreenOverlay.id == overlay_id,
            ScreenOverlay.conference_id == conference_id,
            ScreenOverlay.tenant_id == current_user.tenant_id,
        )
    )
    overlay = result.scalar_one_or_none()
    if not overlay:
        raise NotFoundError(f"Screen overlay with ID '{overlay_id}' not found")

    return ScreenOverlayResponse.model_validate(overlay)


@router.put(
    "/{overlay_id}",
    response_model=ScreenOverlayResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_screen_overlay(
    conference_id: UUID,
    overlay_id: UUID,
    overlay_data: ScreenOverlayUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ScreenOverlayResponse:
    """Update a screen overlay."""
    await svc.require_admin(db, current_user, conference_id)

    overlay = await svc.get_resource(
        db,
        ScreenOverlay,
        overlay_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Screen overlay",
    )

    update_data = overlay_data.model_dump(exclude_unset=True)

    # Validate: if switching to scheduled, need schedule_date
    new_trigger = update_data.get("trigger_type", overlay.trigger_type)
    new_schedule = update_data.get("schedule_date", overlay.schedule_date)
    if new_trigger == "scheduled" and new_schedule is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=422,
            detail="schedule_date is required when trigger_type is 'scheduled'",
        )

    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="screen_overlay.update",
        resource_type="screen_overlay",
        resource_id=overlay_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    await svc.update_resource(db, overlay, update_data, audit_log=audit_log)

    return ScreenOverlayResponse.model_validate(overlay)


@router.delete(
    "/{overlay_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_screen_overlay(
    conference_id: UUID,
    overlay_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a screen overlay."""
    await svc.require_admin(db, current_user, conference_id)

    overlay = await svc.get_resource(
        db,
        ScreenOverlay,
        overlay_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Screen overlay",
    )

    title = overlay.title

    # Clean up image attachment if any
    img_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    old_img = img_result.scalar_one_or_none()
    if old_img:
        await db.delete(old_img)

    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="screen_overlay.delete",
        resource_type="screen_overlay",
        resource_id=overlay_id,
        details={
            "title": title,
            "conference_id": str(conference_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    await svc.delete_resource(db, overlay, audit_log=audit_log)

    return {"message": f"Screen overlay '{title}' deleted successfully"}


# --- Image endpoints (following conference logo pattern) ---


@router.post(
    "/{overlay_id}/image",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def upload_overlay_image(
    conference_id: UUID,
    overlay_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    """Upload or replace the screen overlay image."""
    await svc.require_admin(db, current_user, conference_id)

    overlay = await svc.get_resource(
        db,
        ScreenOverlay,
        overlay_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Screen overlay",
    )

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
    verified_type = validate_upload(file_data, content_type, "screen_overlay_image")
    file_data = strip_image_metadata(file_data, verified_type)
    file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "overlay-image")

    # Delete existing image attachment if any
    existing = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    old_attachment = existing.scalar_one_or_none()
    if old_attachment:
        await db.delete(old_attachment)

    # Create new attachment
    attachment = Attachment(
        tenant_id=current_user.tenant_id,
        entity_type="screen_overlay_image",
        entity_id=overlay_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description="Screen overlay image",
        uploaded_by=current_user.user_id,
    )
    db.add(attachment)

    # Update overlay image_url with cache-busting timestamp
    overlay.image_url = f"/conferences/{conference_id}/screen-overlays/{overlay_id}/image?v={int(time.time())}"
    flag_modified(overlay, "image_url")

    # Audit log
    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="screen_overlay.image_upload",
        resource_type="screen_overlay",
        resource_id=overlay_id,
        details={
            "filename": safe_filename,
            "file_size": file_size,
            "conference_id": str(conference_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {
        "message": "Image uploaded successfully",
        "image_url": overlay.image_url,
        "filename": safe_filename,
        "content_type": verified_type,
        "file_size": file_size,
    }


@router.get("/{overlay_id}/image")
async def get_overlay_image(
    conference_id: UUID,
    overlay_id: UUID,
    db: DbSessionDep,
) -> Response:
    """Serve the screen overlay image (public endpoint)."""
    # Bypass RLS for public access (same pattern as conference logo)
    await set_rls_context(db, is_super_admin=True)

    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Screen overlay image not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Content-Length": str(attachment.file_size),
            "Cache-Control": "public, max-age=86400",
        },
    )


@router.delete(
    "/{overlay_id}/image",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_overlay_image(
    conference_id: UUID,
    overlay_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete the screen overlay image."""
    await svc.require_admin(db, current_user, conference_id)

    overlay = await svc.get_resource(
        db,
        ScreenOverlay,
        overlay_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Screen overlay",
    )

    # Find and delete attachment
    result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if attachment:
        await db.delete(attachment)

    # Clear image_url
    overlay.image_url = None
    flag_modified(overlay, "image_url")

    # Audit log
    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="screen_overlay.image_delete",
        resource_type="screen_overlay",
        resource_id=overlay_id,
        details={"conference_id": str(conference_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    return {"message": "Image deleted successfully"}
