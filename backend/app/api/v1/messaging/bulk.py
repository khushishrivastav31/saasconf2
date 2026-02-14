"""Admin messaging bulk send and count endpoints."""

import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
    require_module,
)
from app.core.html_sanitize import sanitize_html
from app.core.exceptions import NotFoundError
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant, CFPPaper, CFPCommitteeMember
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.schemas.messaging import (
    AdminBulkSend,
    BulkSendResponse,
    BulkThreadSummary,
    UnreadCountResponse,
)

from ._shared import (
    MODULE_CODE,
    _check_messaging_access,
    _get_conference_for_tenant,
)

router = APIRouter()


@router.post(
    "/bulk-send",
    response_model=BulkSendResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def bulk_send(
    conference_id: UUID,
    data: AdminBulkSend,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BulkSendResponse:
    """Bulk-send messages to multiple applicants."""
    tenant_id = current_user.tenant_id
    await _get_conference_for_tenant(db, conference_id, tenant_id)
    await _check_messaging_access(db, current_user, conference_id)

    # Resolve recipients
    applicant_ids: set[UUID] = set()

    if data.recipients.all_applicants:
        # All applicants who have submitted papers to this conference
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.conference_id == conference_id,
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipients.applicant_ids:
        applicant_ids.update(data.recipients.applicant_ids)

    if data.recipients.paper_status:
        result = await db.execute(
            select(CFPPaper.applicant_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.conference_id == conference_id,
                CFPPaper.status == data.recipients.paper_status,
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipients.committee_role:
        result = await db.execute(
            select(CFPCommitteeMember.applicant_id)
            .where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
                CFPCommitteeMember.role == data.recipients.committee_role,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if not applicant_ids:
        raise NotFoundError("No recipients found matching the criteria")

    # Verify applicants exist
    result = await db.execute(
        select(CFPApplicant.id).where(
            CFPApplicant.id.in_(list(applicant_ids)),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    valid_ids = {row[0] for row in result.all()}

    bulk_id = uuid.uuid4()
    now = datetime.now(timezone.utc)

    for applicant_id in valid_ids:
        thread = MessageThread(
            tenant_id=tenant_id,
            conference_id=conference_id,
            subject=data.subject,
            bulk_id=bulk_id,
        )
        db.add(thread)
        await db.flush()

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
                participant_id=applicant_id,
            )
        )
        db.add(
            Message(
                tenant_id=tenant_id,
                thread_id=thread.id,
                sender_type="user",
                sender_id=current_user.user_id,
                body_html=sanitize_html(data.body_html),
            )
        )

    # Audit log
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="bulk_send",
            resource_type="message_thread",
            resource_id=bulk_id,
            details=f"Bulk sent '{data.subject}' to {len(valid_ids)} recipients",
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    return BulkSendResponse(bulk_id=bulk_id, threads_created=len(valid_ids))


@router.get(
    "/bulk-threads",
    response_model=list[BulkThreadSummary],
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_bulk_threads(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[BulkThreadSummary]:
    """List bulk send campaigns for this conference."""
    tenant_id = current_user.tenant_id
    await _get_conference_for_tenant(db, conference_id, tenant_id)

    result = await db.execute(
        select(
            MessageThread.bulk_id,
            MessageThread.subject,
            func.count(MessageThread.id).label("threads_created"),
            func.min(MessageThread.created_at).label("created_at"),
        )
        .where(
            MessageThread.tenant_id == tenant_id,
            MessageThread.conference_id == conference_id,
            MessageThread.bulk_id.isnot(None),
        )
        .group_by(MessageThread.bulk_id, MessageThread.subject)
        .order_by(func.min(MessageThread.created_at).desc())
    )

    return [
        BulkThreadSummary(
            bulk_id=row.bulk_id,
            subject=row.subject,
            threads_created=row.threads_created,
            created_at=row.created_at,
        )
        for row in result.all()
    ]


@router.get(
    "/unread-count",
    response_model=UnreadCountResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_unread_count(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> UnreadCountResponse:
    """Get count of unread threads for current user in this conference."""
    tenant_id = current_user.tenant_id

    # Subquery: threads where user is a participant
    my_threads = (
        select(MessageParticipant.thread_id, MessageParticipant.last_read_at)
        .where(
            MessageParticipant.participant_type == "user",
            MessageParticipant.participant_id == current_user.user_id,
        )
        .subquery()
    )

    # Subquery: last message time per thread
    last_msg = (
        select(
            Message.thread_id,
            func.max(Message.created_at).label("last_at"),
        )
        .group_by(Message.thread_id)
        .subquery()
    )

    # Count threads where last message is after last_read_at (or never read)
    result = await db.execute(
        select(func.count())
        .select_from(my_threads)
        .join(
            MessageThread,
            (MessageThread.id == my_threads.c.thread_id)
            & (MessageThread.conference_id == conference_id)
            & (MessageThread.tenant_id == tenant_id),
        )
        .join(last_msg, last_msg.c.thread_id == my_threads.c.thread_id)
        .where(
            (my_threads.c.last_read_at.is_(None))
            | (last_msg.c.last_at > my_threads.c.last_read_at)
        )
    )

    return UnreadCountResponse(unread_count=result.scalar() or 0)
