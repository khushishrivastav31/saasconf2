"""Portal thread detail, create, reply, and mark-read endpoints."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.html_sanitize import sanitize_html
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.messaging import (
    MessageResponse,
    ParticipantInfo,
    PortalCreateThread,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
)

from ._helpers import (
    _fetch_message_attachments,
    _link_attachments_to_message,
    _notify_other_participants,
    _resolve_senders,
)

router = APIRouter()


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
            email=applicant.email or "",
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
