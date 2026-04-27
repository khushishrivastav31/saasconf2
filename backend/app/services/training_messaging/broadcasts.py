"""Training broadcast surfaces: registration-level + placement-level.

Both surfaces share the same fan-out (one ``MessageThread`` per attendee,
all sharing a ``bulk_id``). They differ only in which set of attendees
they collect:

  - ``broadcast_to_registration_attendees`` — one registration's
    attendees. Wired to the "Message attendees" button on
    ``RegistrationRow``.
  - ``broadcast_to_placement_attendees`` — every attendee across every
    registration on a single training session. Wired to the Compose
    button on the admin Messages tab.

Each thread anchors on the attendee's *own* registration via
``domain='training'`` + ``domain_entity_id=<registration.id>`` so the
recipient's portal still sees one thread per registration even if it
came from a placement-wide send.
"""

import uuid
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.html_sanitize import sanitize_html
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

from ._core import (
    _AnchoredAttendee,
    _dispatch_broadcast_emails,
    _emit_threads_for_attendees,
    _filter_and_dedupe_attendees,
    _load_registration_with_context,
    _PreparedRecipient,
)


async def broadcast_to_registration_attendees(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    registration_id: UUID,
    sender_user_id: UUID,
    subject_template: str,
    body_html_template: str,
    screen_overlay_id: UUID | None = None,
) -> tuple[UUID, list[_PreparedRecipient], int]:
    """Send a broadcast to every attendee on a single training registration.

    Returns ``(bulk_id, prepared_recipients, skipped_count)``. The caller
    is responsible for ``commit`` and for shaping the response.
    """
    registration, training_name, placement_date = await _load_registration_with_context(db, tenant_id, registration_id)
    company_name = registration.company_name or ""

    anchored = [
        _AnchoredAttendee(attendee=a, registration_id=registration.id, company_name=company_name)
        for a in registration.attendees
    ]
    eligible, skipped = _filter_and_dedupe_attendees(anchored)

    bulk_id = uuid.uuid4()
    if not eligible:
        return bulk_id, [], skipped

    sanitized_body = sanitize_html(body_html_template)
    prepared = _emit_threads_for_attendees(
        db,
        tenant_id=tenant_id,
        sender_user_id=sender_user_id,
        bulk_id=bulk_id,
        eligible=eligible,
        subject_template=subject_template,
        sanitized_body_template=sanitized_body,
        training_name=training_name,
        placement_date=placement_date,
        screen_overlay_id=screen_overlay_id,
    )

    await db.flush()

    await _dispatch_broadcast_emails(
        db,
        tenant_id=tenant_id,
        sender_user_id=sender_user_id,
        training_name=training_name,
        prepared=prepared,
    )

    return bulk_id, prepared, skipped


async def broadcast_to_placement_attendees(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    placement_id: UUID,
    sender_user_id: UUID,
    subject_template: str,
    body_html_template: str,
    screen_overlay_id: UUID | None = None,
) -> tuple[UUID, list[_PreparedRecipient], int]:
    """Send a broadcast to every attendee across every registration on a placement.

    Use case: admin wants to message all confirmed attendees of one
    training session in one go even though those attendees are split
    across multiple booking registrations.

    Threads still anchor on each attendee's *own* registration — the
    placement-level fan-out is just a convenient audience, not a new
    domain. ``bulk_id`` is shared so the admin Messages tab groups them.

    Returns ``(bulk_id, prepared_recipients, skipped_count)``. Caller
    commits.
    """
    from app.core.exceptions import NotFoundError

    placement_stmt = (
        select(ProgramYearTraining, Training)
        .join(Training, Training.id == ProgramYearTraining.training_id)
        .where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.tenant_id == tenant_id,
        )
    )
    placement_row = (await db.execute(placement_stmt)).first()
    if placement_row is None:
        raise NotFoundError(f"Placement {placement_id} not found")
    placement, training = placement_row
    training_name = training.name or ""
    placement_date = placement.start_date.isoformat() if placement.start_date else ""

    regs_stmt = (
        select(TrainingRegistration)
        .where(
            TrainingRegistration.tenant_id == tenant_id,
            TrainingRegistration.placement_id == placement_id,
        )
        .options(joinedload(TrainingRegistration.attendees))
    )
    registrations = (await db.execute(regs_stmt)).unique().scalars().all()

    anchored: list[_AnchoredAttendee] = []
    for reg in registrations:
        company_name = reg.company_name or ""
        for a in reg.attendees:
            anchored.append(_AnchoredAttendee(attendee=a, registration_id=reg.id, company_name=company_name))
    eligible, skipped = _filter_and_dedupe_attendees(anchored)

    bulk_id = uuid.uuid4()
    if not eligible:
        return bulk_id, [], skipped

    sanitized_body = sanitize_html(body_html_template)
    prepared = _emit_threads_for_attendees(
        db,
        tenant_id=tenant_id,
        sender_user_id=sender_user_id,
        bulk_id=bulk_id,
        eligible=eligible,
        subject_template=subject_template,
        sanitized_body_template=sanitized_body,
        training_name=training_name,
        placement_date=placement_date,
        screen_overlay_id=screen_overlay_id,
    )

    await db.flush()

    await _dispatch_broadcast_emails(
        db,
        tenant_id=tenant_id,
        sender_user_id=sender_user_id,
        training_name=training_name,
        prepared=prepared,
    )

    return bulk_id, prepared, skipped
