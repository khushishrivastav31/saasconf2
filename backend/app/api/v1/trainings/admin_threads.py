"""Admin training-thread inbox: list / detail / reply / archive endpoints.

Mirrors the per-conference Messaging tab so the admin can browse every
training broadcast as an individual thread and reply 1:1 with each
attendee. Threads are always tenant-scoped to ``domain='training'``;
any tenant admin can see every training thread in their tenant
regardless of who originally sent the broadcast.

Reuses the cfp_portal helpers for sender resolution + attachment
fetching to avoid drifting between the portal-side and admin-side
shapes.
"""

import uuid as _uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.api.v1.cfp_portal.messaging._helpers import (
    _fetch_message_attachments,
    _link_attachments_to_message,
    _resolve_domain_entity_names,
    _resolve_senders,
    _strip_html,
)
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.html_sanitize import sanitize_html
from app.models.messaging import (
    THREAD_DOMAIN_TRAINING,
    Message,
    MessageParticipant,
    MessageThread,
)
from app.schemas.messaging import (
    MessageResponse,
    ParticipantInfo,
    ReplyCreate,
    SenderInfo,
    ThreadDetailResponse,
    ThreadListItem,
    ThreadListResponse,
)

router = APIRouter(prefix="/messaging", tags=["training-messaging"])


@router.get("/threads", response_model=ThreadListResponse)
async def list_training_threads(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    archived: bool = False,
    has_attachments: bool | None = None,
    unread_only: bool | None = None,
    search: str | None = None,
) -> ThreadListResponse:
    """List every training thread in the tenant.

    Same response shape as the per-conference admin list. Filters are
    composable (archived, unread, has_attachments, subject search).
    """
    tenant_id = current_user.require_tenant_id()

    filters = [
        MessageThread.tenant_id == tenant_id,
        MessageThread.domain == THREAD_DOMAIN_TRAINING,
    ]
    if archived:
        filters.append(MessageThread.archived_at.isnot(None))
    else:
        filters.append(MessageThread.archived_at.is_(None))
    if has_attachments is True:
        filters.append(MessageThread.has_attachments.is_(True))
    if search:
        filters.append(MessageThread.subject.ilike(f"%{search}%"))

    if unread_only is True:
        # Threads where the current admin's participant row is missing
        # OR whose last_read_at is older than the latest message.
        last_msg_sq = (
            select(func.max(Message.created_at))
            .where(Message.thread_id == MessageThread.id)
            .correlate(MessageThread)
            .scalar_subquery()
        )
        my_part_sq = (
            select(MessageParticipant.last_read_at)
            .where(
                MessageParticipant.thread_id == MessageThread.id,
                MessageParticipant.participant_type == "user",
                MessageParticipant.participant_id == current_user.user_id,
            )
            .correlate(MessageThread)
            .scalar_subquery()
        )
        filters.append(or_(my_part_sq.is_(None), last_msg_sq > my_part_sq))

    base = select(MessageThread).where(and_(*filters)).order_by(MessageThread.updated_at.desc())
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0

    threads = (await db.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    if not threads:
        return ThreadListResponse(items=[], total=total, page=page, page_size=page_size)

    thread_ids = [t.id for t in threads]

    # Last visible message + counts (exclude internal notes from the inbox preview).
    last_msg_subq = (
        select(Message.thread_id, func.max(Message.created_at).label("max_created"))
        .where(Message.thread_id.in_(thread_ids), Message.is_internal_note.is_(False))
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
    count_result = await db.execute(
        select(Message.thread_id, func.count(Message.id))
        .where(Message.thread_id.in_(thread_ids), Message.is_internal_note.is_(False))
        .group_by(Message.thread_id)
    )
    msg_counts: dict[UUID, int] = dict(count_result.tuples().all())

    # My (current admin's) participant rows, used for unread state.
    my_parts_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id.in_(thread_ids),
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
    )
    my_participants = {p.thread_id: p for p in my_parts_result.scalars()}

    # All participants for sender resolution + "other participants" rendering.
    all_parts_result = await db.execute(select(MessageParticipant).where(MessageParticipant.thread_id.in_(thread_ids)))
    all_parts = list(all_parts_result.scalars().all())

    sender_pairs: set[tuple[str, UUID]] = set()
    for msg in last_msgs.values():
        sender_pairs.add((msg.sender_type, msg.sender_id))
    for p in all_parts:
        sender_pairs.add((p.participant_type, p.participant_id))
    sender_map = await _resolve_senders(db, sender_pairs)

    # "Other participants" for the admin inbox = the recipient(s).
    other_participants_map: dict[UUID, list[SenderInfo]] = {}
    for p in all_parts:
        if p.participant_type == "user":
            continue
        info = sender_map.get((p.participant_type, p.participant_id))
        if info:
            other_participants_map.setdefault(p.thread_id, []).append(info)

    domain_pairs: set[tuple[str, UUID]] = {
        (t.domain, t.domain_entity_id) for t in threads if t.domain_entity_id is not None
    }
    name_map = await _resolve_domain_entity_names(db, tenant_id=tenant_id, domain_pairs=domain_pairs)

    placeholder_sender = SenderInfo(id=_uuid.UUID(int=0), type="user", first_name="", last_name="", email="")
    items: list[ThreadListItem] = []
    for thread in threads:
        last_msg = last_msgs.get(thread.id)
        my_p = my_participants.get(thread.id)
        unread = False
        if last_msg:
            if my_p is None or my_p.last_read_at is None or my_p.last_read_at < last_msg.created_at:
                unread = True
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
                has_attachments=thread.has_attachments,
                created_at=thread.created_at,
                bulk_id=thread.bulk_id,
                archived_at=thread.archived_at,
                domain=thread.domain,
                domain_entity_id=thread.domain_entity_id,
                domain_entity_name=name_map.get((thread.domain, thread.domain_entity_id)),
            )
        )

    return ThreadListResponse(items=items, total=total, page=page, page_size=page_size)


async def _load_training_thread(db, tenant_id: UUID, thread_id: UUID) -> MessageThread:
    """Fetch a training thread or 404. Tenant-scoped."""
    result = await db.execute(
        select(MessageThread)
        .options(selectinload(MessageThread.participants), selectinload(MessageThread.messages))
        .where(
            MessageThread.id == thread_id,
            MessageThread.tenant_id == tenant_id,
            MessageThread.domain == THREAD_DOMAIN_TRAINING,
        )
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Thread not found")
    return thread


@router.get("/threads/{thread_id}", response_model=ThreadDetailResponse)
async def get_training_thread(
    thread_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ThreadDetailResponse:
    """Detail view for a single training thread (admin-side)."""
    tenant_id = current_user.require_tenant_id()
    thread = await _load_training_thread(db, tenant_id, thread_id)

    pairs: set[tuple[str, UUID]] = set()
    for p in thread.participants:
        pairs.add((p.participant_type, p.participant_id))
    for m in thread.messages:
        pairs.add((m.sender_type, m.sender_id))
    info_map = await _resolve_senders(db, pairs)

    me_key = ("user", current_user.user_id)
    participants = [
        ParticipantInfo(
            id=info.id,
            type=info.type,
            first_name=info.first_name,
            last_name=info.last_name,
            email=info.email,
            last_read_at=p.last_read_at,
            is_me=(p.participant_type, p.participant_id) == me_key,
        )
        for p in thread.participants
        if (info := info_map.get((p.participant_type, p.participant_id)))
    ]

    visible = sorted([m for m in thread.messages], key=lambda x: x.created_at)
    attachment_map = await _fetch_message_attachments(db, [m.id for m in visible])

    messages = []
    for m in visible:
        sender = info_map.get((m.sender_type, m.sender_id))
        if not sender:
            continue
        messages.append(
            MessageResponse(
                id=m.id,
                thread_id=m.thread_id,
                sender=sender.model_copy(update={"is_me": (m.sender_type, m.sender_id) == me_key}),
                body_html=m.body_html,
                is_internal_note=m.is_internal_note,
                attachments=attachment_map.get(m.id, []),
                created_at=m.created_at,
            )
        )

    name_map = (
        await _resolve_domain_entity_names(
            db, tenant_id=tenant_id, domain_pairs={(thread.domain, thread.domain_entity_id)}
        )
        if thread.domain_entity_id
        else {}
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
        domain=thread.domain,
        domain_entity_id=thread.domain_entity_id,
        domain_entity_name=(
            name_map.get((thread.domain, thread.domain_entity_id)) if thread.domain_entity_id else None
        ),
    )


@router.post("/threads/{thread_id}/reply", response_model=MessageResponse, status_code=201)
async def reply_to_training_thread(
    thread_id: UUID,
    data: ReplyCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> MessageResponse:
    """Admin reply on a training thread.

    Adds the current admin as a participant if they aren't one already
    (broadcasts only attach the original sender, not every tenant admin).
    """
    tenant_id = current_user.require_tenant_id()
    thread = await _load_training_thread(db, tenant_id, thread_id)

    me_part = next(
        (p for p in thread.participants if p.participant_type == "user" and p.participant_id == current_user.user_id),
        None,
    )
    if me_part is None:
        me_part = MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=current_user.user_id,
        )
        db.add(me_part)

    me_part.last_read_at = datetime.now(UTC)

    message = Message(
        tenant_id=tenant_id,
        thread_id=thread.id,
        sender_type="user",
        sender_id=current_user.user_id,
        body_html=sanitize_html(data.body_html),
    )
    db.add(message)
    await db.flush()

    if data.attachment_ids:
        await _link_attachments_to_message(db, data.attachment_ids, message.id, tenant_id)
        thread.has_attachments = True

    thread.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(message)

    attachment_map = await _fetch_message_attachments(db, [message.id])
    sender_info = (await _resolve_senders(db, {("user", current_user.user_id)})).get(("user", current_user.user_id))
    placeholder = SenderInfo(id=current_user.user_id, type="user", first_name="", last_name="", email="")
    sender = (sender_info or placeholder).model_copy(update={"is_me": True})

    return MessageResponse(
        id=message.id,
        thread_id=message.thread_id,
        sender=sender,
        body_html=message.body_html,
        is_internal_note=False,
        attachments=attachment_map.get(message.id, []),
        created_at=message.created_at,
    )


@router.post("/threads/{thread_id}/archive")
async def archive_training_thread(
    thread_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Archive a training thread (tenant-wide for admins)."""
    tenant_id = current_user.require_tenant_id()
    thread = await _load_training_thread(db, tenant_id, thread_id)
    thread.archived_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}


@router.post("/threads/{thread_id}/unarchive")
async def unarchive_training_thread(
    thread_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Unarchive a training thread."""
    tenant_id = current_user.require_tenant_id()
    thread = await _load_training_thread(db, tenant_id, thread_id)
    thread.archived_at = None
    await db.commit()
    return {"ok": True}


@router.post("/threads/{thread_id}/read")
async def mark_training_thread_read(
    thread_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Mark a training thread as read for the current admin.

    Adds the admin as a participant if missing (broadcasts only attach
    the original sender, so other admins won't have a row yet).
    """
    tenant_id = current_user.require_tenant_id()
    thread = await _load_training_thread(db, tenant_id, thread_id)

    me_part = next(
        (p for p in thread.participants if p.participant_type == "user" and p.participant_id == current_user.user_id),
        None,
    )
    if me_part is None:
        me_part = MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=current_user.user_id,
        )
        db.add(me_part)
    me_part.last_read_at = datetime.now(UTC)
    await db.commit()
    return {"ok": True}
