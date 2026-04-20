"""Admin messaging bulk send and count endpoints."""

import uuid
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.html_sanitize import sanitize_html
from app.core.security.pii_crypto import read_pii
from app.models.associations import ConferenceCFP
from app.models.audit import AuditLog
from app.models.cfp import CFPApplicant, CFPCommitteeMember, CFPPaper
from app.models.messaging import DynamicRecipientList, Message, MessageParticipant, MessageThread, RecipientListMember
from app.models.settings import UserRoleAssignment
from app.models.user import User
from app.schemas.messaging import (
    AdminBulkSend,
    BulkRecipientFilter,
    BulkSendResponse,
    BulkThreadSummary,
    RecipientPreviewItem,
    RecipientPreviewResponse,
    UnreadCountResponse,
)

from ._shared import (
    MODULE_CODE,
    EmailRecipient,
    _check_messaging_access,
    _send_direct_emails,
    resolve_registrations,
    resolve_sponsors,
    substitute_template_variables,
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
    await get_conference_for_tenant(db, conference_id, tenant_id)
    await _check_messaging_access(db, current_user, conference_id)

    # Resolve recipients
    applicant_ids: set[UUID] = set()

    # Subquery: CFP IDs linked to this conference
    conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)

    if data.recipients.all_applicants:
        # All applicants who have submitted papers to this conference
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipients.applicant_ids:
        applicant_ids.update(data.recipients.applicant_ids)

    if data.recipients.paper_status:
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
                CFPPaper.status == data.recipients.paper_status,
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipients.committee_role:
        result = await db.execute(
            select(CFPCommitteeMember.applicant_id).where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
                CFPCommitteeMember.role == data.recipients.committee_role,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipients.recipient_list_id:
        result = await db.execute(
            select(RecipientListMember.applicant_id).where(
                RecipientListMember.list_id == data.recipients.recipient_list_id,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    # User role (applicant-based, creates threads)
    if data.recipients.user_role_id:
        result = await db.execute(
            select(UserRoleAssignment.applicant_id).where(
                UserRoleAssignment.user_role_id == data.recipients.user_role_id,
                UserRoleAssignment.tenant_id == tenant_id,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    # Resolve email-only recipients (registrations, sponsors)
    email_recipients: list[EmailRecipient] = []

    if data.recipients.all_registrations:
        email_recipients.extend(await resolve_registrations(db, tenant_id, conference_id))

    if data.recipients.all_sponsors:
        email_recipients.extend(await resolve_sponsors(db, tenant_id, conference_id))

    if data.recipients.sponsor_package_id:
        email_recipients.extend(
            await resolve_sponsors(
                db,
                tenant_id,
                conference_id,
                filters={"sponsor_package_ids": [data.recipients.sponsor_package_id]},
            )
        )

    if data.recipients.dynamic_list_id:
        dl_result = await db.execute(
            select(DynamicRecipientList).where(
                DynamicRecipientList.id == data.recipients.dynamic_list_id,
                DynamicRecipientList.tenant_id == tenant_id,
                DynamicRecipientList.conference_id == conference_id,
            )
        )
        dl = dl_result.scalar_one_or_none()
        if dl:
            if dl.target_type == "registration":
                email_recipients.extend(await resolve_registrations(db, tenant_id, conference_id, filters=dl.filters))
            elif dl.target_type == "sponsor":
                email_recipients.extend(await resolve_sponsors(db, tenant_id, conference_id, filters=dl.filters))

    if not applicant_ids and not email_recipients:
        raise NotFoundError("No recipients found matching the criteria")

    # Fetch applicant details for variable substitution
    applicants: dict[UUID, CFPApplicant] = {}
    valid_ids: set[UUID] = set()
    if applicant_ids:
        result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id.in_(list(applicant_ids)),
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        fetched: list[CFPApplicant] = list(result.scalars().all())
        applicants = {a.id: a for a in fetched}
        valid_ids = set(applicants.keys())

    # Fetch conference name
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    conf_name = conference.name or ""

    # Fetch latest paper title per applicant (for [Paper Title] variable)
    paper_titles: dict[UUID, str] = {}
    if valid_ids:
        paper_result = await db.execute(
            select(CFPPaper.main_speaker_id, CFPPaper.title)
            .where(
                CFPPaper.main_speaker_id.in_(list(valid_ids)),
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
            )
            .order_by(CFPPaper.created_at.desc())
        )
        for row in paper_result.all():
            if row[0] not in paper_titles:
                paper_titles[row[0]] = row[1] or ""

    bulk_id = uuid.uuid4()
    now = datetime.now(UTC)

    for applicant_id in valid_ids:
        applicant = applicants[applicant_id]
        # Substitute template variables per recipient
        subj = substitute_template_variables(
            data.subject,
            first_name=applicant.first_name or "",
            last_name=applicant.last_name or "",
            email=applicant.email or "",
            conference_name=conf_name,
            paper_title=paper_titles.get(applicant_id, ""),
        )
        body = substitute_template_variables(
            sanitize_html(data.body_html),
            first_name=applicant.first_name or "",
            last_name=applicant.last_name or "",
            email=applicant.email or "",
            conference_name=conf_name,
            paper_title=paper_titles.get(applicant_id, ""),
        )

        thread = MessageThread(
            tenant_id=tenant_id,
            conference_id=conference_id,
            subject=subj,
            bulk_id=bulk_id,
            screen_overlay_id=data.screen_overlay_id,
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
                body_html=body,
            )
        )

    # --- Email-only delivery for non-applicant recipients ---
    emails_sent = 0
    if email_recipients:
        # Deduplicate by email, also skip emails already covered by applicant threads
        applicant_emails: set[str] = set()
        if valid_ids:
            applicant_emails = {a.email.lower() for a in applicants.values()}

        seen_emails: set[str] = set(applicant_emails)
        unique_email_recipients: list[EmailRecipient] = []
        for r in email_recipients:
            if r.email.lower() not in seen_emails:
                seen_emails.add(r.email.lower())
                unique_email_recipients.append(r)

        if unique_email_recipients:
            # Get sender info
            user_result = await db.execute(select(User).where(User.id == current_user.user_id))
            user = user_result.scalar_one()
            sender_name = f"{user.first_name or ''} {user.last_name or ''}".strip() or (read_pii(user, "email") or "")

            sanitized_body = sanitize_html(data.body_html)

            class _EmailTarget:
                """Adapter for _send_direct_emails."""

                def __init__(self, r: EmailRecipient, subj: str, body: str) -> None:
                    self.email = r.email
                    self.first_name = r.first_name

            for r in unique_email_recipients:
                subj = substitute_template_variables(
                    data.subject,
                    first_name=r.first_name,
                    last_name=r.last_name,
                    email=r.email,
                    conference_name=conf_name,
                    company_name=r.company_name,
                    booking_option=r.booking_option_name,
                )
                body = substitute_template_variables(
                    sanitized_body,
                    first_name=r.first_name,
                    last_name=r.last_name,
                    email=r.email,
                    conference_name=conf_name,
                    company_name=r.company_name,
                    booking_option=r.booking_option_name,
                )
                target = _EmailTarget(r, subj, body)
                sent = await _send_direct_emails(
                    db,
                    recipients=[target],
                    subject=subj,
                    body_html=body,
                    conference_name=conf_name,
                    sender_name=sender_name,
                )
                emails_sent += sent

    # Audit log
    total_recipients = len(valid_ids) + emails_sent
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="bulk_send",
            resource_type="message_thread",
            resource_id=bulk_id,
            details={
                "message": f"Bulk sent '{data.subject}' to {total_recipients} recipients"
                f" ({len(valid_ids)} threads, {emails_sent} emails)"
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    return BulkSendResponse(bulk_id=bulk_id, threads_created=len(valid_ids), emails_sent=emails_sent)


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
    await get_conference_for_tenant(db, conference_id, tenant_id)

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
        .where((my_threads.c.last_read_at.is_(None)) | (last_msg.c.last_at > my_threads.c.last_read_at))
    )

    return UnreadCountResponse(unread_count=result.scalar() or 0)


@router.post(
    "/recipient-count",
    response_model=RecipientPreviewResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def recipient_count(
    conference_id: UUID,
    data: BulkRecipientFilter,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientPreviewResponse:
    """Preview recipients matching filter criteria without sending."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)
    await _check_messaging_access(db, current_user, conference_id)

    # Resolve applicant-based recipients
    applicant_ids: set[UUID] = set()
    conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)

    if data.all_applicants:
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(CFPPaper.tenant_id == tenant_id, CFPPaper.cfp_id.in_(conference_cfp_ids))
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.applicant_ids:
        applicant_ids.update(data.applicant_ids)

    if data.paper_status:
        result = await db.execute(
            select(CFPPaper.main_speaker_id)
            .where(
                CFPPaper.tenant_id == tenant_id,
                CFPPaper.cfp_id.in_(conference_cfp_ids),
                CFPPaper.status == data.paper_status,
            )
            .distinct()
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.committee_role:
        result = await db.execute(
            select(CFPCommitteeMember.applicant_id).where(
                CFPCommitteeMember.tenant_id == tenant_id,
                CFPCommitteeMember.conference_id == conference_id,
                CFPCommitteeMember.role == data.committee_role,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.recipient_list_id:
        result = await db.execute(
            select(RecipientListMember.applicant_id).where(
                RecipientListMember.list_id == data.recipient_list_id,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    if data.user_role_id:
        result = await db.execute(
            select(UserRoleAssignment.applicant_id).where(
                UserRoleAssignment.user_role_id == data.user_role_id,
                UserRoleAssignment.tenant_id == tenant_id,
            )
        )
        applicant_ids.update(row[0] for row in result.all())

    # Resolve email-only recipients
    email_recipients: list[EmailRecipient] = []

    if data.all_registrations:
        email_recipients.extend(await resolve_registrations(db, tenant_id, conference_id))

    if data.all_sponsors:
        email_recipients.extend(await resolve_sponsors(db, tenant_id, conference_id))

    if data.sponsor_package_id:
        email_recipients.extend(
            await resolve_sponsors(
                db, tenant_id, conference_id, filters={"sponsor_package_ids": [data.sponsor_package_id]}
            )
        )

    if data.dynamic_list_id:
        dl_result = await db.execute(
            select(DynamicRecipientList).where(
                DynamicRecipientList.id == data.dynamic_list_id,
                DynamicRecipientList.tenant_id == tenant_id,
                DynamicRecipientList.conference_id == conference_id,
            )
        )
        dl = dl_result.scalar_one_or_none()
        if dl:
            if dl.target_type == "registration":
                email_recipients.extend(await resolve_registrations(db, tenant_id, conference_id, filters=dl.filters))
            elif dl.target_type == "sponsor":
                email_recipients.extend(await resolve_sponsors(db, tenant_id, conference_id, filters=dl.filters))

    # Convert applicants to preview items
    preview_items: list[RecipientPreviewItem] = []
    if applicant_ids:
        applicant_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id.in_(list(applicant_ids)),
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        for a in applicant_result.scalars().all():
            preview_items.append(
                RecipientPreviewItem(
                    email=a.email,
                    first_name=a.first_name,
                    last_name=a.last_name,
                    source="applicant",
                )
            )

    # Deduplicate email recipients against applicant emails
    applicant_emails = {item.email.lower() for item in preview_items}
    seen: set[str] = set(applicant_emails)
    for r in email_recipients:
        if r.email.lower() not in seen:
            seen.add(r.email.lower())
            preview_items.append(
                RecipientPreviewItem(
                    email=r.email,
                    first_name=r.first_name,
                    last_name=r.last_name,
                    source=r.source,
                    detail=r.company_name or r.booking_option_name or None,
                )
            )

    return RecipientPreviewResponse(total=len(preview_items), items=preview_items[:50])
