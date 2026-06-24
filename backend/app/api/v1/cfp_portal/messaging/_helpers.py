"""Shared helpers for the portal messaging endpoints.

Pulled out of the monolithic ``messaging.py`` so that the route modules
(``attachments``, ``threads_list``, ``threads_detail``) can each stay
under the project's 400-LOC file ceiling. Behavior is unchanged.
"""

import logging
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security.pii_crypto import hash_email, read_pii
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import MessageParticipant
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from app.schemas.messaging import MessageAttachmentInfo, SenderInfo
from app.services.training_messaging import PARTICIPANT_TYPE_TRAINING_ATTENDEE

logger = logging.getLogger(__name__)


async def _resolve_senders(db, sender_pairs: set[tuple[str, UUID]]) -> dict[tuple[str, UUID], SenderInfo]:
    """Batch-resolve sender info from (type, id) pairs.

    Handles all three participant identities the unified portal inbox
    surfaces: ``user`` (admin), ``applicant`` (CFP identity), and
    ``training_attendee`` (per-registration identity used by training
    broadcasts).
    """
    result_map: dict[tuple[str, UUID], SenderInfo] = {}
    user_ids = [pid for ptype, pid in sender_pairs if ptype == "user"]
    applicant_ids = [pid for ptype, pid in sender_pairs if ptype == "applicant"]
    attendee_ids = [pid for ptype, pid in sender_pairs if ptype == PARTICIPANT_TYPE_TRAINING_ATTENDEE]

    if user_ids:
        result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for user in result.scalars():
            result_map[("user", user.id)] = SenderInfo(
                id=user.id,
                type="user",
                first_name=user.first_name or "",
                last_name=user.last_name or "",
                email=read_pii(user, "email") or "",
            )

    if applicant_ids:
        result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
        for applicant in result.scalars():
            result_map[("applicant", applicant.id)] = SenderInfo(
                id=applicant.id,
                type="applicant",
                first_name=applicant.first_name,
                last_name=applicant.last_name,
                email=applicant.email,
            )

    if attendee_ids:
        result = await db.execute(
            select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.id.in_(attendee_ids))
        )
        for attendee in result.scalars():
            result_map[(PARTICIPANT_TYPE_TRAINING_ATTENDEE, attendee.id)] = SenderInfo(
                id=attendee.id,
                type=PARTICIPANT_TYPE_TRAINING_ATTENDEE,
                first_name=attendee.first_name,
                last_name=attendee.last_name,
                email=attendee.email,
            )

    return result_map


def _strip_html(html: str, max_len: int = 120) -> str:
    """Strip HTML tags for preview text."""
    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        return text[:max_len] + "..."
    return text


async def _notify_other_participants(
    db,
    thread,
    sender_type: str,
    sender_id: UUID,
    *,
    context_name: str,
    tenant_slug: str,
    domain: str,
    domain_anchor_id: UUID | None,
    tenant_id: UUID | None = None,
) -> None:
    """Send email notifications to other participants on the thread.

    Works for both conference and training threads. The admin link points
    to the right module based on ``domain``; the portal link is unified.
    For conference threads ``domain_anchor_id`` is the conference id (used
    by the email-enabled gate); for training threads it is the training
    id, used only for URL composition — the gate consults the tenant-wide
    ``training_email_settings`` instead.
    """
    from app.core.email import send_email_background, send_new_message_notification

    settings = get_settings()
    if domain == "training":
        admin_link = f"{settings.FRONTEND_BASE_URL}/modules/trainings?section=messages&thread={thread.id}"
    else:
        admin_link = (
            f"{settings.FRONTEND_BASE_URL}/modules/conferences/{domain_anchor_id}?tab=messaging&thread={thread.id}"
        )
    portal_link = f"{settings.PORTAL_BASE_URL}/{tenant_slug}/portal/messages?thread={thread.id}"

    conference_id_for_email = domain_anchor_id if domain == "conference" else None

    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread.id,
            ~((MessageParticipant.participant_type == sender_type) & (MessageParticipant.participant_id == sender_id)),
        )
    )
    found_user_participants = False
    for p in result.scalars():
        if p.participant_type == "user":
            if domain == "conference":
                # Conference threads: consolidate admin notifications to support_email below.
                found_user_participants = True
                continue
            user_result = await db.execute(select(User).where(User.id == p.participant_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.message_notifications_enabled:
                continue
            send_email_background(
                send_new_message_notification,
                db,
                email=read_pii(user, "email") or "",
                first_name=user.first_name or "",
                domain=domain,
                tenant_id=tenant_id,
                conference_id=conference_id_for_email,
                conference_name=context_name,
                message_subject=thread.subject,
                messages_link=admin_link,
            )
        elif p.participant_type == "applicant":
            app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == p.participant_id))
            applicant = app_result.scalar_one_or_none()
            if not applicant or not applicant.message_notifications_enabled:
                continue
            send_email_background(
                send_new_message_notification,
                db,
                email=applicant.email,
                first_name=applicant.first_name,
                domain=domain,
                tenant_id=tenant_id,
                conference_id=conference_id_for_email,
                conference_name=context_name,
                message_subject=thread.subject,
                messages_link=portal_link,
            )
        elif p.participant_type == PARTICIPANT_TYPE_TRAINING_ATTENDEE:
            att_result = await db.execute(
                select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.id == p.participant_id)
            )
            attendee = att_result.scalar_one_or_none()
            if not attendee:
                continue
            send_email_background(
                send_new_message_notification,
                db,
                email=attendee.email,
                first_name=attendee.first_name,
                domain=domain,
                tenant_id=tenant_id,
                conference_id=conference_id_for_email,
                conference_name=context_name,
                message_subject=thread.subject,
                messages_link=portal_link,
            )

    if found_user_participants and conference_id_for_email:
        conf_result = await db.execute(select(Conference).where(Conference.id == conference_id_for_email))
        conf = conf_result.scalar_one_or_none()
        support_addr = (conf.support_email or conf.contact_email) if conf else None
        if support_addr:
            send_email_background(
                send_new_message_notification,
                db,
                email=support_addr,
                first_name="",
                domain=domain,
                tenant_id=tenant_id,
                conference_id=conference_id_for_email,
                conference_name=context_name,
                message_subject=thread.subject,
                messages_link=admin_link,
            )


async def _fetch_message_attachments(db, message_ids: list[UUID]) -> dict[UUID, list[MessageAttachmentInfo]]:
    """Batch-fetch attachments for messages."""
    if not message_ids:
        return {}
    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == "message",
            Attachment.entity_id.in_(message_ids),
        )
    )
    attachment_map: dict[UUID, list[MessageAttachmentInfo]] = {}
    for a in result.scalars():
        attachment_map.setdefault(a.entity_id, []).append(
            MessageAttachmentInfo(
                id=a.id,
                filename=a.filename,
                content_type=a.content_type,
                file_size=a.file_size,
            )
        )
    return attachment_map


async def _link_attachments_to_message(db, attachment_ids: list[UUID], message_id: UUID, tenant_id: UUID) -> None:
    """Update pre-uploaded attachments to point to the real message."""
    if not attachment_ids:
        return
    result = await db.execute(
        select(Attachment).where(
            Attachment.id.in_(attachment_ids),
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "message",
        )
    )
    for a in result.scalars():
        a.entity_id = message_id


async def _resolve_my_participant_keys(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    applicant_id: UUID,
    applicant_email: str,
) -> list[tuple[str, UUID]]:
    """Return every (participant_type, participant_id) pair that represents *me*.

    The portal user logs in as a ``CFPApplicant`` (legacy) but in PR 3 the
    same person can also be a ``TrainingRegistrationAttendee`` if they
    booked a training. The unified inbox shows both threads, so we have
    to enumerate every shape the user appears under in
    ``message_participants``.

    The applicant key is the obvious one. Training-attendee keys come from
    the ``training_registration_attendees`` rows where ``email_hash``
    matches the applicant's email — same identity rule the seed uses to
    link the two sides.
    """
    keys: list[tuple[str, UUID]] = [("applicant", applicant_id)]

    if not applicant_email:
        return keys

    email_h = hash_email(applicant_email)
    rows = await db.execute(
        select(TrainingRegistrationAttendee.id).where(
            TrainingRegistrationAttendee.tenant_id == tenant_id,
            TrainingRegistrationAttendee.email_hash == email_h,
        )
    )
    for (attendee_id,) in rows.all():
        keys.append((PARTICIPANT_TYPE_TRAINING_ATTENDEE, attendee_id))
    return keys


async def _resolve_domain_entity_names(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    domain_pairs: set[tuple[str, UUID]],
) -> dict[tuple[str, UUID], str]:
    """Batch-resolve a display label for each ``(domain, entity_id)`` pair.

    Used by the unified portal inbox to render a chip / context label for
    each thread without a per-thread roundtrip. Conference threads use
    ``Conference.name``; training threads join through
    ``TrainingRegistration → ProgramYearTraining → Training`` to surface
    the training's name. Pairs that don't resolve get omitted — the FE
    falls back to "Unknown" rendering.
    """
    name_map: dict[tuple[str, UUID], str] = {}

    conference_ids = [eid for d, eid in domain_pairs if d == "conference"]
    training_reg_ids = [eid for d, eid in domain_pairs if d == "training"]

    if conference_ids:
        # Late import to keep this helper from pulling Conference into modules
        # that don't otherwise need it.
        from app.models.conference import Conference

        rows = await db.execute(
            select(Conference.id, Conference.name).where(
                Conference.id.in_(conference_ids),
                Conference.tenant_id == tenant_id,
            )
        )
        for cid, cname in rows.all():
            name_map[("conference", cid)] = cname or ""

    if training_reg_ids:
        rows = await db.execute(
            select(TrainingRegistration.id, Training.name)
            .join(ProgramYearTraining, ProgramYearTraining.id == TrainingRegistration.placement_id)
            .join(Training, Training.id == ProgramYearTraining.training_id)
            .where(
                TrainingRegistration.id.in_(training_reg_ids),
                TrainingRegistration.tenant_id == tenant_id,
            )
        )
        for rid, tname in rows.all():
            name_map[("training", rid)] = tname or ""

    return name_map
