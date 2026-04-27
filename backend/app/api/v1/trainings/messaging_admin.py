"""Admin training-messaging list + lookup endpoints.

- ``GET /trainings/messaging/broadcasts`` — list past broadcasts grouped
  by ``bulk_id`` (powers the Messages tab table).
- ``GET /trainings/messaging/attendees`` — search training attendees by
  name/email so the Compose dialog can pick a recipient without
  forcing the admin to navigate to a training session first.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.messaging import THREAD_DOMAIN_TRAINING, MessageThread
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

router = APIRouter(prefix="/messaging", tags=["training-messaging"])


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


class AttendeeSearchHit(BaseModel):
    """A single match in the attendee-by-name/email search."""

    attendee_id: UUID  # TrainingRegistrationAttendee.id
    first_name: str
    last_name: str
    email: str
    registration_id: UUID
    placement_id: UUID
    training_name: str | None
    training_date: str | None


class AttendeeSearchResponse(BaseModel):
    items: list[AttendeeSearchHit]
    total: int


@router.get("/broadcasts", response_model=TrainingBroadcastSummaryListResponse)
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


@router.get("/attendees", response_model=AttendeeSearchResponse)
async def search_training_attendees(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    q: str = Query("", description="Substring search on first name, last name, or email."),
    limit: int = Query(20, ge=1, le=100),
) -> AttendeeSearchResponse:
    """Search training attendees by name or email.

    Returns matches across every registration on every placement the
    admin's tenant owns, joined with the training context so the picker
    can show "Alice Liddell · alice@example.com — ITIL Foundation, 2026-11-10".

    Matches are case-insensitive substring (``ILIKE %q%``). Empty ``q``
    returns the first ``limit`` rows ordered by name — useful for "show
    me a starting list" UX.
    """
    tenant_id = current_user.require_tenant_id()

    stmt = (
        select(
            TrainingRegistrationAttendee.id.label("attendee_id"),
            TrainingRegistrationAttendee.first_name,
            TrainingRegistrationAttendee.last_name,
            TrainingRegistrationAttendee.email,
            TrainingRegistration.id.label("registration_id"),
            ProgramYearTraining.id.label("placement_id"),
            Training.name.label("training_name"),
            ProgramYearTraining.start_date.label("training_date"),
        )
        .join(
            TrainingRegistration,
            TrainingRegistration.id == TrainingRegistrationAttendee.registration_id,
        )
        .join(ProgramYearTraining, ProgramYearTraining.id == TrainingRegistration.placement_id)
        .join(Training, Training.id == ProgramYearTraining.training_id)
        .where(TrainingRegistrationAttendee.tenant_id == tenant_id)
        .order_by(TrainingRegistrationAttendee.last_name, TrainingRegistrationAttendee.first_name)
        .limit(limit)
    )

    q_norm = q.strip()
    if q_norm:
        like = f"%{q_norm}%"
        stmt = stmt.where(
            or_(
                TrainingRegistrationAttendee.first_name.ilike(like),
                TrainingRegistrationAttendee.last_name.ilike(like),
                TrainingRegistrationAttendee.email.ilike(like),
            )
        )

    rows = (await db.execute(stmt)).all()
    items = [
        AttendeeSearchHit(
            attendee_id=row.attendee_id,
            first_name=row.first_name,
            last_name=row.last_name,
            email=row.email,
            registration_id=row.registration_id,
            placement_id=row.placement_id,
            training_name=row.training_name,
            training_date=row.training_date.isoformat() if row.training_date else None,
        )
        for row in rows
    ]
    return AttendeeSearchResponse(items=items, total=len(items))
