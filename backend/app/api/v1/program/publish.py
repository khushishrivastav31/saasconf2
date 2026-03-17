"""Program publication endpoints: preview, publish, update, and sessions export."""

import uuid
from collections import defaultdict
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.csv_export import csv_response
from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import ValidationError
from app.models.associations import ConferenceCFP
from app.models.audit import AuditLog
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
    CFPStatus,
    PaperStatus,
)
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import EmailTemplate, SessionType
from app.schemas.email_template import EmailTemplateType
from app.schemas.program import (
    PaperPreviewItem,
    ProgramPublishPreview,
    ProgramPublishResponse,
)

from ._shared import MODULE_CODE

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_conference_papers(db, conference_id: UUID, tenant_id: UUID):
    """Get all non-draft papers for this conference's CFPs."""
    conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
    result = await db.execute(
        select(CFPPaper).where(
            CFPPaper.tenant_id == tenant_id,
            CFPPaper.cfp_id.in_(conference_cfp_ids),
            CFPPaper.status != PaperStatus.DRAFT.value,
        )
    )
    return result.scalars().all()


async def _get_session_paper_ids(db, conference_id: UUID, tenant_id: UUID) -> set[UUID]:
    """Get IDs of all papers currently assigned to sessions in this conference."""
    result = await db.execute(
        select(ProgramSession.paper_id).where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
            ProgramSession.paper_id.isnot(None),
        )
    )
    return {row[0] for row in result.all()}


async def _get_speaker_names(db, applicant_ids: set[UUID], tenant_id: UUID) -> dict[UUID, str]:
    """Resolve applicant IDs to display names."""
    if not applicant_ids:
        return {}
    result = await db.execute(
        select(CFPApplicant.id, CFPApplicant.first_name, CFPApplicant.last_name).where(
            CFPApplicant.id.in_(list(applicant_ids)),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    return {row.id: f"{row.first_name} {row.last_name}".strip() for row in result.all()}


def _build_paper_list_html(titles: list[str]) -> str:
    """Build an HTML unordered list from paper titles."""
    if not titles:
        return ""
    items = "".join(f"<li>{t}</li>" for t in titles)
    return f"<ul>{items}</ul>"


def _build_speaker_paper_map(papers, session_paper_ids: set[UUID]) -> dict[UUID, dict[str, list[str]]]:
    """Build a map: applicant_id -> {accepted: [titles], rejected: [titles]}.

    Includes both main speakers and co-speakers.
    """
    speaker_papers: dict[UUID, dict[str, list[str]]] = defaultdict(lambda: {"accepted": [], "rejected": []})

    for paper in papers:
        is_accepted = paper.id in session_paper_ids
        key = "accepted" if is_accepted else "rejected"

        # Main speaker
        speaker_papers[paper.main_speaker_id][key].append(paper.title)

        # Co-speakers
        for cs in paper.cospeaker_associations:
            speaker_papers[cs.applicant_id][key].append(paper.title)

    return dict(speaker_papers)


async def _get_email_template(
    db,
    tenant_id: UUID,
    conference_id: UUID,
    template_type: str,
) -> tuple[str, str]:
    """Fetch a customised email template or fall back to the default.

    Returns (subject, body_html).
    """
    from app.api.v1.settings.email_templates import DEFAULT_TEMPLATES

    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == conference_id,
            EmailTemplate.tenant_id == tenant_id,
            EmailTemplate.template_type == template_type,
        )
    )
    template = result.scalar_one_or_none()

    if template and template.is_active:
        return template.subject, template.body_html

    # Fall back to built-in default
    default = DEFAULT_TEMPLATES.get(template_type, {})
    return (
        default.get("subject", ""),
        default.get("body_html", ""),
    )


async def _send_consolidated_notifications(
    db,
    tenant_id: UUID,
    conference_id: UUID,
    conference_name: str,
    current_user_id: UUID,
    speaker_paper_map: dict[UUID, dict[str, list[str]]],
) -> int:
    """Create message threads with consolidated acceptance/rejection messages.

    Returns total number of notification threads created.
    """
    from app.api.v1.messaging._shared import substitute_template_variables

    # Fetch applicant details
    all_ids = list(speaker_paper_map.keys())
    if not all_ids:
        return 0
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id.in_(all_ids),
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicants = {a.id: a for a in result.scalars().all()}

    # Fetch configurable templates once
    acceptance_subject_tpl, acceptance_body_tpl = await _get_email_template(
        db,
        tenant_id,
        conference_id,
        EmailTemplateType.PAPER_ACCEPTANCE,
    )
    rejection_subject_tpl, rejection_body_tpl = await _get_email_template(
        db,
        tenant_id,
        conference_id,
        EmailTemplateType.PAPER_REJECTION,
    )

    now = datetime.now(UTC)
    bulk_id = uuid.uuid4()
    threads_created = 0

    for applicant_id, paper_groups in speaker_paper_map.items():
        applicant = applicants.get(applicant_id)
        if not applicant:
            continue

        accepted_titles = paper_groups.get("accepted", [])
        rejected_titles = paper_groups.get("rejected", [])

        # Send acceptance message
        if accepted_titles:
            paper_list_html = _build_paper_list_html(accepted_titles)
            subject = substitute_template_variables(
                acceptance_subject_tpl,
                conference_name=conference_name,
                first_name=applicant.first_name,
                last_name=applicant.last_name or "",
            )
            body = substitute_template_variables(
                acceptance_body_tpl,
                first_name=applicant.first_name,
                last_name=applicant.last_name or "",
                email=applicant.email,
                conference_name=conference_name,
                paper_list=paper_list_html,
            )
            await _create_notification_thread(
                db,
                tenant_id,
                conference_id,
                current_user_id,
                applicant_id,
                subject,
                body,
                bulk_id,
                now,
            )
            threads_created += 1

        # Send rejection message
        if rejected_titles:
            paper_list_html = _build_paper_list_html(rejected_titles)
            subject = substitute_template_variables(
                rejection_subject_tpl,
                conference_name=conference_name,
                first_name=applicant.first_name,
                last_name=applicant.last_name or "",
            )
            body = substitute_template_variables(
                rejection_body_tpl,
                first_name=applicant.first_name,
                last_name=applicant.last_name or "",
                email=applicant.email,
                conference_name=conference_name,
                paper_list=paper_list_html,
            )
            await _create_notification_thread(
                db,
                tenant_id,
                conference_id,
                current_user_id,
                applicant_id,
                subject,
                body,
                bulk_id,
                now,
            )
            threads_created += 1

    return threads_created


async def _create_notification_thread(
    db,
    tenant_id: UUID,
    conference_id: UUID,
    sender_user_id: UUID,
    recipient_applicant_id: UUID,
    subject: str,
    body_html: str,
    bulk_id: UUID,
    now: datetime,
) -> None:
    """Create a single notification thread with message and participants."""
    thread = MessageThread(
        tenant_id=tenant_id,
        conference_id=conference_id,
        subject=subject,
        bulk_id=bulk_id,
    )
    db.add(thread)
    await db.flush()

    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=sender_user_id,
            last_read_at=now,
        )
    )
    db.add(
        MessageParticipant(
            tenant_id=tenant_id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=recipient_applicant_id,
        )
    )
    db.add(
        Message(
            tenant_id=tenant_id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=sender_user_id,
            body_html=body_html,
        )
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/publish/preview",
    response_model=ProgramPublishPreview,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def publish_preview(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ProgramPublishPreview:
    """Preview what publishing the program will do (dry run)."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    session_paper_ids = await _get_session_paper_ids(db, conference_id, current_user.tenant_id)
    papers = await _get_conference_papers(db, conference_id, current_user.tenant_id)
    is_update = conference.program_published_at is not None

    # Collect speaker names
    speaker_ids: set[UUID] = set()
    for paper in papers:
        all_speakers = [paper.main_speaker_id] + [cs.applicant_id for cs in paper.cospeaker_associations]
        speaker_ids.update(all_speakers)
    speaker_names = await _get_speaker_names(db, speaker_ids, current_user.tenant_id)

    if is_update:
        # Differential preview: only show papers whose status will actually change
        accepted_papers: list[PaperPreviewItem] = []
        rejected_papers: list[PaperPreviewItem] = []

        changed_papers = []
        changed_accepted_ids: set[UUID] = set()

        for paper in papers:
            name = speaker_names.get(paper.main_speaker_id, "Unknown")
            item = PaperPreviewItem(id=paper.id, title=paper.title, speaker_name=name)
            if paper.id in session_paper_ids:
                if paper.status != PaperStatus.ACCEPTED.value:
                    accepted_papers.append(item)
                    changed_papers.append(paper)
                    changed_accepted_ids.add(paper.id)
            else:
                if paper.status == PaperStatus.ACCEPTED.value:
                    rejected_papers.append(item)
                    changed_papers.append(paper)

        # Count only affected speakers
        if changed_papers:
            speaker_paper_map = _build_speaker_paper_map(changed_papers, changed_accepted_ids)
            speakers_to_notify = len(speaker_paper_map)
        else:
            speakers_to_notify = 0
    else:
        # Initial publish: show all papers
        accepted_papers = []
        rejected_papers = []

        for paper in papers:
            name = speaker_names.get(paper.main_speaker_id, "Unknown")
            item = PaperPreviewItem(id=paper.id, title=paper.title, speaker_name=name)
            if paper.id in session_paper_ids:
                accepted_papers.append(item)
            else:
                rejected_papers.append(item)

        speaker_paper_map = _build_speaker_paper_map(papers, session_paper_ids)
        speakers_to_notify = len(speaker_paper_map)

    return ProgramPublishPreview(
        papers_to_accept=len(accepted_papers),
        papers_to_reject=len(rejected_papers),
        speakers_to_notify=speakers_to_notify,
        already_published=is_update,
        accepted_papers=accepted_papers,
        rejected_papers=rejected_papers,
    )


@router.post(
    "/publish",
    response_model=ProgramPublishResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def publish_program(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramPublishResponse:
    """Publish the program: update paper statuses and send notifications."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    session_paper_ids = await _get_session_paper_ids(db, conference_id, tenant_id)
    papers = await _get_conference_papers(db, conference_id, tenant_id)

    if not papers:
        raise ValidationError("No papers found for this conference")

    # Step 1: Update paper statuses
    papers_accepted = 0
    papers_rejected = 0
    for paper in papers:
        if paper.id in session_paper_ids:
            if paper.status != PaperStatus.ACCEPTED.value:
                paper.status = PaperStatus.ACCEPTED.value
            papers_accepted += 1
        else:
            if paper.status != PaperStatus.REJECTED.value:
                paper.status = PaperStatus.REJECTED.value
            papers_rejected += 1

    # Step 2: Update CFP statuses to COMPLETED
    conference_cfp_ids = select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id)
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id.in_(conference_cfp_ids),
            CallForPapers.tenant_id == tenant_id,
        )
    )
    for cfp in cfp_result.scalars().all():
        if cfp.status != CFPStatus.COMPLETED.value:
            cfp.status = CFPStatus.COMPLETED.value

    # Step 3: Send consolidated notifications
    speaker_paper_map = _build_speaker_paper_map(papers, session_paper_ids)
    notifications_sent = await _send_consolidated_notifications(
        db,
        tenant_id,
        conference_id,
        conference.name,
        current_user.user_id,
        speaker_paper_map,
    )

    # Step 4: Update conference published timestamp
    now = datetime.now(UTC)
    conference.program_published_at = now

    # Step 5: Audit log
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="program.publish",
            resource_type="conference",
            resource_id=str(conference_id),
            details={
                "papers_accepted": papers_accepted,
                "papers_rejected": papers_rejected,
                "notifications_sent": notifications_sent,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    return ProgramPublishResponse(
        papers_accepted=papers_accepted,
        papers_rejected=papers_rejected,
        notifications_sent=notifications_sent,
        published_at=now,
    )


@router.post(
    "/update",
    response_model=ProgramPublishResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_program(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramPublishResponse:
    """Update a previously published program with differential notifications."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    if conference.program_published_at is None:
        raise ValidationError("Program has not been published yet. Use publish instead.")

    session_paper_ids = await _get_session_paper_ids(db, conference_id, tenant_id)
    papers = await _get_conference_papers(db, conference_id, tenant_id)

    if not papers:
        raise ValidationError("No papers found for this conference")

    # Determine what changed since last publish
    # Papers in sessions but not yet ACCEPTED → newly accepted
    # Papers ACCEPTED but not in sessions → newly rejected
    newly_accepted_papers = []
    newly_rejected_papers = []
    papers_accepted = 0
    papers_rejected = 0

    for paper in papers:
        if paper.id in session_paper_ids:
            papers_accepted += 1
            if paper.status != PaperStatus.ACCEPTED.value:
                newly_accepted_papers.append(paper)
                paper.status = PaperStatus.ACCEPTED.value
        else:
            papers_rejected += 1
            if paper.status == PaperStatus.ACCEPTED.value:
                newly_rejected_papers.append(paper)
                paper.status = PaperStatus.REJECTED.value
            elif paper.status != PaperStatus.REJECTED.value:
                paper.status = PaperStatus.REJECTED.value

    # Only notify for changes
    changed_papers = newly_accepted_papers + newly_rejected_papers
    if changed_papers:
        changed_session_ids = {p.id for p in newly_accepted_papers}
        speaker_paper_map = _build_speaker_paper_map(changed_papers, changed_session_ids)
        notifications_sent = await _send_consolidated_notifications(
            db,
            tenant_id,
            conference_id,
            conference.name,
            current_user.user_id,
            speaker_paper_map,
        )
    else:
        notifications_sent = 0

    # Update timestamp
    now = datetime.now(UTC)
    conference.program_published_at = now

    # Audit log
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="program.update",
            resource_type="conference",
            resource_id=str(conference_id),
            details={
                "papers_accepted": papers_accepted,
                "papers_rejected": papers_rejected,
                "newly_accepted": len(newly_accepted_papers),
                "newly_rejected": len(newly_rejected_papers),
                "notifications_sent": notifications_sent,
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()

    return ProgramPublishResponse(
        papers_accepted=papers_accepted,
        papers_rejected=papers_rejected,
        notifications_sent=notifications_sent,
        published_at=now,
    )


@router.get(
    "/sessions/export",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def export_sessions(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Export all sessions as CSV for program designers."""
    tenant_id = current_user.tenant_id
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)
    await check_conference_admin(conference_id, current_user, db)

    # Fetch all sessions
    result = await db.execute(
        select(ProgramSession).where(
            ProgramSession.conference_id == conference_id,
            ProgramSession.tenant_id == tenant_id,
        )
    )
    sessions = result.scalars().all()

    # Fetch all days
    days_result = await db.execute(
        select(ProgramDay)
        .where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == tenant_id,
        )
        .order_by(ProgramDay.sort_order)
    )
    days = {d.id: d for d in days_result.scalars().all()}

    # Fetch all time slots
    day_ids = list(days.keys())
    slots_result = await db.execute(
        select(ProgramTimeSlot)
        .where(ProgramTimeSlot.program_day_id.in_(day_ids) if day_ids else False)
        .order_by(ProgramTimeSlot.sort_order)
    )
    slots = {s.id: s for s in slots_result.scalars().all()}

    # Fetch all tracks
    tracks_result = await db.execute(
        select(ProgramTrack).where(
            ProgramTrack.conference_id == conference_id,
            ProgramTrack.tenant_id == tenant_id,
        )
    )
    tracks = {t.id: t for t in tracks_result.scalars().all()}

    # Fetch session types
    type_ids = [s.session_type_id for s in sessions if s.session_type_id]
    type_map: dict[UUID, str] = {}
    if type_ids:
        type_result = await db.execute(select(SessionType.id, SessionType.name).where(SessionType.id.in_(type_ids)))
        type_map = {row.id: row.name for row in type_result.all()}

    # Fetch papers and speakers
    paper_ids = [s.paper_id for s in sessions if s.paper_id]
    paper_map: dict[UUID, CFPPaper] = {}
    speaker_map: dict[UUID, CFPApplicant] = {}
    cospeaker_map: dict[UUID, list[str]] = {}

    if paper_ids:
        paper_result = await db.execute(select(CFPPaper).where(CFPPaper.id.in_(paper_ids)))
        for paper in paper_result.scalars().all():
            paper_map[paper.id] = paper

        # Fetch main speakers
        speaker_ids = [p.main_speaker_id for p in paper_map.values()]
        if speaker_ids:
            speaker_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(speaker_ids)))
            for a in speaker_result.scalars().all():
                speaker_map[a.id] = a

        # Fetch co-speakers
        cospeaker_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id.in_(paper_ids)))
        cs_applicant_ids: set[UUID] = set()
        cs_by_paper: dict[UUID, list[UUID]] = defaultdict(list)
        for cs in cospeaker_result.scalars().all():
            cs_by_paper[cs.paper_id].append(cs.applicant_id)
            cs_applicant_ids.add(cs.applicant_id)

        cs_names: dict[UUID, str] = {}
        if cs_applicant_ids:
            cs_name_result = await db.execute(
                select(CFPApplicant.id, CFPApplicant.first_name, CFPApplicant.last_name).where(
                    CFPApplicant.id.in_(list(cs_applicant_ids))
                )
            )
            cs_names = {row.id: f"{row.first_name} {row.last_name}".strip() for row in cs_name_result.all()}

        for paper_id, cs_ids in cs_by_paper.items():
            cospeaker_map[paper_id] = [cs_names.get(cid, "") for cid in cs_ids if cs_names.get(cid)]

    # Fetch custom form fields for dynamic CSV columns
    custom_fields: list[PaperFormField] = []
    schema_result = await db.execute(
        select(ConferencePaperFormSchema).where(
            ConferencePaperFormSchema.conference_id == conference_id,
            ConferencePaperFormSchema.tenant_id == tenant_id,
        )
    )
    schema = schema_result.scalar_one_or_none()
    if schema:
        fields_result = await db.execute(
            select(PaperFormField).where(PaperFormField.schema_id == schema.id).order_by(PaperFormField.display_order)
        )
        custom_fields = list(fields_result.scalars().all())

    # Build CSV header with dynamic custom field columns
    header = [
        "Day",
        "Date",
        "Start Time",
        "End Time",
        "Track/Room",
        "Session Title",
        "Session Type",
        "Speaker Name",
        "Speaker Email",
        "Speaker Company",
        "Co-Speakers",
        "Paper Title",
        "Paper Abstract",
        "Level",
        "Learning Objectives",
        "Paper Status",
    ]
    for cf in custom_fields:
        header.append(cf.label)

    sorted_sessions = sorted(
        sessions,
        key=lambda s: (slots.get(s.start_slot_id, ProgramTimeSlot()).sort_order if slots.get(s.start_slot_id) else 0,),
    )

    def _map_session_row(session: ProgramSession) -> list[str]:
        slot = slots.get(session.start_slot_id)
        track = tracks.get(session.start_track_id) if session.start_track_id else None
        day = days.get(slot.program_day_id) if slot else None
        paper = paper_map.get(session.paper_id) if session.paper_id else None
        speaker = speaker_map.get(paper.main_speaker_id) if paper else None
        session_type_name = type_map.get(session.session_type_id, "") if session.session_type_id else ""

        row = [
            day.name or f"Day {day.sort_order + 1}" if day else "",
            str(day.date) if day else "",
            str(slot.start_time) if slot else "",
            str(slot.end_time) if slot else "",
            track.name if track else "All Tracks",
            session.title,
            session_type_name,
            f"{speaker.first_name} {speaker.last_name}".strip() if speaker else "",
            speaker.email if speaker else "",
            speaker.company or "" if speaker else "",
            ", ".join(cospeaker_map.get(session.paper_id, [])) if session.paper_id else "",
            paper.title if paper else "",
            paper.abstract_short or "" if paper else "",
            paper.level or "" if paper else "",
            paper.learning_objectives or "" if paper else "",
            paper.status or "" if paper else "",
        ]
        # Add custom field values
        custom_answers = paper.custom_field_answers if paper and paper.custom_field_answers else {}
        for cf in custom_fields:
            val = custom_answers.get(cf.field_key, "")
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val)
            row.append(str(val) if val else "")
        return row

    filename = f"program-sessions-{conference.name.replace(' ', '-').lower()}.csv"

    return csv_response(
        headers=header,
        rows=sorted_sessions,
        row_mapper=_map_session_row,
        filename=filename,
    )
