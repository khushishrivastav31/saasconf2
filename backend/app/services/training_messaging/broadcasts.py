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
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

from ._core import (
    _AnchoredAttendee,
    _dispatch_broadcast_emails,
    _duplicate_attachments_per_message,
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
    attachment_ids: list[UUID] | None = None,
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
    has_attachments = bool(attachment_ids)
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
        has_attachments=has_attachments,
    )

    if attachment_ids:
        await _duplicate_attachments_per_message(
            db,
            tenant_id=tenant_id,
            source_attachment_ids=attachment_ids,
            target_message_ids=[r.message_id for r in prepared],
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
    attendee_ids: list[UUID] | None = None,
    attachment_ids: list[UUID] | None = None,
) -> tuple[UUID, list[_PreparedRecipient], int]:
    """Send a broadcast to attendees across registrations on a placement.

    Use case: admin wants to message all confirmed attendees of one
    training session in one go even though those attendees are split
    across multiple booking registrations.

    ``attendee_ids`` narrows the audience: omit (or pass ``None``/empty
    list) to message every attendee on the placement; supply specific
    ``TrainingRegistrationAttendee`` ids to message just those. Ids
    that don't belong to a registration on this placement are silently
    dropped — they don't surface as 404s because the admin shouldn't
    have to think about cross-placement bookkeeping.

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

    # When the caller pinned specific attendees, narrow the candidate
    # pool to exactly those rows. Empty list = explicit "none" — caller
    # gets back a no-op broadcast, not the whole placement.
    explicit_ids: set[UUID] | None = None
    if attendee_ids is not None:
        explicit_ids = set(attendee_ids)

    anchored: list[_AnchoredAttendee] = []
    for reg in registrations:
        company_name = reg.company_name or ""
        for a in reg.attendees:
            if explicit_ids is not None and a.id not in explicit_ids:
                continue
            anchored.append(_AnchoredAttendee(attendee=a, registration_id=reg.id, company_name=company_name))
    eligible, skipped = _filter_and_dedupe_attendees(anchored)

    bulk_id = uuid.uuid4()
    if not eligible:
        return bulk_id, [], skipped

    sanitized_body = sanitize_html(body_html_template)
    has_attachments = bool(attachment_ids)
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
        has_attachments=has_attachments,
    )

    if attachment_ids:
        await _duplicate_attachments_per_message(
            db,
            tenant_id=tenant_id,
            source_attachment_ids=attachment_ids,
            target_message_ids=[r.message_id for r in prepared],
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


# --- Cross-placement send (search-attendee flow) ---


async def broadcast_to_attendees_by_id(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    sender_user_id: UUID,
    attendee_ids: list[UUID],
    subject_template: str,
    body_html_template: str,
    screen_overlay_id: UUID | None = None,
    attachment_ids: list[UUID] | None = None,
) -> tuple[UUID, list[_PreparedRecipient], int]:
    """Send a broadcast to a list of attendees regardless of placement.

    Use case: the admin found recipients via name/email search in the
    Compose dialog and may have picked attendees who sit on different
    training sessions. We group them by placement internally so each
    thread substitutes the right ``[Training Name]`` / ``[Placement Date]``,
    but the admin sees a single send in the Messages tab — one
    ``bulk_id`` covers them all.

    Returns ``(bulk_id, prepared_recipients, skipped_count)``. Caller
    commits. Empty ``attendee_ids`` returns a no-op (zero recipients).
    Ids that don't belong to this tenant are silently dropped — same
    rule as the placement broadcast.
    """
    bulk_id = uuid.uuid4()
    if not attendee_ids:
        return bulk_id, [], 0

    rows = (
        await db.execute(
            select(
                TrainingRegistrationAttendee,
                TrainingRegistration,
                ProgramYearTraining,
                Training,
            )
            .join(
                TrainingRegistration,
                TrainingRegistration.id == TrainingRegistrationAttendee.registration_id,
            )
            .join(ProgramYearTraining, ProgramYearTraining.id == TrainingRegistration.placement_id)
            .join(Training, Training.id == ProgramYearTraining.training_id)
            .where(
                TrainingRegistrationAttendee.tenant_id == tenant_id,
                TrainingRegistrationAttendee.id.in_(attendee_ids),
            )
        )
    ).all()

    sanitized_body = sanitize_html(body_html_template)
    prepared: list[_PreparedRecipient] = []
    total_skipped = 0
    by_placement: dict[UUID, list[tuple[TrainingRegistrationAttendee, TrainingRegistration]]] = {}
    placement_meta: dict[UUID, tuple[str, str]] = {}
    for attendee, reg, placement, training in rows:
        by_placement.setdefault(placement.id, []).append((attendee, reg))
        placement_meta[placement.id] = (
            training.name or "",
            placement.start_date.isoformat() if placement.start_date else "",
        )

    has_attachments = bool(attachment_ids)
    for placement_id, pairs in by_placement.items():
        training_name, placement_date = placement_meta[placement_id]
        anchored = [
            _AnchoredAttendee(attendee=a, registration_id=r.id, company_name=r.company_name or "") for a, r in pairs
        ]
        eligible, skipped = _filter_and_dedupe_attendees(anchored)
        total_skipped += skipped
        if not eligible:
            continue
        prepared.extend(
            _emit_threads_for_attendees(
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
                has_attachments=has_attachments,
            )
        )

    if attachment_ids and prepared:
        await _duplicate_attachments_per_message(
            db,
            tenant_id=tenant_id,
            source_attachment_ids=attachment_ids,
            target_message_ids=[r.message_id for r in prepared],
        )

    await db.flush()

    if prepared:
        await _dispatch_broadcast_emails(
            db,
            tenant_id=tenant_id,
            sender_user_id=sender_user_id,
            training_name="",
            prepared=prepared,
        )

    return bulk_id, prepared, total_skipped
