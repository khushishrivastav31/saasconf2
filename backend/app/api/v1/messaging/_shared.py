"""Shared helpers and constants for admin messaging endpoints."""

import logging
from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import (
    check_conference_admin_access,
)
from app.core.exceptions import AuthorizationError
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import MessageParticipant
from app.models.user import User
from app.schemas.messaging import (
    MessageAttachmentInfo,
    SenderInfo,
)

logger = logging.getLogger(__name__)

MODULE_CODE = "cfp"


async def _notify_participants(
    db,
    thread,
    sender_type: str,
    sender_id: UUID,
    conference_name: str,
    tenant_slug: str,
    conference_id: UUID,
    base_url: str = "http://localhost:3002",
) -> None:
    """Send email notifications to other participants if they have notifications enabled."""
    from app.core.email import send_new_message_notification

    # Get all participants except the sender
    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread.id,
            ~((MessageParticipant.participant_type == sender_type) & (MessageParticipant.participant_id == sender_id)),
        )
    )
    other_participants = result.scalars().all()

    for p in other_participants:
        # Check notification preference
        if p.participant_type == "applicant":
            applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == p.participant_id))
            applicant = applicant_result.scalar_one_or_none()
            if not applicant or not applicant.message_notifications_enabled:
                continue
            messages_link = f"{base_url}/{tenant_slug}/portal/messages/{thread.id}"
            try:
                await send_new_message_notification(
                    db,
                    email=applicant.email,
                    first_name=applicant.first_name,
                    conference_id=conference_id,
                    conference_name=conference_name,
                    message_subject=thread.subject,
                    messages_link=messages_link,
                )
            except Exception:
                logger.exception(f"Failed to send message notification to {applicant.email}")
        elif p.participant_type == "user":
            user_result = await db.execute(select(User).where(User.id == p.participant_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.message_notifications_enabled:
                continue
            messages_link = (
                f"http://localhost:3001/modules/conferences/{conference_id}?section=messaging&thread={thread.id}"
            )
            try:
                await send_new_message_notification(
                    db,
                    email=user.email,
                    first_name=user.first_name or "",
                    conference_id=conference_id,
                    conference_name=conference_name,
                    message_subject=thread.subject,
                    messages_link=messages_link,
                )
            except Exception:
                logger.exception(f"Failed to send message notification to {user.email}")


async def _check_messaging_access(db, current_user, conference_id: UUID) -> None:
    """Verify user has admin access to this conference."""
    if current_user.is_super_admin:
        return
    if current_user.is_tenant_admin:
        return
    has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
    if not has_access:
        raise AuthorizationError("Admin access to this conference required")


async def _resolve_senders(db, sender_pairs: set[tuple[str, UUID]]) -> dict[tuple[str, UUID], SenderInfo]:
    """Batch-resolve sender info from (type, id) pairs."""
    result_map: dict[tuple[str, UUID], SenderInfo] = {}
    user_ids = [pid for ptype, pid in sender_pairs if ptype == "user"]
    applicant_ids = [pid for ptype, pid in sender_pairs if ptype == "applicant"]

    if user_ids:
        result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for user in result.scalars():
            result_map[("user", user.id)] = SenderInfo(
                id=user.id,
                type="user",
                first_name=user.first_name or "",
                last_name=user.last_name or "",
                email=user.email,
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

    return result_map


def _strip_html(html: str, max_len: int = 120) -> str:
    """Strip HTML tags for preview text."""
    import re

    text = re.sub(r"<[^>]+>", "", html)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        return text[:max_len] + "..."
    return text


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


def _get_messaging_mode(conference: Conference) -> str:
    """Get the messaging mode for a conference.

    Returns "in_app" (default) or "email_only".
    """
    if conference.settings and isinstance(conference.settings, dict):
        return conference.settings.get("messaging_mode", "in_app")
    return "in_app"


async def _send_direct_emails(
    db,
    recipients: list,
    subject: str,
    body_html: str,
    conference_name: str,
    sender_name: str,
    reply_to: str | None = None,
) -> int:
    """Send direct email messages (for email-only mode).

    recipients: list of objects with .email and .first_name attributes
    reply_to: conference contact email used as reply-to address
    Returns count of emails sent.
    """
    from app.core.email import send_direct_message_email

    sent = 0
    for r in recipients:
        try:
            await send_direct_message_email(
                email=r.email,
                first_name=getattr(r, "first_name", ""),
                subject=subject,
                body_html=body_html,
                conference_name=conference_name,
                sender_name=sender_name,
                reply_to=reply_to,
            )
            sent += 1
        except Exception:
            logger.exception(f"Failed to send direct email to {r.email}")
    return sent


def substitute_template_variables(
    text: str,
    *,
    first_name: str = "",
    last_name: str = "",
    email: str = "",
    conference_name: str = "",
    paper_title: str = "",
    paper_list: str = "",
) -> str:
    """Replace template placeholder variables in text.

    Supported placeholders:
      [First Name], [Last Name], [Email],
      [Conference Name], [Paper Title], [Paper List]

    All values are HTML-escaped before substitution to prevent XSS,
    since this function runs after sanitize_html() has already cleaned
    the template body.
    """
    from html import escape as html_escape

    replacements = {
        "[First Name]": html_escape(first_name),
        "[Last Name]": html_escape(last_name),
        "[Email]": html_escape(email),
        "[Conference Name]": html_escape(conference_name),
        "[Paper Title]": html_escape(paper_title),
        "[Paper List]": html_escape(paper_list),
    }
    for placeholder, value in replacements.items():
        text = text.replace(placeholder, value)
    return text
