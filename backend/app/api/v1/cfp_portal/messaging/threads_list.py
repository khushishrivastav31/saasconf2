"""Portal thread list, archive/unarchive, and unread-count endpoints."""

import uuid as _uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, select, tuple_

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.messaging import THREAD_DOMAINS, Message, MessageParticipant, MessageThread
from app.schemas.messaging import (
    SenderInfo,
    ThreadListItem,
    ThreadListResponse,
    UnreadCountResponse,
)

from ._helpers import (
    _resolve_domain_entity_names,
    _resolve_my_participant_keys,
    _resolve_senders,
    _strip_html,
)

router = APIRouter()


def _participant_match_clause(my_keys: list[tuple[str, UUID]]):
    """SQL clause that matches any (participant_type, participant_id) in my_keys.

    Postgres handles ``tuple_(...) IN ((..), (..))`` cleanly. The ``or_``
    fallback covers the edge case where keys is empty (the ``and_(False)``
    pattern would also work but ``False`` isn't a valid SQL bool here).
    """
    if not my_keys:
        return and_(MessageParticipant.thread_id.is_(None))
    return tuple_(MessageParticipant.participant_type, MessageParticipant.participant_id).in_(
        [(t, i) for t, i in my_keys]
    )


@router.get("/portal/messages", response_model=ThreadListResponse)
async def list_my_threads(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    conference_id: UUID | None = None,
    domain: str | None = Query(
        None,
        description="Filter by thread domain. One of 'conference', 'training'. Omit for all.",
    ),
    archived: bool = False,
) -> ThreadListResponse:
    """List the portal user's message threads across all domains.

    Includes both conference threads (where the user is a CFP applicant
    participant) and training threads (where the user's email matches a
    ``TrainingRegistrationAttendee``). Optional ``domain`` filter for
    inbox chips on the FE.
    """
    tenant_id = current_applicant.tenant_id
    applicant_id = current_applicant.applicant_id
    applicant_email = current_applicant.applicant.email or ""

    if domain is not None and domain not in THREAD_DOMAINS:
        raise NotFoundError(f"Unknown domain '{domain}'")

    my_keys = await _resolve_my_participant_keys(
        db,
        tenant_id=tenant_id,
        applicant_id=applicant_id,
        applicant_email=applicant_email,
    )

    # Find threads where I'm a participant under ANY of my identities.
    my_thread_ids_q = select(MessageParticipant.thread_id).where(_participant_match_clause(my_keys))

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
    if domain:
        query = query.where(MessageThread.domain == domain)

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
    msg_counts: dict[UUID, int] = dict(count_result.tuples().all())

    # My read status — match against any of my identities.
    participant_result = await db.execute(
        select(MessageParticipant).where(
            MessageParticipant.thread_id.in_(thread_ids),
            _participant_match_clause(my_keys),
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

    # Domain entity names for chip rendering.
    domain_pairs: set[tuple[str, UUID]] = {(t.domain, t.domain_entity_id) for t in threads if t.domain_entity_id}
    name_map = await _resolve_domain_entity_names(db, tenant_id=tenant_id, domain_pairs=domain_pairs)

    items = []
    for thread in threads:
        last_msg = last_msgs.get(thread.id)
        my_p = my_participants.get(thread.id)
        unread = False
        if last_msg and my_p:
            if my_p.last_read_at is None or my_p.last_read_at < last_msg.created_at:
                unread = True

        placeholder_sender = SenderInfo(id=_uuid.UUID(int=0), type="user", first_name="", last_name="", email="")
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
                created_at=thread.created_at,
                bulk_id=thread.bulk_id,
                archived_at=thread.archived_at,
                domain=thread.domain,
                domain_entity_id=thread.domain_entity_id,
                domain_entity_name=name_map.get((thread.domain, thread.domain_entity_id)),
            )
        )

    return ThreadListResponse(items=items, total=total, page=page, page_size=page_size)


def _verify_my_thread(
    thread: MessageThread | None,
    my_keys: list[tuple[str, UUID]],
    participant_rows: list[MessageParticipant],
) -> None:
    """Raise 404 if the thread is missing or I'm not a participant.

    Re-uses the participant rows already loaded by the caller so we avoid
    a second SELECT round-trip.
    """
    if thread is None:
        raise NotFoundError("Thread not found")
    key_set = {(t, i) for t, i in my_keys}
    if not any((p.participant_type, p.participant_id) in key_set for p in participant_rows):
        raise NotFoundError("Thread not found")


async def _archive_or_unarchive(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
    *,
    archived_at: datetime | None,
) -> dict:
    tenant_id = current_applicant.tenant_id

    thread = (
        (
            await db.execute(
                select(MessageThread).where(
                    MessageThread.id == thread_id,
                    MessageThread.tenant_id == tenant_id,
                )
            )
        )
        .scalars()
        .first()
    )

    my_keys = await _resolve_my_participant_keys(
        db,
        tenant_id=tenant_id,
        applicant_id=current_applicant.applicant_id,
        applicant_email=current_applicant.applicant.email or "",
    )
    participant_rows = list(
        (
            await db.execute(
                select(MessageParticipant).where(
                    MessageParticipant.thread_id == thread_id,
                    _participant_match_clause(my_keys),
                )
            )
        )
        .scalars()
        .all()
    )
    _verify_my_thread(thread, my_keys, participant_rows)
    assert thread is not None  # narrowed by _verify_my_thread

    thread.archived_at = archived_at
    await db.commit()
    return {"ok": True}


@router.post("/portal/messages/{thread_id}/archive")
async def archive_portal_thread(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Archive a thread for the portal user."""
    return await _archive_or_unarchive(thread_id, current_applicant, db, archived_at=datetime.now(UTC))


@router.post("/portal/messages/{thread_id}/unarchive")
async def unarchive_portal_thread(
    thread_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Unarchive a thread for the portal user."""
    return await _archive_or_unarchive(thread_id, current_applicant, db, archived_at=None)


@router.get("/portal/messages/unread-count", response_model=UnreadCountResponse)
async def get_portal_unread_count(
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> UnreadCountResponse:
    """Get count of unread threads for the current portal user across all domains."""
    tenant_id = current_applicant.tenant_id

    my_keys = await _resolve_my_participant_keys(
        db,
        tenant_id=tenant_id,
        applicant_id=current_applicant.applicant_id,
        applicant_email=current_applicant.applicant.email or "",
    )

    my_threads = (
        select(MessageParticipant.thread_id, MessageParticipant.last_read_at)
        .where(_participant_match_clause(my_keys))
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
