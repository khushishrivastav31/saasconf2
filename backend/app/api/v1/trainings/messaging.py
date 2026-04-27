"""Admin training messaging endpoints.

Surfaces:
  - ``POST /registrations/{registration_id}/messages/broadcast`` —
    message every attendee of one registration.
  - ``POST /placements/{placement_id}/messages/broadcast`` — message
    every attendee across every registration on one placement.
  - ``POST /messaging/broadcasts/by-attendees`` — cross-placement
    by-attendee-id send (search-attendee mode in the Compose dialog).
  - ``POST /messaging/upload`` — staged file upload for attachments.
  - ``GET /messaging/attachments/{id}/download`` — admin download of
    a staged or sent attachment (tenant-scoped).

Each broadcast path anchors a thread per recipient on the recipient's
own registration via ``domain='training'`` + ``domain_entity_id`` and
shares a ``bulk_id`` per send so the admin Messages tab groups them.
"""

import uuid as _uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, File, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select

from app.config import get_settings
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, validate_upload
from app.models.attachment import Attachment
from app.schemas.attachment import AttachmentResponse
from app.schemas.training_messaging import (
    AttendeesBroadcastRequest,
    AttendeesBroadcastResponse,
    PlacementBroadcastRequest,
    PlacementBroadcastResponse,
    TrainingBroadcastRecipient,
    TrainingBroadcastRequest,
    TrainingBroadcastResponse,
)
from app.services.training_messaging import (
    broadcast_to_attendees_by_id,
    broadcast_to_placement_attendees,
    broadcast_to_registration_attendees,
)

# Routers grouped by URL prefix so they mount side-by-side without colliding.
router = APIRouter(prefix="/registrations", tags=["training-messaging"])
placement_router = APIRouter(prefix="/placements", tags=["training-messaging"])
attendees_broadcast_router = APIRouter(prefix="/messaging/broadcasts", tags=["training-messaging"])
attachments_router = APIRouter(prefix="/messaging", tags=["training-messaging"])


@attachments_router.post("/upload", response_model=AttachmentResponse, status_code=201)
async def upload_training_message_attachment(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
) -> AttachmentResponse:
    """Stage a file for inclusion in a training broadcast.

    Mirrors the portal-side upload (``cfp_portal/messaging/attachments``):
    the admin uploads the file, gets back an ``Attachment`` row with a
    placeholder ``entity_id``. When the broadcast actually fires, the
    service duplicates this row per recipient message via
    ``_duplicate_attachments_per_message``.
    """
    tenant_id = current_user.require_tenant_id()

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
        entity_id=_uuid.uuid4(),  # placeholder until the broadcast fires
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


@attachments_router.get("/attachments/{attachment_id}/download")
async def download_training_message_attachment(
    attachment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Download a training-message attachment.

    Tenant-scoped: any admin in the tenant can download; we don't
    additionally restrict to the original uploader because admins
    routinely share access to broadcasts they didn't personally send.
    """
    tenant_id = current_user.require_tenant_id()
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


@router.post(
    "/{registration_id}/messages/broadcast",
    response_model=TrainingBroadcastResponse,
    status_code=status.HTTP_201_CREATED,
)
async def broadcast_to_registration(
    registration_id: UUID,
    data: TrainingBroadcastRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingBroadcastResponse:
    """Broadcast a message to every attendee on a training registration.

    Each attendee gets their own thread (so replies stay 1:1) anchored on
    the registration via ``domain='training'`` + ``domain_entity_id``. All
    threads share a ``bulk_id`` so the admin can later view the broadcast
    as a single send.
    """
    bulk_id, recipients, skipped = await broadcast_to_registration_attendees(
        db,
        tenant_id=current_user.require_tenant_id(),
        registration_id=registration_id,
        sender_user_id=current_user.user_id,
        subject_template=data.subject,
        body_html_template=data.body_html,
        screen_overlay_id=data.screen_overlay_id,
        attachment_ids=data.attachment_ids or None,
    )
    await db.commit()

    return TrainingBroadcastResponse(
        bulk_id=bulk_id,
        registration_id=registration_id,
        sent_count=len(recipients),
        skipped_count=skipped,
        created_at=datetime.now(UTC),
        recipients=[
            TrainingBroadcastRecipient(
                attendee_id=r.attendee_id,
                email=r.email,
                first_name=r.first_name,
                last_name=r.last_name,
                thread_id=r.thread_id,
            )
            for r in recipients
        ],
    )


@placement_router.post(
    "/{placement_id}/messages/broadcast",
    response_model=PlacementBroadcastResponse,
    status_code=status.HTTP_201_CREATED,
)
async def broadcast_to_placement(
    placement_id: UUID,
    data: PlacementBroadcastRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PlacementBroadcastResponse:
    """Broadcast a message to every attendee across every registration on a placement.

    Each attendee gets their own thread anchored on their own
    registration (so a 5-attendee booking and a 1-attendee booking
    produce thread anchors that match the recipient's portal view).
    All threads share one ``bulk_id`` so the admin Messages tab shows
    the send as a single row.
    """
    bulk_id, recipients, skipped = await broadcast_to_placement_attendees(
        db,
        tenant_id=current_user.require_tenant_id(),
        placement_id=placement_id,
        sender_user_id=current_user.user_id,
        subject_template=data.subject,
        body_html_template=data.body_html,
        screen_overlay_id=data.screen_overlay_id,
        attendee_ids=data.attendee_ids,
        attachment_ids=data.attachment_ids or None,
    )
    await db.commit()

    return PlacementBroadcastResponse(
        bulk_id=bulk_id,
        placement_id=placement_id,
        sent_count=len(recipients),
        skipped_count=skipped,
        created_at=datetime.now(UTC),
        recipients=[
            TrainingBroadcastRecipient(
                attendee_id=r.attendee_id,
                email=r.email,
                first_name=r.first_name,
                last_name=r.last_name,
                thread_id=r.thread_id,
            )
            for r in recipients
        ],
    )


@attendees_broadcast_router.post(
    "/by-attendees",
    response_model=AttendeesBroadcastResponse,
    status_code=status.HTTP_201_CREATED,
)
async def broadcast_to_attendees(
    data: AttendeesBroadcastRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> AttendeesBroadcastResponse:
    """Broadcast to a list of attendees regardless of placement.

    The Compose dialog's "Search attendee" mode picks attendees by name
    or email and may span multiple training sessions. Each thread still
    anchors on the recipient's own registration; all share one
    ``bulk_id`` so the Messages tab groups them.
    """
    bulk_id, recipients, skipped = await broadcast_to_attendees_by_id(
        db,
        tenant_id=current_user.require_tenant_id(),
        sender_user_id=current_user.user_id,
        attendee_ids=data.attendee_ids,
        subject_template=data.subject,
        body_html_template=data.body_html,
        screen_overlay_id=data.screen_overlay_id,
        attachment_ids=data.attachment_ids or None,
    )
    await db.commit()

    return AttendeesBroadcastResponse(
        bulk_id=bulk_id,
        sent_count=len(recipients),
        skipped_count=skipped,
        created_at=datetime.now(UTC),
        recipients=[
            TrainingBroadcastRecipient(
                attendee_id=r.attendee_id,
                email=r.email,
                first_name=r.first_name,
                last_name=r.last_name,
                thread_id=r.thread_id,
            )
            for r in recipients
        ],
    )
