"""Training-broadcast core: shared helpers used by every broadcast surface.

Holds:
  - The participant-type constant.
  - ``substitute_training_variables`` placeholder rendering.
  - ``_AnchoredAttendee`` + dedup helper.
  - ``_emit_threads_for_attendees`` and ``_dispatch_broadcast_emails`` —
    the actual thread/message/email writers.
  - ``_load_registration_with_context`` (used by the registration-level
    broadcast).

Kept private (leading underscore on all but the constant + the public
``substitute_training_variables`` helper). Both broadcast surfaces
(``broadcasts.py`` in this package) call these helpers — same dedup
rule, same thread-creation logic, same email-fanout shape.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from html import escape as html_escape
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

# Re-exported at the package level so tests can patch it via the canonical
# ``app.services.training_messaging.send_direct_message_email`` path.
from app.core.email import send_direct_message_email
from app.core.security.pii_crypto import read_pii
from app.models.attachment import Attachment
from app.models.messaging import (
    THREAD_DOMAIN_TRAINING,
    Message,
    MessageParticipant,
    MessageThread,
)
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User

logger = logging.getLogger(__name__)

PARTICIPANT_TYPE_TRAINING_ATTENDEE = "training_attendee"


@dataclass
class _PreparedRecipient:
    """A single resolved attendee ready to receive the broadcast."""

    attendee_id: UUID
    email: str
    first_name: str
    last_name: str
    subject: str
    body_html: str
    thread_id: UUID
    message_id: UUID  # set client-side so attachment-linking can run before flush


@dataclass
class _AnchoredAttendee:
    """An attendee plus the registration it belongs to + the company name on
    that registration. Bundled together so the placement-level broadcast
    can fan out across registrations with each thread anchored on the
    right one.
    """

    attendee: TrainingRegistrationAttendee
    registration_id: UUID
    company_name: str


def substitute_training_variables(
    text: str,
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    training_name: str = "",
    placement_date: str = "",
    company_name: str = "",
) -> str:
    """Replace training-broadcast placeholders.

    Supported placeholders (all values HTML-escaped to prevent XSS — caller
    is expected to have already run ``sanitize_html`` on the template body):

      [First Name], [Last Name], [Email],
      [Training Name], [Placement Date], [Company Name]
    """
    replacements = {
        "[First Name]": html_escape(first_name),
        "[Last Name]": html_escape(last_name),
        "[Email]": html_escape(email),
        "[Training Name]": html_escape(training_name),
        "[Placement Date]": html_escape(placement_date),
        "[Company Name]": html_escape(company_name),
    }
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, value)
    return text


async def _load_registration_with_context(
    db: AsyncSession,
    tenant_id: UUID,
    registration_id: UUID,
) -> tuple[TrainingRegistration, str, str]:
    """Load the registration + its training name + placement date string.

    Returns a tuple of (registration, training_name, placement_date_str).
    Raises if the registration is missing or belongs to another tenant.
    """
    stmt = (
        select(TrainingRegistration)
        .where(
            TrainingRegistration.id == registration_id,
            TrainingRegistration.tenant_id == tenant_id,
        )
        .options(joinedload(TrainingRegistration.attendees))
    )
    result = await db.execute(stmt)
    registration = result.unique().scalar_one_or_none()
    if registration is None:
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Training registration {registration_id} not found")

    placement_stmt = (
        select(ProgramYearTraining, Training)
        .join(Training, Training.id == ProgramYearTraining.training_id)
        .where(ProgramYearTraining.id == registration.placement_id)
    )
    placement_row = (await db.execute(placement_stmt)).first()
    if placement_row is None:
        # Placement got deleted under us; broadcast is meaningless without one.
        from app.core.exceptions import NotFoundError

        raise NotFoundError(f"Placement {registration.placement_id} not found")

    placement, training = placement_row
    training_name = training.name or ""
    placement_date = placement.start_date.isoformat() if placement.start_date else ""
    return registration, training_name, placement_date


def _filter_and_dedupe_attendees(
    anchored: list[_AnchoredAttendee],
) -> tuple[list[_AnchoredAttendee], int]:
    """Drop empty-email rows and deduplicate by lowercased email.

    Returns ``(eligible, skipped_count)``. Used by both the
    registration-level and placement-level broadcasts so the dedup rule
    stays identical across surfaces.
    """
    seen: set[str] = set()
    eligible: list[_AnchoredAttendee] = []
    skipped = 0
    for entry in anchored:
        email_norm = (entry.attendee.email or "").strip().lower()
        if not email_norm:
            skipped += 1
            continue
        if email_norm in seen:
            skipped += 1
            continue
        seen.add(email_norm)
        eligible.append(entry)
    return eligible, skipped


def _emit_threads_for_attendees(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    sender_user_id: UUID,
    bulk_id: UUID,
    eligible: list[_AnchoredAttendee],
    subject_template: str,
    sanitized_body_template: str,
    training_name: str,
    placement_date: str,
    screen_overlay_id: UUID | None,
    has_attachments: bool = False,
) -> list[_PreparedRecipient]:
    """Add one ``MessageThread`` per attendee with the substituted content.

    Each thread is anchored on the attendee's *own* registration (so a
    placement-level broadcast still produces threads pinned to the right
    registration in the recipient's portal). All threads in this batch
    share ``bulk_id`` so the admin Messages tab groups them.

    ``has_attachments`` flags the resulting ``MessageThread`` so the
    portal inbox can render the attachment indicator without an extra
    query. Callers that pass attachment ids should pass ``True`` here
    AND call ``_duplicate_attachments_per_message`` after the flush.
    """
    now = datetime.now(UTC)
    prepared: list[_PreparedRecipient] = []
    for entry in eligible:
        attendee = entry.attendee
        subj = substitute_training_variables(
            subject_template,
            first_name=attendee.first_name or "",
            last_name=attendee.last_name or "",
            email=attendee.email or "",
            training_name=training_name,
            placement_date=placement_date,
            company_name=entry.company_name,
        )
        body = substitute_training_variables(
            sanitized_body_template,
            first_name=attendee.first_name or "",
            last_name=attendee.last_name or "",
            email=attendee.email or "",
            training_name=training_name,
            placement_date=placement_date,
            company_name=entry.company_name,
        )

        thread_id = uuid.uuid4()
        message_id = uuid.uuid4()
        # Training-domain thread: conference_id stays NULL, the generic
        # anchor points at the registration the attendee belongs to.
        db.add(
            MessageThread(
                id=thread_id,
                tenant_id=tenant_id,
                conference_id=None,
                domain=THREAD_DOMAIN_TRAINING,
                domain_entity_id=entry.registration_id,
                subject=subj,
                bulk_id=bulk_id,
                screen_overlay_id=screen_overlay_id,
                has_attachments=has_attachments,
            )
        )
        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread_id,
                participant_type="user",
                participant_id=sender_user_id,
                last_read_at=now,
            )
        )
        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread_id,
                participant_type=PARTICIPANT_TYPE_TRAINING_ATTENDEE,
                participant_id=attendee.id,
            )
        )
        db.add(
            Message(
                id=message_id,
                tenant_id=tenant_id,
                thread_id=thread_id,
                sender_type="user",
                sender_id=sender_user_id,
                body_html=body,
            )
        )

        prepared.append(
            _PreparedRecipient(
                attendee_id=attendee.id,
                email=attendee.email,
                first_name=attendee.first_name or "",
                last_name=attendee.last_name or "",
                subject=subj,
                body_html=body,
                thread_id=thread_id,
                message_id=message_id,
            )
        )
    return prepared


async def _duplicate_attachments_per_message(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    source_attachment_ids: list[UUID],
    target_message_ids: list[UUID],
) -> None:
    """For each source attachment + each target message, create a fresh
    ``Attachment`` row pointing at the message.

    The source row is left in place (entity_id is the placeholder set by
    the upload endpoint). Realistically those become orphans after the
    broadcast; a periodic cleanup job will reap them. We trade a little
    storage for not having to invent a many-to-many junction table — the
    existing 1-attachment-per-message contract on ``Attachment`` model
    stays intact.

    No-op when either list is empty.
    """
    if not source_attachment_ids or not target_message_ids:
        return
    sources = (
        (
            await db.execute(
                select(Attachment).where(
                    Attachment.id.in_(source_attachment_ids),
                    Attachment.tenant_id == tenant_id,
                    Attachment.entity_type == "message",
                )
            )
        )
        .scalars()
        .all()
    )
    for src in sources:
        for msg_id in target_message_ids:
            db.add(
                Attachment(
                    tenant_id=tenant_id,
                    entity_type="message",
                    entity_id=msg_id,
                    filename=src.filename,
                    content_type=src.content_type,
                    file_size=src.file_size,
                    file_data=src.file_data,
                    description=src.description,
                    uploaded_by=src.uploaded_by,
                )
            )


async def _dispatch_broadcast_emails(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    sender_user_id: UUID,
    training_name: str,
    prepared: list[_PreparedRecipient],
) -> None:
    """Fan out the per-recipient emails.

    Uses ``send_direct_message_email`` (email-only path) since training
    threads have no ``conference_id`` and the existing notification helper
    is conference-bound. The ``conference_name`` slot in that helper is a
    free-form context label — we pass the training name there. One email
    failure must not poison the batch (tests exercise this).
    """
    user_result = await db.execute(select(User).where(User.id == sender_user_id))
    sender_user = user_result.scalar_one_or_none()
    sender_name = ""
    if sender_user is not None:
        sender_name = f"{sender_user.first_name or ''} {sender_user.last_name or ''}".strip() or (
            read_pii(sender_user, "email") or ""
        )

    for r in prepared:
        try:
            await send_direct_message_email(
                db,
                email=r.email,
                first_name=r.first_name,
                subject=r.subject,
                body_html=r.body_html,
                conference_name=training_name,
                conference_id=None,
                tenant_id=tenant_id,
                sender_name=sender_name,
            )
        except Exception:
            logger.exception("Training broadcast: failed to send to %s", r.email)
