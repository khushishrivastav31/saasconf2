"""Admin training messaging endpoints.

Today: broadcast a message to every attendee on a single
``TrainingRegistration``. The admin clicks "Message attendees" on a
RegistrationRow expansion in the trainings UI; the request lands here.

Future PRs in the messaging plan layer on:
  - Listing training broadcast threads from the admin side (PR 2/4).
  - Templates / recipient lists / dynamic lists (PR 4).
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.schemas.training_messaging import (
    TrainingBroadcastRecipient,
    TrainingBroadcastRequest,
    TrainingBroadcastResponse,
)
from app.services.training_messaging import broadcast_to_registration_attendees

router = APIRouter(prefix="/registrations", tags=["training-messaging"])


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
