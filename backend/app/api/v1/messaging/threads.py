"""Admin messaging thread endpoints."""

import re
import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.config import get_settings as _get_settings
from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.html_sanitize import sanitize_html
from app.core.search import unaccent_ilike
from app.core.security.pii_crypto import read_pii
from app.models.associations import ConferenceCFP
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant, CFPPaper
from app.models.messaging import Message, MessageParticipant, MessageThread, ThreadFlag
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.messaging import (
    AdminCreateThread,
    CreateThreadResponse,
    InternalNoteCreate,
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
    _get_messaging_mode,
    _link_attachments_to_message,
    _notify_participants,
    _resolve_senders,
    _send_direct_emails,
    _strip_html,
    substitute_template_variables,
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
    search_body: bool = False,
    bulk_id: UUID | None = None,
    archived: bool = False,
    flagged: bool | None = None,
    has_attachments: bool | None = None,
    unread_only: bool | None = None,
    participant_name: str | None = None,
) -> ThreadListResponse:
    """List message threads for this conference."""
    tenant_id = current_user.require_tenant_id()
    await get_conference_for_tenant(db, conference_id, tenant_id)

    # Correlated scalar subqueries — attach per-thread aggregates to the base select
    # so we don't need follow-up batch queries for msg_count, last_message_at,
    # my_last_read_at, or is_flagged.
    msg_count_sq = (
        select(func.count(Message.id))
        .where(Message.thread_id == MessageThread.id)
        .correlate(MessageThread)
        .scalar_subquery()
    )
    last_message_at_sq = (
        select(func.max(Message.created_at))
        .where(Message.thread_id == MessageThread.id)
        .correlate(MessageThread)
        .scalar_subquery()
    )
    my_last_read_sq = (
        select(MessageParticipant.last_read_at)
        .where(
            MessageParticipant.thread_id == MessageThread.id,
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
        .correlate(MessageThread)
        .scalar_subquery()
    )
    is_flagged_sq = (
        select(ThreadFlag.thread_id)
        .where(
            ThreadFlag.thread_id == MessageThread.id,
            ThreadFlag.user_id == current_user.user_id,
        )
        .correlate(MessageThread)
        .exists()
    )

    # Collect filters so we can apply them to both the main query and the count.
    filters = [
        MessageThread.tenant_id == tenant_id,
        MessageThread.conference_id == conference_id,
    ]

    if archived:
        filters.append(MessageThread.archived_at.isnot(None))
    else:
        filters.append(MessageThread.archived_at.is_(None))

    if search:
        if search_body:
            matching_thread_ids = select(Message.thread_id).where(unaccent_ilike(Message.body_html, search)).distinct()
            filters.append(unaccent_ilike(MessageThread.subject, search) | MessageThread.id.in_(matching_thread_ids))
        else:
            filters.append(unaccent_ilike(MessageThread.subject, search))
    if bulk_id:
        filters.append(MessageThread.bulk_id == bulk_id)

    if flagged is True:
        flagged_thread_ids = select(ThreadFlag.thread_id).where(ThreadFlag.user_id == current_user.user_id)
        filters.append(MessageThread.id.in_(flagged_thread_ids))

    if has_attachments is True:
        filters.append(MessageThread.has_attachments.is_(True))

    if unread_only is True:
        unread_thread_ids = (
            select(MessageParticipant.thread_id)
            .join(Message, Message.thread_id == MessageParticipant.thread_id)
            .where(
                MessageParticipant.participant_type == "user",
                MessageParticipant.participant_id == current_user.user_id,
                (MessageParticipant.last_read_at.is_(None)) | (Message.created_at > MessageParticipant.last_read_at),
            )
            .distinct()
        )
        filters.append(MessageThread.id.in_(unread_thread_ids))

    if participant_name:
        applicant_ids_q = select(CFPApplicant.id).where(
            (unaccent_ilike(CFPApplicant.first_name, participant_name))
            | (unaccent_ilike(CFPApplicant.last_name, participant_name))
        )
        matching_thread_ids_by_name = select(MessageParticipant.thread_id).where(
            MessageParticipant.participant_type == "applicant",
            MessageParticipant.participant_id.in_(applicant_ids_q),
        )
        filters.append(MessageThread.id.in_(matching_thread_ids_by_name))

    # Count — no aggregate subqueries in SELECT, so the planner skips them.
    count_q = select(func.count()).select_from(select(MessageThread.id).where(*filters).subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Base query — one round-trip returns threads + aggregates.
    query = (
        select(
            MessageThread,
            msg_count_sq.label("msg_count"),
            last_message_at_sq.label("last_message_at"),
            my_last_read_sq.label("my_last_read_at"),
            is_flagged_sq.label("is_flagged"),
        )
        .where(*filters)
        .order_by(MessageThread.updated_at.desc())
    )

    # Fetch page with per-thread aggregates in one round-trip.
    rows = (await db.execute(query.offset((page - 1) * page_size).limit(page_size))).all()

    if not rows:
        return ThreadListResponse(items=[], total=total, page=page, page_size=page_size)

    threads = [r[0] for r in rows]
    thread_ids = [t.id for t in threads]
    msg_counts = {t.id: r.msg_count or 0 for t, r in zip(threads, rows, strict=True)}
    last_message_at_by_thread = {t.id: r.last_message_at for t, r in zip(threads, rows, strict=True)}
    my_last_read_by_thread = {t.id: r.my_last_read_at for t, r in zip(threads, rows, strict=True)}
    flagged_ids = {t.id for t, r in zip(threads, rows, strict=True) if r.is_flagged}

    # Fetch last-message body/sender (we still need these columns; aggregates above
    # only gave us the timestamp).
    last_msgs: dict[UUID, Message] = {}
    thread_ids_with_last = [tid for tid, ts in last_message_at_by_thread.items() if ts is not None]
    if thread_ids_with_last:
        last_msgs_result = await db.execute(
            select(Message).where(
                Message.thread_id.in_(thread_ids_with_last),
                Message.created_at.in_(
                    [last_message_at_by_thread[tid] for tid in thread_ids_with_last if last_message_at_by_thread[tid]]
                ),
            )
        )
        # (thread_id, created_at) pair uniquely identifies the last message.
        for m in last_msgs_result.scalars():
            if last_message_at_by_thread.get(m.thread_id) == m.created_at and m.thread_id not in last_msgs:
                last_msgs[m.thread_id] = m

    # Fetch all participants for these threads (to find "other" participants).
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
        my_last_read = my_last_read_by_thread.get(thread.id)
        unread = False
        if last_msg and (my_last_read is None or my_last_read < last_msg.created_at):
            unread = True

        placeholder_sender = SenderInfo(id=uuid.UUID(int=0), type="user", first_name="", last_name="", email="")
        last_sender = (
            sender_map.get((last_msg.sender_type, last_msg.sender_id)) or placeholder_sender
            if last_msg
            else placeholder_sender
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
                is_flagged=thread.id in flagged_ids,
                has_attachments=thread.has_attachments,
                created_at=thread.created_at,
                bulk_id=thread.bulk_id,
                archived_at=thread.archived_at,
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
    tenant_id = current_user.require_tenant_id()
    await get_conference_for_tenant(db, conference_id, tenant_id)

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
                    is_internal_note=m.is_internal_note,
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
    tenant_id = current_user.require_tenant_id()
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
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

    messaging_mode = _get_messaging_mode(conference)
    conf_name = conference.name or ""

    # Fetch latest paper title per applicant for variable substitution
    applicant_ids_list = [a.id for a in applicants]
    paper_titles: dict[UUID, str] = {}
    if applicant_ids_list:
        conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
        paper_result = await db.execute(
            select(CFPPaper.main_speaker_id, CFPPaper.title)
            .where(
                CFPPaper.main_speaker_id.in_(applicant_ids_list),
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
            )
            .order_by(CFPPaper.created_at.desc())
        )
        for row in paper_result.all():
            if row[0] not in paper_titles:
                paper_titles[row[0]] = row[1] or ""

    now = datetime.now(UTC)
    first_thread = None
    first_message_id = None

    for applicant in applicants:
        # Substitute template variables per recipient
        subj = substitute_template_variables(
            data.subject,
            first_name=applicant.first_name or "",
            last_name=applicant.last_name or "",
            email=applicant.email or "",
            conference_name=conf_name,
            paper_title=paper_titles.get(applicant.id, ""),
        )
        body = substitute_template_variables(
            sanitize_html(data.body_html),
            first_name=applicant.first_name or "",
            last_name=applicant.last_name or "",
            email=applicant.email or "",
            conference_name=conf_name,
            paper_title=paper_titles.get(applicant.id, ""),
        )

        thread = MessageThread(
            tenant_id=tenant_id,
            conference_id=conference_id,
            subject=subj,
            screen_overlay_id=data.screen_overlay_id,
        )
        db.add(thread)
        await db.flush()

        if first_thread is None:
            first_thread = thread

        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=current_user.user_id,
                last_read_at=now,
            )
        )
        db.add(
            MessageParticipant(
                tenant_id=tenant_id,
                thread_id=thread.id,
                participant_type="applicant",
                participant_id=applicant.id,
            )
        )
        msg = Message(
            tenant_id=tenant_id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=current_user.user_id,
            body_html=body,
        )
        db.add(msg)
        await db.flush()

        if first_message_id is None:
            first_message_id = msg.id

    # `applicants` is non-empty (checked above), so the loop created at least one thread.
    assert first_thread is not None

    # Link pre-uploaded attachments to the first message
    if data.attachment_ids and first_message_id:
        await _link_attachments_to_message(db, data.attachment_ids, first_message_id, tenant_id)
        first_thread.has_attachments = True

    # Audit log
    recipient_names = ", ".join(f"{a.first_name} {a.last_name}" for a in applicants)
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="create",
            resource_type="message_thread",
            resource_id=first_thread.id,
            details={
                "message": f"Created thread '{data.subject}' to {len(applicants)} recipient(s): {recipient_names}"
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    # Send email notifications
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""

    _settings = _get_settings()

    if messaging_mode == "email_only":
        # Send actual message content directly via email
        user_result = await db.execute(select(User).where(User.id == current_user.user_id))
        user = user_result.scalar_one()
        sender_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or (read_pii(user, "email") or "")
        await _send_direct_emails(
            db,
            applicants,
            data.subject,
            sanitize_html(data.body_html),
            conference.name,
            sender_name,
            reply_to=conference.contact_email,
            conference_id=conference_id,
            tenant_id=tenant_id,
        )
    else:
        # Send notification emails with link to message
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
                db,
                t,
                "user",
                current_user.user_id,
                conference.name,
                tenant_slug,
                conference_id,
                base_url=_settings.PORTAL_BASE_URL,
            )

    first_thread_detail = await get_thread(conference_id, first_thread.id, current_user, db)
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
    tenant_id = current_user.require_tenant_id()
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

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
    participant.last_read_at = datetime.now(UTC)

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
        thread.has_attachments = True

    # Touch thread updated_at
    thread.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(message)

    # Send email notifications
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant_obj = tenant_result.scalar_one_or_none()
    tenant_slug = tenant_obj.slug if tenant_obj else ""

    messaging_mode = _get_messaging_mode(conference)
    if messaging_mode == "email_only":
        # Resolve other applicant participants and send direct emails
        other_p_result = await db.execute(
            select(MessageParticipant).where(
                MessageParticipant.thread_id == thread_id,
                MessageParticipant.participant_type == "applicant",
            )
        )
        applicant_ids = [p.participant_id for p in other_p_result.scalars()]
        if applicant_ids:
            app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(applicant_ids)))
            recipients = list(app_result.scalars().all())
            user_result = await db.execute(select(User).where(User.id == current_user.user_id))
            user = user_result.scalar_one()
            sender_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or (read_pii(user, "email") or "")
            await _send_direct_emails(
                db,
                recipients,
                thread.subject,
                sanitize_html(data.body_html),
                conference.name,
                sender_name,
                reply_to=conference.contact_email,
                conference_id=conference_id,
                tenant_id=tenant_id,
            )
    else:
        _reply_settings = _get_settings()
        await _notify_participants(
            db,
            thread,
            "user",
            current_user.user_id,
            conference.name,
            tenant_slug,
            conference_id,
            base_url=_reply_settings.PORTAL_BASE_URL,
        )

    # Resolve sender
    user_result = await db.execute(select(User).where(User.id == current_user.user_id))
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
            email=read_pii(user, "email") or "",
        ),
        body_html=message.body_html,
        is_internal_note=message.is_internal_note,
        attachments=attachment_map.get(message.id, []),
        created_at=message.created_at,
    )


@router.post(
    "/threads/{thread_id}/archive",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def archive_thread(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Archive a thread."""
    tenant_id = current_user.require_tenant_id()

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

    thread.archived_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}


@router.post(
    "/threads/{thread_id}/unarchive",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def unarchive_thread(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Unarchive a thread."""
    tenant_id = current_user.require_tenant_id()

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

    thread.archived_at = None
    await db.commit()
    return {"ok": True}


@router.post(
    "/threads/{thread_id}/flag",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def toggle_thread_flag(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Toggle flag/star on a thread for the current user."""
    tenant_id = current_user.require_tenant_id()

    # Verify thread exists
    result = await db.execute(
        select(MessageThread).where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError("Thread not found")

    # Check if flag exists
    flag_result = await db.execute(
        select(ThreadFlag).where(
            ThreadFlag.thread_id == thread_id,
            ThreadFlag.user_id == current_user.user_id,
        )
    )
    existing = flag_result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"flagged": False}
    else:
        db.add(
            ThreadFlag(
                thread_id=thread_id,
                user_id=current_user.user_id,
            )
        )
        await db.commit()
        return {"flagged": True}


@router.post(
    "/threads/{thread_id}/note",
    response_model=MessageResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_internal_note(
    conference_id: UUID,
    thread_id: UUID,
    data: InternalNoteCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> MessageResponse:
    """Create an internal note on a thread (visible only to admins)."""
    tenant_id = current_user.require_tenant_id()
    await get_conference_for_tenant(db, conference_id, tenant_id)

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

    # Create internal note message
    message = Message(
        tenant_id=tenant_id,
        thread_id=thread_id,
        sender_type="user",
        sender_id=current_user.user_id,
        body_html=sanitize_html(data.body_html),
        is_internal_note=True,
    )
    db.add(message)

    # Touch thread updated_at
    thread.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(message)

    # Resolve sender
    user_result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = user_result.scalar_one()

    return MessageResponse(
        id=message.id,
        thread_id=message.thread_id,
        sender=SenderInfo(
            id=user.id,
            type="user",
            first_name=user.first_name or "",
            last_name=user.last_name or "",
            email=read_pii(user, "email") or "",
        ),
        body_html=message.body_html,
        is_internal_note=True,
        attachments=[],
        created_at=message.created_at,
    )


@router.get(
    "/threads/{thread_id}/export",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def export_thread(
    conference_id: UUID,
    thread_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    format: str = Query("text", pattern="^(html|text)$"),
) -> Response:
    """Export a thread as HTML or plain text file."""
    tenant_id = current_user.require_tenant_id()
    await get_conference_for_tenant(db, conference_id, tenant_id)

    result = await db.execute(
        select(MessageThread)
        .options(selectinload(MessageThread.messages))
        .where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
        )
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise NotFoundError("Thread not found")

    # Resolve all senders
    sender_pairs = {(m.sender_type, m.sender_id) for m in thread.messages}
    sender_map = await _resolve_senders(db, sender_pairs)

    sorted_messages = sorted(thread.messages, key=lambda x: x.created_at)

    if format == "html":
        lines = [
            "<!DOCTYPE html>",
            "<html><head><meta charset='utf-8'>",
            f"<title>{thread.subject}</title>",
            "<style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:20px}"
            ".msg{border-bottom:1px solid #eee;padding:12px 0}"
            ".sender{font-weight:bold}.time{color:#888;font-size:0.85em}"
            ".note{background:#fffbeb;border:1px dashed #f59e0b;padding:8px;border-radius:4px}"
            "</style></head><body>",
            f"<h1>{thread.subject}</h1>",
        ]
        for m in sorted_messages:
            sender = sender_map.get((m.sender_type, m.sender_id))
            name = f"{sender.first_name} {sender.last_name}".strip() if sender else "Unknown"
            ts = m.created_at.strftime("%Y-%m-%d %H:%M UTC")
            note_class = ' class="note"' if m.is_internal_note else ""
            note_label = " [INTERNAL NOTE]" if m.is_internal_note else ""
            lines.append(f'<div class="msg"{note_class}>')
            lines.append(f'<span class="sender">{name}{note_label}</span> ')
            lines.append(f'<span class="time">{ts}</span>')
            lines.append(f"<div>{m.body_html}</div>")
            lines.append("</div>")
        lines.append("</body></html>")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="text/html",
            headers={
                "Content-Disposition": f'attachment; filename="thread-{thread_id}.html"',
            },
        )
    else:
        lines = [f"Subject: {thread.subject}", ""]
        for m in sorted_messages:
            sender = sender_map.get((m.sender_type, m.sender_id))
            name = f"{sender.first_name} {sender.last_name}".strip() if sender else "Unknown"
            ts = m.created_at.strftime("%Y-%m-%d %H:%M UTC")
            note_label = " [INTERNAL NOTE]" if m.is_internal_note else ""
            # Strip HTML for plain text
            body_text = re.sub(r"<[^>]+>", "", m.body_html)
            body_text = re.sub(r"\s+", " ", body_text).strip()
            lines.append(f"{name}{note_label} — {ts}")
            lines.append(body_text)
            lines.append("---")
            lines.append("")
        content = "\n".join(lines)
        return Response(
            content=content,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="thread-{thread_id}.txt"',
            },
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
    result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id == thread_id,
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
    )
    participant = result.scalar_one_or_none()
    if participant:
        participant.last_read_at = datetime.now(UTC)
        await db.commit()

    return {"ok": True}
