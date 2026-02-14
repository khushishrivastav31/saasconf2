"""Admin messaging thread endpoints."""

import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
    require_module,
)
from app.core.html_sanitize import sanitize_html
from app.core.exceptions import NotFoundError
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.user import User
from app.schemas.messaging import (
    AdminCreateThread,
    CreateThreadResponse,
    MessageAttachmentInfo,
    MessageResponse,
    ParticipantInfo,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
    ThreadListItem,
    ThreadListResponse,
)

from ._shared import (
    MODULE_CODE,
    _check_messaging_access,
    _fetch_message_attachments,
    _get_conference_for_tenant,
    _link_attachments_to_message,
    _notify_participants,
    _resolve_senders,
    _strip_html,
)

router = APIRouter()


@router.get(
    "/threads",
    response_model=ThreadListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_threads(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    bulk_id: UUID | None = None,
) -> ThreadListResponse:
    """List message threads for this conference."""
    tenant_id = current_user.tenant_id
    await _get_conference_for_tenant(db, conference_id, tenant_id)

    # Base query
    query = (
        select(MessageThread)
        .where(
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
        )
        .order_by(MessageThread.updated_at.desc())
    )

    if search:
        query = query.where(MessageThread.subject.ilike(f"%{search}%"))
    if bulk_id:
        query = query.where(MessageThread.bulk_id == bulk_id)

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page
    threads = (
        await db.execute(
            query.offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()

    if not threads:
        return ThreadListResponse(items=[], total=total, page=page, page_size=page_size)

    thread_ids = [t.id for t in threads]

    # Fetch last message per thread
    last_msg_subq = (
        select(
            Message.thread_id,
            func.max(Message.created_at).label("max_created"),
        )
        .where(Message.thread_id.in_(thread_ids))
        .group_by(Message.thread_id)
        .subquery()
    )
    last_msgs_result = await db.execute(
        select(Message).join(
            last_msg_subq,
            (Message.thread_id == last_msg_subq.c.thread_id)
            & (Message.created_at == last_msg_subq.c.max_created),
        )
    )
    last_msgs = {m.thread_id: m for m in last_msgs_result.scalars()}

    # Message counts
    count_result = await db.execute(
        select(Message.thread_id, func.count(Message.id))
        .where(Message.thread_id.in_(thread_ids))
        .group_by(Message.thread_id)
    )
    msg_counts = dict(count_result.all())

    # Current user's participant read status
    participant_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id.in_(thread_ids),
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
    )
    my_participants = {p.thread_id: p for p in participant_result.scalars()}

    # Fetch all participants for these threads (to find "other" participants)
    all_participants_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id.in_(thread_ids)
        )
    )
    all_participants = list(all_participants_result.scalars().all())

    # Resolve senders + participant info
    sender_pairs = set()
    for msg in last_msgs.values():
        sender_pairs.add((msg.sender_type, msg.sender_id))
    for p in all_participants:
        sender_pairs.add((p.participant_type, p.participant_id))
    sender_map = await _resolve_senders(db, sender_pairs)

    # Group other participants per thread (only applicants — the counterpart)
    other_participants_map: dict[UUID, list[SenderInfo]] = {}
    for p in all_participants:
        if p.participant_type != "applicant":
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

        last_sender = sender_map.get(
            (last_msg.sender_type, last_msg.sender_id)
        ) if last_msg else SenderInfo(
            id=uuid.UUID(int=0), type="user", first_name="", last_name="", email=""
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
            )
        )

    return ThreadListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/threads/{thread_id}",
    response_model=ThreadDetailResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_thread(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ThreadDetailResponse:
    """Get thread with all messages."""
    tenant_id = current_user.tenant_id
    await _get_conference_for_tenant(db, conference_id, tenant_id)

    result = await db.execute(
        select(MessageThread)
        .options(
            selectinload(MessageThread.participants),
            selectinload(MessageThread.messages),
        )
        .where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    # Resolve participant and sender info
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

    # Fetch attachments for all messages
    message_ids = [m.id for m in thread.messages]
    attachment_map = await _fetch_message_attachments(db, message_ids)

    messages = []
    for m in sorted(thread.messages, key=lambda x: x.created_at):
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
        participants=participants,
        messages=messages,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


@router.post(
    "/threads",
    response_model=CreateThreadResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_thread(
    conference_id: UUID,
    data: AdminCreateThread,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CreateThreadResponse:
    """Create new message thread(s) to one or more applicants."""
    tenant_id = current_user.tenant_id
    conference = await _get_conference_for_tenant(db, conference_id, tenant_id)
    await _check_messaging_access(db, current_user, conference_id)

    # Verify all applicants exist
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id.in_(data.recipient_applicant_ids),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicants = list(result.scalars().all())
    if not applicants:
        raise NotFoundError("No valid applicants found")

    now = datetime.now(timezone.utc)
    first_thread = None
    first_message_id = None

    for applicant in applicants:
        thread = MessageThread(
            tenant_id=tenant_id,
            conference_id=conference_id,
            subject=data.subject,
        )
        db.add(thread)
        await db.flush()

        if first_thread is None:
            first_thread = thread

        db.add(MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=current_user.user_id,
            last_read_at=now,
        ))
        db.add(MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant.id,
        ))
        msg = Message(
            tenant_id=tenant_id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=current_user.user_id,
            body_html=sanitize_html(data.body_html),
        )
        db.add(msg)
        await db.flush()

        if first_message_id is None:
            first_message_id = msg.id

    # Link pre-uploaded attachments to the first message
    if data.attachment_ids and first_message_id:
        await _link_attachments_to_message(db, data.attachment_ids, first_message_id, tenant_id)

    # Audit log
    recipient_names = ", ".join(
        f"{a.first_name} {a.last_name}" for a in applicants
    )
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="create",
            resource_type="message_thread",
            resource_id=first_thread.id,
            details=f"Created thread '{data.subject}' to {len(applicants)} recipient(s): {recipient_names}",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    # Send email notifications for each thread
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""

    # Re-query threads created in this batch to notify
    created_threads_result = await db.execute(
        select(MessageThread).where(
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
            MessageThread.subject == data.subject,
            MessageThread.created_at >= now,
        )
    )
    for t in created_threads_result.scalars():
        await _notify_participants(
            db, t, "user", current_user.user_id,
            conference.name, tenant_slug, conference_id,
        )

    first_thread_detail = await get_thread(
        conference_id, first_thread.id, current_user, db
    )
    return CreateThreadResponse(
        threads_created=len(applicants),
        first_thread=first_thread_detail,
    )


@router.post(
    "/threads/{thread_id}/reply",
    response_model=MessageResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def reply_to_thread(
    conference_id: UUID,
    thread_id: UUID,
    data: ReplyCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MessageResponse:
    """Reply to an existing thread."""
    tenant_id = current_user.tenant_id
    conference = await _get_conference_for_tenant(db, conference_id, tenant_id)

    # Verify thread
    result = await db.execute(
        select(MessageThread).where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    # Ensure admin is a participant (add if not)
    p_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
    )
    participant = p_result.scalar_one_or_none()
    if not participant:
        participant = MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread_id,
            participant_type="user",
            participant_id=current_user.user_id,
        )
        db.add(participant)

    # Mark as read
    participant.last_read_at = datetime.now(timezone.utc)

    # Create message
    message = Message(
        tenant_id=tenant_id,
        thread_id=thread_id,
        sender_type="user",
        sender_id=current_user.user_id,
        body_html=sanitize_html(data.body_html),
    )
    db.add(message)
    await db.flush()

    # Link pre-uploaded attachments
    if data.attachment_ids:
        await _link_attachments_to_message(db, data.attachment_ids, message.id, tenant_id)

    # Touch thread updated_at
    thread.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(message)

    # Send email notifications
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""
    await _notify_participants(
        db, thread, "user", current_user.user_id,
        conference.name, tenant_slug, conference_id,
    )

    # Resolve sender
    user_result = await db.execute(
        select(User).where(User.id == current_user.user_id)
    )
    user = user_result.scalar_one()

    # Fetch attachments for this message
    attachment_map = await _fetch_message_attachments(db, [message.id])

    return MessageResponse(
        id=message.id,
        thread_id=message.thread_id,
        sender=SenderInfo(
            id=user.id,
            type="user",
            first_name=user.first_name or "",
            last_name=user.last_name or "",
            email=user.email,
        ),
        body_html=message.body_html,
        attachments=attachment_map.get(message.id, []),
        created_at=message.created_at,
    )


@router.post(
    "/threads/{thread_id}/read",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def mark_thread_read(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Mark a thread as read for the current user."""
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
    )
    participant = result.scalar_one_or_none()
    if participant:
        participant.last_read_at = datetime.now(timezone.utc)
        await db.commit()

    return {"ok": True}
