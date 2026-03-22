"""Portal messaging API endpoints for applicant communication."""

import logging
import re
import uuid as _uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, validate_upload
from app.core.html_sanitize import sanitize_html
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.attachment import AttachmentResponse
from app.schemas.messaging import (
    MessageAttachmentInfo,
    MessageResponse,
    ParticipantInfo,
    PortalCreateThread,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
    ThreadListItem,
    ThreadListResponse,
    UnreadCountResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


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
    conference_name: str,
    tenant_slug: str,
    conference_id: UUID,
) -> None:
    """Send email notifications to other participants."""
    from app.core.email import send_email_background, send_new_message_notification

    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread.id,
            ~((MessageParticipant.participant_type == sender_type) & (MessageParticipant.participant_id == sender_id)),
        )
    )
    for p in result.scalars():
        if p.participant_type == "user":
            user_result = await db.execute(select(User).where(User.id == p.participant_id))
            user = user_result.scalar_one_or_none()
            if not user or not user.message_notifications_enabled:
                continue
            settings = get_settings()
            link = (
                f"{settings.FRONTEND_BASE_URL}/modules/conferences/{conference_id}?section=messaging&thread={thread.id}"
            )
            send_email_background(
                send_new_message_notification,
                db,
                email=user.email,
                first_name=user.first_name or "",
                conference_id=conference_id,
                conference_name=conference_name,
                message_subject=thread.subject,
                messages_link=link,
            )
        elif p.participant_type == "applicant":
            app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == p.participant_id))
            applicant = app_result.scalar_one_or_none()
            if not applicant or not applicant.message_notifications_enabled:
                continue
            portal_base = settings.PORTAL_BASE_URL
            link = f"{portal_base}/{tenant_slug}/portal/messages/{thread.id}"
            send_email_background(
                send_new_message_notification,
                db,
                email=applicant.email,
                first_name=applicant.first_name,
                conference_id=conference_id,
                conference_name=conference_name,
                message_subject=thread.subject,
                messages_link=link,
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


@router.post("/portal/messages/upload", response_model=AttachmentResponse, status_code=201)
async def upload_portal_message_attachment(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
) -> AttachmentResponse:
    """Upload a file for a portal message (pre-upload before sending)."""
    tenant_id = current_applicant.tenant_id

    file_data = await file.read()
    file_size = len(file_data)

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise ValidationError(f"File size exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)")

    content_type = file.content_type or "application/octet-stream"
    verified_type = validate_upload(file_data, content_type, "message")
    safe_filename = sanitize_filename(file.filename or "unnamed")

    attachment = Attachment(
        tenant_id=tenant_id,
        entity_type="message",
        entity_id=_uuid.uuid4(),  # placeholder
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        uploaded_by=None,  # applicants are not in users table
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)

    return AttachmentResponse(
        id=attachment.id,
        tenant_id=attachment.tenant_id,
        entity_type=attachment.entity_type,
        entity_id=attachment.entity_id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        file_size=attachment.file_size,
        description=attachment.description,
        uploaded_by=attachment.uploaded_by,
        created_at=attachment.created_at,
        updated_at=attachment.updated_at,
    )


@router.get("/portal/messages/attachments/{attachment_id}/download")
async def download_portal_message_attachment(
    attachment_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> Response:
    """Download a message attachment (applicant must be participant of the thread)."""
    tenant_id = current_applicant.tenant_id
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "message",
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    # Verify the applicant is a participant in the thread that owns this message
    msg_result = await db.execute(
        select(Message).where(
            Message.id == attachment.entity_id,
            Message.tenant_id == tenant_id,
        )
    )
    message = msg_result.scalar_one_or_none()
    if not message:
        raise NotFoundError("Attachment not found")

    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == message.thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == current_applicant.applicant_id,
        )
    )
    if not p_result.scalar_one_or_none():
        raise NotFoundError("Attachment not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename),
            "Content-Length": str(attachment.file_size),
        },
    )


@router.get("/portal/messages", response_model=ThreadListResponse)
async def list_my_threads(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    conference_id: UUID | None = None,
    archived: bool = False,
) -> ThreadListResponse:
    """List applicant's message threads."""
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id

    # Find threads where applicant is a participant
    my_thread_ids_q = select(MessageParticipant.thread_id).where(
        MessageParticipant.participant_type == "applicant",
        MessageParticipant.participant_id == applicant_id,
    )

    query = (
        select(MessageThread)
        .where(
            MessageThread.tenant_id == tenant_id,
            MessageThread.id.in_(my_thread_ids_q),
        )
        .order_by(MessageThread.updated_at.desc())
    )

    # Filter by archived status
    if archived:
        query = query.where(MessageThread.archived_at.isnot(None))
    else:
        query = query.where(MessageThread.archived_at.is_(None))

    if conference_id:
        query = query.where(MessageThread.conference_id == conference_id)

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page
    threads = (await db.execute(query.offset((page - 1) * page_size).limit(page_size))).scalars().all()

    if not threads:
        return ThreadListResponse(items=[], total=total, page=page, page_size=page_size)

    thread_ids = [t.id for t in threads]

    # Last message per thread (exclude internal notes from portal)
    last_msg_subq = (
        select(
            Message.thread_id,
            func.max(Message.created_at).label("max_created"),
        )
        .where(
            Message.thread_id.in_(thread_ids),
            Message.is_internal_note.is_(False),
        )
        .group_by(Message.thread_id)
        .subquery()
    )
    last_msgs_result = await db.execute(
        select(Message).join(
            last_msg_subq,
            (Message.thread_id == last_msg_subq.c.thread_id) & (Message.created_at == last_msg_subq.c.max_created),
        )
    )
    last_msgs = {m.thread_id: m for m in last_msgs_result.scalars()}

    # Message counts (exclude internal notes)
    count_result = await db.execute(
        select(Message.thread_id, func.count(Message.id))
        .where(
            Message.thread_id.in_(thread_ids),
            Message.is_internal_note.is_(False),
        )
        .group_by(Message.thread_id)
    )
    msg_counts = dict(count_result.all())

    # My read status
    participant_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id.in_(thread_ids),
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == applicant_id,
        )
    )
    my_participants = {p.thread_id: p for p in participant_result.scalars()}

    # Fetch all participants for these threads (to find "other" participants)
    all_participants_result = await db.execute(
        select(MessageParticipant).where(MessageParticipant.thread_id.in_(thread_ids))
    )
    all_participants = list(all_participants_result.scalars().all())

    # Resolve senders + participant info
    sender_pairs = set()
    for msg in last_msgs.values():
        sender_pairs.add((msg.sender_type, msg.sender_id))
    for p in all_participants:
        sender_pairs.add((p.participant_type, p.participant_id))
    sender_map = await _resolve_senders(db, sender_pairs)

    # Group other participants per thread (only admins — the counterpart)
    other_participants_map: dict[UUID, list[SenderInfo]] = {}
    for p in all_participants:
        if p.participant_type != "user":
            continue
        info = sender_map.get((p.participant_type, p.participant_id))
        if info:
            other_participants_map.setdefault(p.thread_id, []).append(info)

    items = []
    for thread in threads:
        last_msg = last_msgs.get(thread.id)
        my_p = my_participants.get(thread.id)
        unread = False
        if last_msg and my_p:
            if my_p.last_read_at is None or my_p.last_read_at < last_msg.created_at:
                unread = True

        last_sender = (
            sender_map.get((last_msg.sender_type, last_msg.sender_id))
            if last_msg
            else SenderInfo(id=_uuid.UUID(int=0), type="user", first_name="", last_name="", email="")
        )

        items.append(
            ThreadListItem(
                id=thread.id,
                subject=thread.subject,
                last_message_at=last_msg.created_at if last_msg else thread.created_at,
                last_message_preview=_strip_html(last_msg.body_html) if last_msg else "",
                last_message_sender=last_sender,
                other_participants=other_participants_map.get(thread.id, []),
                unread=unread,
                message_count=msg_counts.get(thread.id, 0),
                created_at=thread.created_at,
                bulk_id=thread.bulk_id,
                archived_at=thread.archived_at,
            )
        )

    return ThreadListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/portal/messages/{thread_id}/archive")
async def archive_portal_thread(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Archive a thread for the applicant."""
    tenant_id = current_applicant.tenant_id

    result = await db.execute(
        select(MessageThread).where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    # Verify participation
    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == current_applicant.applicant_id,
        )
    )
    if not p_result.scalar_one_or_none():
        raise NotFoundError("Thread not found")

    thread.archived_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}


@router.post("/portal/messages/{thread_id}/unarchive")
async def unarchive_portal_thread(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Unarchive a thread for the applicant."""
    tenant_id = current_applicant.tenant_id

    result = await db.execute(
        select(MessageThread).where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == current_applicant.applicant_id,
        )
    )
    if not p_result.scalar_one_or_none():
        raise NotFoundError("Thread not found")

    thread.archived_at = None
    await db.commit()
    return {"ok": True}


@router.get("/portal/messages/unread-count", response_model=UnreadCountResponse)
async def get_portal_unread_count(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> UnreadCountResponse:
    """Get count of unread threads for current applicant."""
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id

    my_threads = (
        select(MessageParticipant.thread_id, MessageParticipant.last_read_at)
        .where(
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == applicant_id,
        )
        .subquery()
    )

    last_msg = (
        select(
            Message.thread_id,
            func.max(Message.created_at).label("last_at"),
        )
        .group_by(Message.thread_id)
        .subquery()
    )

    result = await db.execute(
        select(func.count())
        .select_from(my_threads)
        .join(
            MessageThread,
            (MessageThread.id == my_threads.c.thread_id) & (MessageThread.tenant_id == tenant_id),
        )
        .join(last_msg, last_msg.c.thread_id == my_threads.c.thread_id)
        .where((my_threads.c.last_read_at.is_(None)) | (last_msg.c.last_at > my_threads.c.last_read_at))
    )

    return UnreadCountResponse(unread_count=result.scalar() or 0)


@router.get("/portal/messages/{thread_id}", response_model=ThreadDetailResponse)
async def get_portal_thread(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> ThreadDetailResponse:
    """Get thread with all messages (applicant must be participant)."""
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id

    result = await db.execute(
        select(MessageThread)
        .options(
            selectinload(MessageThread.participants),
            selectinload(MessageThread.messages),
        )
        .where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    # Verify applicant is a participant
    is_participant = any(
        p.participant_type == "applicant" and p.participant_id == applicant_id for p in thread.participants
    )
    if not is_participant:
        raise NotFoundError("Thread not found")

    # Resolve info
    all_pairs = set()
    for p in thread.participants:
        all_pairs.add((p.participant_type, p.participant_id))
    for m in thread.messages:
        all_pairs.add((m.sender_type, m.sender_id))

    info_map = await _resolve_senders(db, all_pairs)

    participants = []
    for p in thread.participants:
        info = info_map.get((p.participant_type, p.participant_id))
        if info:
            participants.append(
                ParticipantInfo(
                    id=info.id,
                    type=info.type,
                    first_name=info.first_name,
                    last_name=info.last_name,
                    email=info.email,
                    last_read_at=p.last_read_at,
                )
            )

    # Filter out internal notes — portal should never see them
    visible_messages = [m for m in thread.messages if not m.is_internal_note]

    # Fetch attachments for visible messages only
    message_ids = [m.id for m in visible_messages]
    attachment_map = await _fetch_message_attachments(db, message_ids)

    messages = []
    for m in sorted(visible_messages, key=lambda x: x.created_at):
        sender = info_map.get((m.sender_type, m.sender_id))
        if sender:
            messages.append(
                MessageResponse(
                    id=m.id,
                    thread_id=m.thread_id,
                    sender=sender,
                    body_html=m.body_html,
                    attachments=attachment_map.get(m.id, []),
                    created_at=m.created_at,
                )
            )

    return ThreadDetailResponse(
        id=thread.id,
        subject=thread.subject,
        bulk_id=thread.bulk_id,
        archived_at=thread.archived_at,
        participants=participants,
        messages=messages,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.post("/portal/messages", response_model=ThreadDetailResponse, status_code=201)
async def create_portal_thread(
    data: PortalCreateThread,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> ThreadDetailResponse:
    """Applicant creates a new thread to conference admins."""
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id

    # Verify conference exists
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == data.conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = conf_result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Create thread
    thread = MessageThread(
        tenant_id=tenant_id,
        conference_id=data.conference_id,
        subject=data.subject,
    )
    db.add(thread)
    await db.flush()

    # Add applicant as participant
    now = datetime.now(UTC)
    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant_id,
            last_read_at=now,
        )
    )

    # Add all tenant admins as participants
    admin_result = await db.execute(
        select(User).where(
            User.tenant_id == tenant_id,
            User.role.in_(["tenant_admin"]),
            User.is_active == True,
        )
    )
    admins = admin_result.scalars().all()
    for admin in admins:
        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=admin.id,
            )
        )

    # Create initial message
    msg = Message(
        tenant_id=tenant_id,
        thread_id=thread.id,
        sender_type="applicant",
        sender_id=applicant_id,
        body_html=sanitize_html(data.body_html),
    )
    db.add(msg)
    await db.flush()

    # Link pre-uploaded attachments
    if data.attachment_ids:
        await _link_attachments_to_message(db, data.attachment_ids, msg.id, tenant_id)

    await db.commit()

    # Send email notifications to admins
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""
    await _notify_other_participants(
        db,
        thread,
        "applicant",
        applicant_id,
        conference.name,
        tenant_slug,
        data.conference_id,
    )

    return await get_portal_thread(thread.id, current_applicant, db)


@router.post(
    "/portal/messages/{thread_id}/reply",
    response_model=MessageResponse,
    status_code=201,
)
async def reply_to_portal_thread(
    thread_id: UUID,
    data: ReplyCreate,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> MessageResponse:
    """Applicant replies to a thread."""
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id

    # Verify thread and participation
    result = await db.execute(
        select(MessageThread).where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == applicant_id,
        )
    )
    participant = p_result.scalar_one_or_none()
    if not participant:
        raise NotFoundError("Thread not found")

    # Mark as read
    participant.last_read_at = datetime.now(UTC)

    # Create message
    message = Message(
        tenant_id=tenant_id,
        thread_id=thread_id,
        sender_type="applicant",
        sender_id=applicant_id,
        body_html=sanitize_html(data.body_html),
    )
    db.add(message)
    await db.flush()

    # Link pre-uploaded attachments
    if data.attachment_ids:
        await _link_attachments_to_message(db, data.attachment_ids, message.id, tenant_id)

    # Touch thread
    thread.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(message)

    # Send email notifications
    conf_result = await db.execute(select(Conference).where(Conference.id == thread.conference_id))
    conference = conf_result.scalar_one_or_none()
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""
    await _notify_other_participants(
        db,
        thread,
        "applicant",
        applicant_id,
        conference.name if conference else "",
        tenant_slug,
        thread.conference_id,
    )

    # Fetch attachments for this message
    attachment_map = await _fetch_message_attachments(db, [message.id])

    applicant = current_applicant.applicant
    return MessageResponse(
        id=message.id,
        thread_id=message.thread_id,
        sender=SenderInfo(
            id=applicant.id,
            type="applicant",
            first_name=applicant.first_name,
            last_name=applicant.last_name,
            email=applicant.email,
        ),
        body_html=message.body_html,
        attachments=attachment_map.get(message.id, []),
        created_at=message.created_at,
    )


@router.post("/portal/messages/{thread_id}/read")
async def mark_portal_thread_read(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Mark a thread as read for the current applicant."""
    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id == current_applicant.applicant_id,
        )
    )
    participant = result.scalar_one_or_none()
    if participant:
        participant.last_read_at = datetime.now(UTC)
        await db.commit()

    return {"ok": True}
