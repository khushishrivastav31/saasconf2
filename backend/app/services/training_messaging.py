"""Training-broadcast service: anchor a thread per attendee on a registration.

Mirrors the conference bulk-send shape (see ``app/api/v1/messaging/bulk.py``):
one ``MessageThread`` per recipient, all sharing a ``bulk_id``, so each
attendee gets their own 1:1 reply thread but the admin can view the whole
broadcast as a group.

Key differences from the conference path:
  - Anchor is ``domain='training'`` + ``domain_entity_id=<registration.id>``
    (not ``conference_id``, which stays NULL for training threads — see
    migration 214).
  - Recipients come from ``TrainingRegistrationAttendee`` rows, not
    ``CFPApplicant``. ``participant_type='training_attendee'`` with
    ``participant_id=<TrainingRegistrationAttendee.id>``.
  - Variable substitution exposes training-specific placeholders
    (``[Training Name]``, ``[Placement Date]``, ``[Company Name]``).
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

from app.core.email import send_direct_message_email
from app.core.html_sanitize import sanitize_html
from app.core.security.pii_crypto import read_pii
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

    Mirrors the shape of ``substitute_template_variables`` in
    ``app/api/v1/messaging/_shared.py`` so behavior stays consistent across
    domains. Kept as a separate function so the conference helper can stay
    in its existing file (which is over the project's split threshold).
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

    Creates one ``MessageThread`` per attendee (anchored on the registration
    via ``domain='training'`` + ``domain_entity_id=registration_id``), with
    the admin and the attendee as participants, plus the initial ``Message``.
    Then dispatches the per-recipient email with substituted variables.

    Returns ``(bulk_id, prepared_recipients, skipped_count)``. The caller
    is responsible for ``commit`` and for shaping the response.
    """
    registration, training_name, placement_date = await _load_registration_with_context(db, tenant_id, registration_id)

    # Filter to attendees with non-empty email; deduplicate by lowercased email
    # so a registration that lists the same email twice still gets one thread.
    seen_emails: set[str] = set()
    eligible: list[TrainingRegistrationAttendee] = []
    skipped = 0
    for a in registration.attendees:
        email_norm = (a.email or "").strip().lower()
        if not email_norm:
            skipped += 1
            continue
        if email_norm in seen_emails:
            skipped += 1
            continue
        seen_emails.add(email_norm)
        eligible.append(a)

    if not eligible:
        return uuid.uuid4(), [], skipped

    sanitized_body = sanitize_html(body_html_template)
    bulk_id = uuid.uuid4()
    now = datetime.now(UTC)
    company_name = registration.company_name or ""

    prepared: list[_PreparedRecipient] = []
    for attendee in eligible:
        subj = substitute_training_variables(
            subject_template,
            first_name=attendee.first_name or "",
            last_name=attendee.last_name or "",
            email=attendee.email or "",
            training_name=training_name,
            placement_date=placement_date,
            company_name=company_name,
        )
        body = substitute_training_variables(
            sanitized_body,
            first_name=attendee.first_name or "",
            last_name=attendee.last_name or "",
            email=attendee.email or "",
            training_name=training_name,
            placement_date=placement_date,
            company_name=company_name,
        )

        thread_id = uuid.uuid4()
        # Training-domain thread: conference_id stays NULL, the generic
        # anchor points at the registration. The before_insert listener
        # only mirrors conference_id for the conference domain, so we need
        # to set domain + domain_entity_id explicitly here.
        db.add(
            MessageThread(
                id=thread_id,
                tenant_id=tenant_id,
                conference_id=None,
                domain=THREAD_DOMAIN_TRAINING,
                domain_entity_id=registration_id,
                subject=subj,
                bulk_id=bulk_id,
                screen_overlay_id=screen_overlay_id,
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
            )
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
