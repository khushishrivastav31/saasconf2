"""Admin training messaging endpoints.

Two surfaces:
  - ``POST /registrations/{registration_id}/messages/broadcast`` —
    message every attendee of one registration. Wired to the
    "Message attendees" button on the RegistrationRow expansion.
  - ``POST /placements/{placement_id}/messages/broadcast`` — message
    every attendee across every registration on one placement (the
    "training session" level). Wired to the Compose button on the
    admin Messages tab.

Both paths anchor each thread on the recipient's own registration via
``domain='training'`` + ``domain_entity_id=<registration.id>`` and share
a ``bulk_id`` per send so the admin Messages tab groups them.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status

from app.core.dependencies import DbSessionDep, TenantAdminDep
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

# Three routers: registration / placement / cross-placement (by attendees).
# Each carries its own URL prefix so they mount side-by-side without colliding.
router = APIRouter(prefix="/registrations", tags=["training-messaging"])
placement_router = APIRouter(prefix="/placements", tags=["training-messaging"])
attendees_broadcast_router = APIRouter(prefix="/messaging/broadcasts", tags=["training-messaging"])


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
