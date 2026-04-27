"""Admin training-messaging list endpoints.

The Messages tab in the trainings module landed earlier as a "Coming soon"
stub (``frontend/src/pages/Trainings/tabs/MessagesTab.tsx``). This module
fills it in: list training-domain broadcasts grouped by ``bulk_id`` so an
admin can see every send at a glance, with per-broadcast subject, training
context, recipient count, and sent-at timestamp.

The per-registration broadcast endpoint stays in ``messaging.py``; the
list lives here so it can mount under ``/trainings/messaging/broadcasts``
without colliding with the ``/trainings/registrations`` prefix.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.messaging import THREAD_DOMAIN_TRAINING, MessageThread
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

router = APIRouter(prefix="/messaging/broadcasts", tags=["training-messaging"])


class TrainingBroadcastSummary(BaseModel):
    """One row in the admin Messages tab — represents one bulk send."""

    model_config = ConfigDict(from_attributes=True)

    bulk_id: UUID
    subject: str
    registration_id: UUID  # all threads in a bulk share one registration
    training_name: str | None
    placement_date: str | None
    recipient_count: int
    last_sent_at: datetime


class TrainingBroadcastSummaryListResponse(BaseModel):
    items: list[TrainingBroadcastSummary]
    total: int


@router.get("", response_model=TrainingBroadcastSummaryListResponse)
async def list_training_broadcasts(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> TrainingBroadcastSummaryListResponse:
    """List training-domain broadcasts (bulk-id grouped) for the tenant.

    Threads created with ``domain='training'`` carry a ``bulk_id`` that
    groups every recipient of one send. We aggregate on that key so the
    admin sees one row per send instead of one row per attendee.
    """
    tenant_id = current_user.require_tenant_id()

    # Aggregate the training-domain threads we own.
    grouped = (
        select(
            MessageThread.bulk_id.label("bulk_id"),
            MessageThread.domain_entity_id.label("registration_id"),
            func.min(MessageThread.subject).label("subject"),
            func.count(MessageThread.id).label("recipient_count"),
            func.max(MessageThread.created_at).label("last_sent_at"),
        )
        .where(
            MessageThread.tenant_id == tenant_id,
            MessageThread.domain == THREAD_DOMAIN_TRAINING,
            MessageThread.bulk_id.isnot(None),
        )
        .group_by(MessageThread.bulk_id, MessageThread.domain_entity_id)
        .order_by(func.max(MessageThread.created_at).desc())
        .subquery()
    )

    rows = (
        await db.execute(
            select(
                grouped.c.bulk_id,
                grouped.c.registration_id,
                grouped.c.subject,
                grouped.c.recipient_count,
                grouped.c.last_sent_at,
                Training.name.label("training_name"),
                ProgramYearTraining.start_date.label("placement_date"),
            )
            .select_from(grouped)
            .join(TrainingRegistration, TrainingRegistration.id == grouped.c.registration_id)
            .join(ProgramYearTraining, ProgramYearTraining.id == TrainingRegistration.placement_id)
            .join(Training, Training.id == ProgramYearTraining.training_id)
        )
    ).all()

    items = [
        TrainingBroadcastSummary(
            bulk_id=row.bulk_id,
            subject=row.subject or "",
            registration_id=row.registration_id,
            training_name=row.training_name,
            placement_date=row.placement_date.isoformat() if row.placement_date else None,
            recipient_count=row.recipient_count,
            last_sent_at=row.last_sent_at,
        )
        for row in rows
    ]
    return TrainingBroadcastSummaryListResponse(items=items, total=len(items))
