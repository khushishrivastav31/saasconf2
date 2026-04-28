"""Trainings-side screen-overlay management.

Mirror of the per-conference ``/conferences/{id}/screen-overlays/*``
endpoints, but tenant-scoped: training-domain overlays apply tenant-wide
to portal users on the trainings module (no per-placement fan-out — the
admin Settings UI is a single Screen Overlays tab under
``/modules/trainings/settings``).

Migration 216 made ``screen_overlays.conference_id`` nullable and added a
``domain`` discriminator. Training-domain rows leave ``conference_id`` at
``NULL``; the CHECK constraint enforces the pairing.
"""

import time
from uuid import UUID

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.config import get_settings
from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.db.session import set_rls_context
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.screen_overlay import OVERLAY_DOMAIN_TRAINING, ScreenOverlay
from app.schemas.screen_overlay import (
    ScreenOverlayCreate,
    ScreenOverlayListResponse,
    ScreenOverlayResponse,
    ScreenOverlayUpdate,
)

router = APIRouter(prefix="/screen-overlays", tags=["training-overlays"])


def _audit(current_user, request: Request, action: str, overlay_id: UUID, details: dict) -> AuditLog:
    return AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=action,
        resource_type="screen_overlay",
        resource_id=overlay_id,
        details=details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )


async def _load_training_overlay(
    db,
    overlay_id: UUID,
    tenant_id: UUID,
) -> ScreenOverlay:
    result = await db.execute(
        select(ScreenOverlay).where(
            ScreenOverlay.id == overlay_id,
            ScreenOverlay.tenant_id == tenant_id,
            ScreenOverlay.domain == OVERLAY_DOMAIN_TRAINING,
        )
    )
    overlay = result.scalar_one_or_none()
    if overlay is None:
        raise NotFoundError(f"Screen overlay with ID '{overlay_id}' not found")
    return overlay


@router.get("", response_model=ScreenOverlayListResponse)
async def list_training_overlays(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> ScreenOverlayListResponse:
    """List tenant-wide training-domain overlays."""
    tenant_id = current_user.require_tenant_id()
    base = (
        select(ScreenOverlay)
        .where(
            ScreenOverlay.tenant_id == tenant_id,
            ScreenOverlay.domain == OVERLAY_DOMAIN_TRAINING,
        )
        .order_by(ScreenOverlay.display_order, ScreenOverlay.created_at.desc())
    )
    rows = (await db.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    count_q = select(ScreenOverlay).where(
        ScreenOverlay.tenant_id == tenant_id, ScreenOverlay.domain == OVERLAY_DOMAIN_TRAINING
    )
    total = len((await db.execute(count_q)).scalars().all())
    return ScreenOverlayListResponse(
        items=[ScreenOverlayResponse.model_validate(o) for o in rows],
        total=total,
    )


@router.post("", response_model=ScreenOverlayResponse, status_code=201)
async def create_training_overlay(
    overlay_data: ScreenOverlayCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ScreenOverlayResponse:
    """Create a tenant-wide training overlay."""
    if overlay_data.trigger_type == "scheduled" and overlay_data.schedule_date is None:
        raise ValidationError("schedule_date is required when trigger_type is 'scheduled'")

    overlay = ScreenOverlay(
        tenant_id=current_user.require_tenant_id(),
        conference_id=None,
        domain=OVERLAY_DOMAIN_TRAINING,
        trigger_type=overlay_data.trigger_type,
        title=overlay_data.title,
        body_text=overlay_data.body_text,
        animation_style=overlay_data.animation_style,
        duration_seconds=overlay_data.duration_seconds,
        is_active=overlay_data.is_active,
        schedule_date=overlay_data.schedule_date,
        display_order=overlay_data.display_order,
    )
    db.add(overlay)
    await db.flush()
    db.add(
        _audit(
            current_user, request, "screen_overlay.create", overlay.id, {"title": overlay.title, "domain": "training"}
        )
    )
    await db.commit()
    await db.refresh(overlay)
    return ScreenOverlayResponse.model_validate(overlay)


@router.get("/{overlay_id}", response_model=ScreenOverlayResponse)
async def get_training_overlay(
    overlay_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ScreenOverlayResponse:
    overlay = await _load_training_overlay(db, overlay_id, current_user.require_tenant_id())
    return ScreenOverlayResponse.model_validate(overlay)


@router.put("/{overlay_id}", response_model=ScreenOverlayResponse)
async def update_training_overlay(
    overlay_id: UUID,
    overlay_data: ScreenOverlayUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ScreenOverlayResponse:
    overlay = await _load_training_overlay(db, overlay_id, current_user.require_tenant_id())
    update_data = overlay_data.model_dump(exclude_unset=True)
    new_trigger = update_data.get("trigger_type", overlay.trigger_type)
    new_schedule = update_data.get("schedule_date", overlay.schedule_date)
    if new_trigger == "scheduled" and new_schedule is None:
        raise ValidationError("schedule_date is required when trigger_type is 'scheduled'")
    for k, v in update_data.items():
        setattr(overlay, k, v)
    db.add(
        _audit(current_user, request, "screen_overlay.update", overlay_id, {"updated_fields": list(update_data.keys())})
    )
    await db.commit()
    await db.refresh(overlay)
    return ScreenOverlayResponse.model_validate(overlay)


@router.delete("/{overlay_id}")
async def delete_training_overlay(
    overlay_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    overlay = await _load_training_overlay(db, overlay_id, current_user.require_tenant_id())
    title = overlay.title

    # Drop image attachment if any.
    img_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.require_tenant_id(),
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    old_img = img_result.scalar_one_or_none()
    if old_img:
        await db.delete(old_img)

    await db.delete(overlay)
    db.add(_audit(current_user, request, "screen_overlay.delete", overlay_id, {"title": title, "domain": "training"}))
    await db.commit()
    return {"message": f"Screen overlay '{title}' deleted successfully"}


@router.post("/{overlay_id}/image")
async def upload_training_overlay_image(
    overlay_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    file: UploadFile = File(...),
) -> dict:
    overlay = await _load_training_overlay(db, overlay_id, current_user.require_tenant_id())

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

    # Replace existing image, if any.
    existing = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.require_tenant_id(),
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    old_attachment = existing.scalar_one_or_none()
    if old_attachment:
        await db.delete(old_attachment)

    db.add(
        Attachment(
            tenant_id=current_user.require_tenant_id(),
            entity_type="screen_overlay_image",
            entity_id=overlay_id,
            filename=safe_filename,
            content_type=verified_type,
            file_size=file_size,
            file_data=file_data,
            description="Screen overlay image",
            uploaded_by=current_user.user_id,
        )
    )

    overlay.image_url = f"/trainings/screen-overlays/{overlay_id}/image?v={int(time.time())}"
    flag_modified(overlay, "image_url")
    db.add(
        _audit(
            current_user,
            request,
            "screen_overlay.image_upload",
            overlay_id,
            {"filename": safe_filename, "file_size": file_size, "domain": "training"},
        )
    )
    await db.commit()
    return {
        "message": "Image uploaded successfully",
        "image_url": overlay.image_url,
        "filename": safe_filename,
        "content_type": verified_type,
        "file_size": file_size,
    }


@router.get("/{overlay_id}/image")
async def get_training_overlay_image(
    overlay_id: UUID,
    db: DbSessionDep,
) -> Response:
    """Serve the overlay image (public endpoint, RLS-bypassed)."""
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


@router.delete("/{overlay_id}/image")
async def delete_training_overlay_image(
    overlay_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    overlay = await _load_training_overlay(db, overlay_id, current_user.require_tenant_id())
    result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.require_tenant_id(),
            Attachment.entity_type == "screen_overlay_image",
            Attachment.entity_id == overlay_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if attachment:
        await db.delete(attachment)
    overlay.image_url = None
    flag_modified(overlay, "image_url")
    db.add(_audit(current_user, request, "screen_overlay.image_delete", overlay_id, {"domain": "training"}))
    await db.commit()
    return {"message": "Image deleted successfully"}
