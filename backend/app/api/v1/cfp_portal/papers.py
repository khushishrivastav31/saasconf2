"""CFP Applicant Portal - Paper management and browsing endpoints."""

from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.email import send_cospeaker_invitation_email
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.core.file_validation import safe_content_disposition, sanitize_filename, strip_image_metadata, validate_upload
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    CFPStatus,
    CFPTopic,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.review import (
    PaperReview,
)
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.schemas.cfp_portal import (
    PortalAssignedPaperListResponse,
    PortalAssignedPaperResponse,
    PortalCFPResponse,
    PortalConferenceDetailResponse,
    PortalConferenceSummary,
    PortalCospeakerResponse,
    PortalInvitationListResponse,
    PortalInvitationResponse,
    PortalPaperCreateRequest,
    PortalPaperListResponse,
    PortalPaperResponse,
    PortalPaperUpdateRequest,
    PortalSessionTypeResponse,
    PortalTopicResponse,
)

from .shared import (
    _get_applicant_picture_url,
    _get_applicant_video_url,
    _get_paper_video_url,
)

router = APIRouter()


# --- Topics and Conferences browsing ---


@router.get("/portal/topics", response_model=list[PortalTopicResponse])
async def list_portal_topics(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[PortalTopicResponse]:
    """List all topics available for the current tenant."""
    result = await db.execute(select(CFPTopic).where(CFPTopic.tenant_id == current.tenant_id).order_by(CFPTopic.name))
    topics = list(result.scalars().all())
    return [PortalTopicResponse(id=t.id, name=t.name, description=t.description) for t in topics]


@router.get("/portal/conferences", response_model=list[PortalConferenceSummary])
async def list_conferences(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> list[PortalConferenceSummary]:
    """List conferences with open CFPs for the tenant."""
    result = await db.execute(
        select(Conference)
        .where(Conference.tenant_id == current.tenant_id)
        .where(Conference.is_active == True)
        .order_by(Conference.start_date.desc().nulls_last())
    )
    conferences = result.scalars().all()

    # Batch-load all CFPs for all conferences (single query instead of N+1)
    conf_ids = [conf.id for conf in conferences]
    cfps_by_conf: dict = {cid: [] for cid in conf_ids}
    if conf_ids:
        cfp_result = await db.execute(
            select(ConferenceCFP.conference_id, CallForPapers)
            .join(CallForPapers, CallForPapers.id == ConferenceCFP.cfp_id)
            .where(ConferenceCFP.conference_id.in_(conf_ids))
        )
        for conference_id, cfp in cfp_result.all():
            cfps_by_conf[conference_id].append(cfp)

    items = []
    for conf in conferences:
        items.append(
            PortalConferenceSummary(
                id=conf.id,
                name=conf.name,
                abbreviation=conf.abbreviation,
                description=conf.description,
                start_date=conf.start_date,
                end_date=conf.end_date,
                city=conf.city,
                country=conf.country,
                venue_type=conf.venue_type,
                logo_url=conf.logo_url,
                cfps=[PortalCFPResponse.model_validate(cfp) for cfp in cfps_by_conf.get(conf.id, [])],
            )
        )

    return items


@router.get("/portal/conferences/{conference_id}", response_model=PortalConferenceDetailResponse)
async def get_conference_detail(
    conference_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalConferenceDetailResponse:
    """Get conference details with session types for paper submission."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current.tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Load CFPs
    cfp_result = await db.execute(
        select(CallForPapers)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id)
        .where(ConferenceCFP.conference_id == conference.id)
    )
    cfps = cfp_result.scalars().all()

    # Load session types
    st_result = await db.execute(
        select(SessionType).where(
            SessionType.conference_id == conference.id,
            SessionType.is_active == True,
            SessionType.cfp_eligible == True,
        )
    )
    session_types = st_result.scalars().all()

    return PortalConferenceDetailResponse(
        id=conference.id,
        name=conference.name,
        abbreviation=conference.abbreviation,
        cfps=[PortalCFPResponse.model_validate(cfp) for cfp in cfps],
        session_types=[PortalSessionTypeResponse.model_validate(st) for st in session_types],
    )


# --- Papers ---


@router.get("/portal/papers", response_model=PortalPaperListResponse)
async def list_papers(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperListResponse:
    """List all papers where the applicant is main speaker or accepted co-speaker."""
    # Papers as main speaker
    main_result = await db.execute(
        select(CFPPaper)
        .where(
            CFPPaper.tenant_id == current.tenant_id,
            CFPPaper.main_speaker_id == current.applicant_id,
        )
        .order_by(CFPPaper.created_at.desc())
    )
    main_papers = list(main_result.scalars().all())

    # Papers as accepted co-speaker
    cospeaker_result = await db.execute(
        select(CFPPaper)
        .join(CFPPaperCospeaker, CFPPaperCospeaker.paper_id == CFPPaper.id)
        .where(
            CFPPaper.tenant_id == current.tenant_id,
            CFPPaperCospeaker.applicant_id == current.applicant_id,
            CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
        )
        .order_by(CFPPaper.created_at.desc())
    )
    cospeaker_papers = list(cospeaker_result.scalars().all())

    # Merge, deduplicate, maintain order
    seen_ids = set()
    all_papers = []
    for p in main_papers + cospeaker_papers:
        if p.id not in seen_ids:
            seen_ids.add(p.id)
            all_papers.append(p)

    items = [await _build_portal_paper_response(db, paper, current.applicant_id) for paper in all_papers]
    return PortalPaperListResponse(items=items, total=len(items))


@router.get("/portal/papers/{paper_id}", response_model=PortalPaperResponse)
async def get_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Get a single paper (main speaker or accepted co-speaker)."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers", response_model=PortalPaperResponse)
async def create_paper(
    data: PortalPaperCreateRequest,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Create a new paper as draft."""
    # Verify CFP exists and belongs to tenant
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == data.cfp_id,
            CallForPapers.tenant_id == current.tenant_id,
        )
    )
    cfp = cfp_result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError("CFP not found")

    paper = CFPPaper(
        tenant_id=current.tenant_id,
        cfp_id=data.cfp_id,
        main_speaker_id=current.applicant_id,
        session_type_id=data.session_type_id,
        title=data.title,
        abstract_short=data.abstract_short,
        abstract_long=data.abstract_long,
        level=data.level,
        learning_objectives=data.learning_objectives,
        importance=data.importance,
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.flush()

    # Handle co-speakers
    if data.cospeaker_emails:
        await _sync_cospeakers(db, paper, data.cospeaker_emails, current)

    await db.commit()
    await db.refresh(paper)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.put("/portal/papers/{paper_id}", response_model=PortalPaperResponse)
async def update_paper(
    paper_id: str,
    data: PortalPaperUpdateRequest,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Update a paper (only if draft). Main speaker or accepted co-speaker."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be edited")

    is_main = str(paper.main_speaker_id) == str(current.applicant_id)

    update_data = data.model_dump(exclude_unset=True, exclude={"cospeaker_emails"})
    for field, value in update_data.items():
        setattr(paper, field, value)

    # Only main speaker can manage co-speakers
    if data.cospeaker_emails is not None:
        if not is_main:
            raise AuthorizationError("Only the main speaker can manage co-speakers")
        await _sync_cospeakers(db, paper, data.cospeaker_emails, current)

    await db.commit()
    await db.refresh(paper)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers/{paper_id}/submit", response_model=PortalPaperResponse)
async def submit_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Submit a draft paper. Main speaker or accepted co-speaker can submit."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be submitted")

    # --- Validate required fields before submission ---
    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()
    if cfp:
        missing: list[str] = []

        # Check required paper fields
        paper_field_map = {
            "abstract_short": paper.abstract_short,
            "abstract_long": paper.abstract_long,
            "level": paper.level,
            "learning_objectives": paper.learning_objectives,
            "importance": paper.importance,
            "session_type": paper.session_type_id,
            "topics": paper.topics if paper.topics else None,
        }
        for field in cfp.required_paper_fields or []:
            val = paper_field_map.get(field)
            if not val:
                missing.append(f"paper:{field}")

        # Check required speaker fields
        applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == current.applicant_id))
        applicant = applicant_result.scalar_one_or_none()
        if applicant:
            speaker_field_map = {
                "bio": applicant.bio,
                "phone": applicant.phone,
                "title": applicant.title,
                "company": applicant.company,
            }
            for field in cfp.required_speaker_fields or []:
                if field in speaker_field_map:
                    if not speaker_field_map[field]:
                        missing.append(f"speaker:{field}")
                elif field == "picture":
                    pic_url = await _get_applicant_picture_url(db, applicant.id, current.tenant_id)
                    if not pic_url:
                        missing.append("speaker:picture")
                elif field == "video":
                    vid_url = await _get_applicant_video_url(db, applicant.id, current.tenant_id)
                    if not vid_url:
                        missing.append("speaker:video")

        if missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": "Missing required fields",
                    "missing_fields": missing,
                },
            )

    paper.status = PaperStatus.SUBMITTED.value
    paper.submitted_at = utcnow()
    await db.commit()
    await db.refresh(paper)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers/{paper_id}/unsubmit", response_model=PortalPaperResponse)
async def unsubmit_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Revert a submitted paper back to draft. Only allowed when status is 'submitted'."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.SUBMITTED.value:
        raise ValidationError("Only submitted papers can be reverted to draft")

    paper.status = PaperStatus.DRAFT.value
    paper.submitted_at = None
    await db.commit()
    await db.refresh(paper)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.delete("/portal/papers/{paper_id}")
async def delete_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Delete a draft paper."""
    paper = await _get_applicant_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be deleted")

    await db.delete(paper)
    await db.commit()
    return {"message": "Paper deleted"}


# --- Invitations ---


@router.get("/portal/invitations", response_model=PortalInvitationListResponse)
async def list_invitations(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalInvitationListResponse:
    """List co-speaker invitations for the current applicant."""
    result = await db.execute(
        select(CFPPaperCospeaker)
        .where(CFPPaperCospeaker.applicant_id == current.applicant_id)
        .order_by(CFPPaperCospeaker.invited_at.desc())
    )
    cospeaker_rows = result.scalars().all()

    # Batch-load all related data to avoid N+1 queries
    paper_ids = list({row.paper_id for row in cospeaker_rows})
    papers_map: dict = {}
    speakers_map: dict = {}
    cfps_map: dict = {}
    conf_names_map: dict = {}

    if paper_ids:
        # Batch-load papers
        papers_result = await db.execute(select(CFPPaper).where(CFPPaper.id.in_(paper_ids)))
        papers_map = {p.id: p for p in papers_result.scalars().all()}

        # Batch-load main speakers
        speaker_ids = list({p.main_speaker_id for p in papers_map.values() if p.main_speaker_id})
        if speaker_ids:
            speakers_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(speaker_ids)))
            speakers_map = {s.id: s for s in speakers_result.scalars().all()}

        # Batch-load CFPs
        cfp_ids = list({p.cfp_id for p in papers_map.values() if p.cfp_id})
        if cfp_ids:
            cfps_result = await db.execute(select(CallForPapers).where(CallForPapers.id.in_(cfp_ids)))
            cfps_map = {c.id: c for c in cfps_result.scalars().all()}

            # Batch-load conference names via conference_cfps
            conf_result = await db.execute(
                select(ConferenceCFP.cfp_id, Conference.name)
                .join(Conference, Conference.id == ConferenceCFP.conference_id)
                .where(ConferenceCFP.cfp_id.in_(cfp_ids))
            )
            for cfp_id, conf_name in conf_result.all():
                conf_names_map.setdefault(cfp_id, conf_name)

    items = []
    for row in cospeaker_rows:
        paper = papers_map.get(row.paper_id)
        if not paper:
            continue

        main_speaker = speakers_map.get(paper.main_speaker_id)
        cfp = cfps_map.get(paper.cfp_id)
        conference_name = conf_names_map.get(paper.cfp_id)

        items.append(
            PortalInvitationResponse(
                paper_id=paper.id,
                paper_title=paper.title,
                cfp_title=cfp.title if cfp else None,
                conference_name=conference_name,
                main_speaker_first_name=main_speaker.first_name if main_speaker else "Unknown",
                main_speaker_last_name=main_speaker.last_name if main_speaker else "",
                main_speaker_email=main_speaker.email if main_speaker else "",
                invitation_status=row.invitation_status,
                invited_at=row.invited_at,
            )
        )

    return PortalInvitationListResponse(items=items, total=len(items))


@router.post("/portal/invitations/{paper_id}/accept")
async def accept_invitation(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Accept a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == current.applicant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Invitation not found")

    if row.invitation_status != CospeakerInvitationStatus.PENDING.value:
        raise ValidationError("Invitation has already been responded to")

    row.invitation_status = CospeakerInvitationStatus.ACCEPTED.value
    row.responded_at = utcnow()
    await db.commit()

    return {"message": "Invitation accepted"}


@router.post("/portal/invitations/{paper_id}/decline")
async def decline_invitation(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Decline a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == current.applicant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Invitation not found")

    if row.invitation_status != CospeakerInvitationStatus.PENDING.value:
        raise ValidationError("Invitation has already been responded to")

    row.invitation_status = CospeakerInvitationStatus.DECLINED.value
    row.responded_at = utcnow()
    await db.commit()

    return {"message": "Invitation declined"}


# --- Attachments ---

PORTAL_ALLOWED_ENTITY_TYPES = {"applicant_picture", "applicant_video", "paper_video"}


@router.post("/portal/attachments")
async def upload_portal_attachment(
    current: CurrentApplicantDep,
    db: DbSessionDep,
    file: UploadFile = File(...),
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    description: str | None = Form(None),
) -> dict:
    """Upload an attachment (picture/video) for the current applicant or their paper."""
    if entity_type not in PORTAL_ALLOWED_ENTITY_TYPES:
        raise ValidationError(f"Invalid entity_type: {entity_type}")

    # Validate ownership
    if entity_type in ("applicant_picture", "applicant_video"):
        if str(current.applicant_id) != entity_id:
            raise AuthorizationError("You can only upload media for your own profile")
    elif entity_type == "paper_video":
        paper = await _get_applicant_or_cospeaker_paper(db, entity_id, current.applicant_id, current.tenant_id)
        if paper.status != PaperStatus.DRAFT.value:
            raise ValidationError("Can only upload video for draft papers")

    file_data = await file.read()
    file_size = len(file_data)

    from app.config import get_settings

    settings = get_settings()
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File size ({file_size // (1024 * 1024)}MB) exceeds maximum allowed ({settings.MAX_UPLOAD_SIZE_MB}MB)",
        )

    verified_type = validate_upload(file_data, file.content_type or "application/octet-stream", entity_type)
    if entity_type == "applicant_picture":
        file_data = strip_image_metadata(file_data, verified_type)
        file_size = len(file_data)
    safe_filename = sanitize_filename(file.filename or "upload")

    # Delete existing attachment of same type for this entity (only keep latest)
    existing_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current.tenant_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
    )
    for old in existing_result.scalars().all():
        await db.delete(old)

    attachment = Attachment(
        tenant_id=current.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=safe_filename,
        content_type=verified_type,
        file_size=file_size,
        file_data=file_data,
        description=description,
    )
    db.add(attachment)
    await db.commit()

    return {"id": str(attachment.id), "filename": attachment.filename, "file_size": file_size}


@router.get("/portal/attachments/{attachment_id}/download")
async def download_portal_attachment(
    attachment_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> Response:
    """Download an attachment."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.tenant_id == current.tenant_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise NotFoundError("Attachment not found")

    return Response(
        content=attachment.file_data,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": safe_content_disposition(attachment.filename, "inline"),
            "Content-Length": str(attachment.file_size),
        },
    )


# --- Assigned Papers (committee member view) ---


@router.get("/portal/assigned-papers", response_model=PortalAssignedPaperListResponse)
async def list_assigned_papers(
    current: CurrentApplicantDep,
    db: DbSessionDep,
    conference_id: str | None = None,
) -> PortalAssignedPaperListResponse:
    """List papers assigned to the current applicant's committee memberships."""
    # Get all committee memberships for current applicant
    memberships_result = await db.execute(
        select(CFPCommitteeMember).where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    memberships = list(memberships_result.scalars().all())
    member_ids = [m.id for m in memberships]

    if not member_ids:
        return PortalAssignedPaperListResponse(items=[], total=0)

    # Get all assignments for these memberships
    query = (
        select(CFPPaperAssignment)
        .where(
            CFPPaperAssignment.committee_member_id.in_(member_ids),
            CFPPaperAssignment.tenant_id == current.tenant_id,
        )
        .order_by(CFPPaperAssignment.assigned_at.desc())
    )
    result = await db.execute(query)
    assignments = list(result.scalars().all())

    items = []
    for assignment in assignments:
        item = await _build_assigned_paper_response(db, assignment, conference_id)
        if item is not None:
            items.append(item)

    return PortalAssignedPaperListResponse(items=items, total=len(items))


@router.get("/portal/assigned-papers/pending-count")
async def get_pending_assignment_count(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Return the number of assigned papers that have not yet been reviewed."""
    memberships_result = await db.execute(
        select(CFPCommitteeMember.id).where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    member_ids = [row[0] for row in memberships_result.all()]

    if not member_ids:
        return {"pending_count": 0}

    # Count assignments that have no submitted review
    assignments_result = await db.execute(
        select(func.count())
        .select_from(CFPPaperAssignment)
        .outerjoin(
            PaperReview,
            PaperReview.assignment_id == CFPPaperAssignment.id,
        )
        .where(
            CFPPaperAssignment.committee_member_id.in_(member_ids),
            CFPPaperAssignment.tenant_id == current.tenant_id,
            # No review at all, or review still in draft
            (PaperReview.id.is_(None)) | (PaperReview.status != "submitted"),
        )
    )
    count = assignments_result.scalar() or 0

    return {"pending_count": count}


@router.get("/portal/assigned-papers/{paper_id}", response_model=PortalAssignedPaperResponse)
async def get_assigned_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalAssignedPaperResponse:
    """Get a single assigned paper. Respects anonymity setting."""
    # Verify the current applicant has a committee membership with an assignment to this paper
    memberships_result = await db.execute(
        select(CFPCommitteeMember.id).where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    member_ids = [row[0] for row in memberships_result]

    if not member_ids:
        raise NotFoundError("Assigned paper not found")

    assignment_result = await db.execute(
        select(CFPPaperAssignment).where(
            CFPPaperAssignment.paper_id == paper_id,
            CFPPaperAssignment.committee_member_id.in_(member_ids),
            CFPPaperAssignment.tenant_id == current.tenant_id,
        )
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Assigned paper not found")

    item = await _build_assigned_paper_response(db, assignment)
    if item is None:
        raise NotFoundError("Assigned paper not found")
    return item


# ──────────────────────────────────────────────
#  HELPERS (papers-specific)
# ──────────────────────────────────────────────


async def _get_applicant_paper(db: AsyncSession, paper_id: str, applicant_id, tenant_id) -> CFPPaper:
    """Load a paper owned by the current applicant (main speaker only)."""
    result = await db.execute(
        select(CFPPaper).where(
            CFPPaper.id == paper_id,
            CFPPaper.main_speaker_id == applicant_id,
            CFPPaper.tenant_id == tenant_id,
        )
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise NotFoundError("Paper not found")
    return paper


async def _get_applicant_or_cospeaker_paper(db: AsyncSession, paper_id: str, applicant_id, tenant_id) -> CFPPaper:
    """Load a paper where the applicant is main speaker or accepted co-speaker."""
    # Try as main speaker first
    result = await db.execute(
        select(CFPPaper).where(
            CFPPaper.id == paper_id,
            CFPPaper.main_speaker_id == applicant_id,
            CFPPaper.tenant_id == tenant_id,
        )
    )
    paper = result.scalar_one_or_none()
    if paper:
        return paper

    # Try as accepted co-speaker
    result = await db.execute(
        select(CFPPaper)
        .join(CFPPaperCospeaker, CFPPaperCospeaker.paper_id == CFPPaper.id)
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == tenant_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
            CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
        )
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise NotFoundError("Paper not found")
    return paper


async def _build_portal_paper_response(
    db: AsyncSession, paper: CFPPaper, current_applicant_id=None
) -> PortalPaperResponse:
    """Build a PortalPaperResponse from a CFPPaper model."""
    # Load CFP
    cfp_title = None
    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()
    if cfp:
        cfp_title = cfp.title

    # Load conference
    conference_id = None
    conference_name = None
    conf_result = await db.execute(
        select(Conference)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == paper.cfp_id)
        .limit(1)
    )
    conf = conf_result.scalar_one_or_none()
    if conf:
        conference_id = conf.id
        conference_name = conf.name

    # Session type
    session_type_name = None
    if paper.session_type_id:
        st_result = await db.execute(select(SessionType).where(SessionType.id == paper.session_type_id))
        st = st_result.scalar_one_or_none()
        if st:
            session_type_name = st.name

    # Main speaker info
    is_main_speaker = True
    main_speaker_first_name = None
    main_speaker_last_name = None
    if current_applicant_id and str(paper.main_speaker_id) != str(current_applicant_id):
        is_main_speaker = False
    main_speaker_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == paper.main_speaker_id))
    main_speaker = main_speaker_result.scalar_one_or_none()
    if main_speaker:
        main_speaker_first_name = main_speaker.first_name
        main_speaker_last_name = main_speaker.last_name

    # Co-speakers
    cospeaker_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper.id))
    cospeaker_rows = cospeaker_result.scalars().all()

    # Batch-load all cospeaker applicants in one query
    cospeaker_applicant_ids = [row.applicant_id for row in cospeaker_rows if row.applicant_id]
    applicants_map: dict = {}
    if cospeaker_applicant_ids:
        app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(cospeaker_applicant_ids)))
        applicants_map = {a.id: a for a in app_result.scalars().all()}

    cospeakers = []
    for row in cospeaker_rows:
        applicant = applicants_map.get(row.applicant_id)
        if applicant:
            cospeakers.append(
                PortalCospeakerResponse(
                    applicant_id=applicant.id,
                    first_name=applicant.first_name,
                    last_name=applicant.last_name,
                    email=applicant.email,
                    invitation_status=row.invitation_status,
                    invited_at=row.invited_at,
                    responded_at=row.responded_at,
                )
            )

    # Video
    video_url = await _get_paper_video_url(db, paper.id, paper.tenant_id)

    # Hide accepted/rejected status from portal users until CFP is completed.
    # They see "final_consideration" until the admin completes the CFP.
    portal_status = paper.status
    if paper.status in (PaperStatus.ACCEPTED.value, PaperStatus.REJECTED.value):
        cfp_status = cfp.status if cfp else None
        if cfp_status != CFPStatus.COMPLETED.value:
            portal_status = PaperStatus.FINAL_CONSIDERATION.value

    return PortalPaperResponse(
        id=paper.id,
        cfp_id=paper.cfp_id,
        cfp_title=cfp_title,
        conference_id=conference_id,
        conference_name=conference_name,
        session_type_id=paper.session_type_id,
        session_type_name=session_type_name,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
        importance=paper.importance,
        status=portal_status,
        video_url=video_url,
        is_main_speaker=is_main_speaker,
        main_speaker_first_name=main_speaker_first_name,
        main_speaker_last_name=main_speaker_last_name,
        cospeakers=cospeakers,
        submitted_at=paper.submitted_at,
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


async def _sync_cospeakers(
    db: AsyncSession,
    paper: CFPPaper,
    cospeaker_emails: list[str],
    current: CurrentApplicantDep,
) -> None:
    """Sync co-speakers for a paper based on email list.

    Preserves invitation status for existing co-speakers and only sends
    invitation emails to newly added ones.
    """
    if len(cospeaker_emails) > 3:
        raise ValidationError("Maximum 3 co-speakers allowed")

    # Build map of existing co-speakers: applicant_id -> record
    existing_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper.id))
    existing_by_applicant: dict = {row.applicant_id: row for row in existing_result.scalars().all()}

    # Resolve all emails to applicant IDs first
    new_applicants: list[tuple[int, CFPApplicant]] = []
    for i, email in enumerate(cospeaker_emails):
        normalized = email.strip().lower()
        app_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.tenant_id == current.tenant_id,
                func.lower(CFPApplicant.email) == normalized,
            )
        )
        applicant = app_result.scalar_one_or_none()
        if not applicant:
            raise ValidationError(f"No registered applicant found with email: {email}")

        if applicant.id == current.applicant_id:
            raise ValidationError("You cannot add yourself as a co-speaker")

        new_applicants.append((i, applicant))

    # Determine which applicant IDs to keep
    new_applicant_ids = {a.id for _, a in new_applicants}

    # Delete co-speakers that are no longer in the list
    for applicant_id, row in existing_by_applicant.items():
        if applicant_id not in new_applicant_ids:
            await db.delete(row)

    # Add or update co-speakers
    # Pre-load conference info and tenant info once (only needed if there are new additions)
    conference_name: str | None = None
    conference_id: UUID | None = None
    conf_support_email: str | None = None
    tenant_slug: str | None = None
    company_name: str | None = None

    for sort_order, applicant in new_applicants:
        existing_row = existing_by_applicant.get(applicant.id)

        if existing_row:
            # Existing co-speaker: just update sort order, preserve invitation status
            existing_row.sort_order = sort_order
        else:
            # New co-speaker: create record and send invitation
            cospeaker = CFPPaperCospeaker(
                paper_id=paper.id,
                applicant_id=applicant.id,
                sort_order=sort_order,
                invitation_status=CospeakerInvitationStatus.PENDING.value,
            )
            db.add(cospeaker)

            # Load conference info on first new addition
            if conference_name is None:
                conf_result = await db.execute(
                    select(Conference)
                    .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
                    .where(ConferenceCFP.cfp_id == paper.cfp_id)
                    .limit(1)
                )
                conf = conf_result.scalar_one_or_none()
                conference_name = conf.name if conf else "Conference"
                conference_id = conf.id if conf else None
                conf_support_email = conf.support_email if conf else None

            # Resolve tenant info for email URLs
            if tenant_slug is None:
                tenant_result = await db.execute(select(Tenant.slug, Tenant.name).where(Tenant.id == current.tenant_id))
                row = tenant_result.one()
                tenant_slug = row[0]
                company_name = row[1]

            await send_cospeaker_invitation_email(
                db,
                email=applicant.email,
                paper_title=paper.title,
                conference_id=conference_id,
                conference_name=conference_name,
                company_name=company_name,
                main_speaker_name=f"{current.applicant.first_name} {current.applicant.last_name}",
                first_name=applicant.first_name,
                last_name=applicant.last_name,
                tenant_slug=tenant_slug,
                support_email=conf_support_email or "",
            )

    await db.flush()


async def _build_assigned_paper_response(
    db, assignment: CFPPaperAssignment, conference_id_filter: str | None = None
) -> PortalAssignedPaperResponse | None:
    """Build a PortalAssignedPaperResponse from an assignment."""
    paper_result = await db.execute(
        select(CFPPaper).options(selectinload(CFPPaper.topics)).where(CFPPaper.id == assignment.paper_id)
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        return None

    # Get conference info
    conf_id = None
    conf_name = None
    conf_result = await db.execute(
        select(Conference)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == paper.cfp_id)
        .limit(1)
    )
    conf = conf_result.scalar_one_or_none()
    if conf:
        conf_id = conf.id
        conf_name = conf.name

    # Filter by conference if requested
    if conference_id_filter and str(conf_id) != conference_id_filter:
        return None

    # Get CFP title
    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()

    # Session type
    session_type_name = None
    if paper.session_type_id:
        st_result = await db.execute(select(SessionType).where(SessionType.id == paper.session_type_id))
        st = st_result.scalar_one_or_none()
        if st:
            session_type_name = st.name

    # Handle anonymity — respect both the per-assignment flag and the CFP's current setting
    is_anonymous = assignment.is_anonymous or (cfp is not None and cfp.is_anonymous_review)
    if is_anonymous:
        main_speaker_first_name = None
        main_speaker_last_name = None
        cospeakers = []
    else:
        main_speaker_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == paper.main_speaker_id))
        main_speaker = main_speaker_result.scalar_one_or_none()
        main_speaker_first_name = main_speaker.first_name if main_speaker else None
        main_speaker_last_name = main_speaker.last_name if main_speaker else None

        cospeaker_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper.id))
        cospeaker_rows = cospeaker_result.scalars().all()

        # Batch-load all cospeaker applicants in one query
        cospeaker_applicant_ids = [row.applicant_id for row in cospeaker_rows if row.applicant_id]
        applicants_map: dict = {}
        if cospeaker_applicant_ids:
            app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(cospeaker_applicant_ids)))
            applicants_map = {a.id: a for a in app_result.scalars().all()}

        cospeakers = []
        for row in cospeaker_rows:
            applicant = applicants_map.get(row.applicant_id)
            if applicant:
                cospeakers.append(
                    PortalCospeakerResponse(
                        applicant_id=applicant.id,
                        first_name=applicant.first_name,
                        last_name=applicant.last_name,
                        email=applicant.email,
                        invitation_status=row.invitation_status,
                        invited_at=row.invited_at,
                        responded_at=row.responded_at,
                    )
                )

    topics = [PortalTopicResponse(id=t.id, name=t.name, description=t.description) for t in paper.topics]

    # Get video URL
    video_url = await _get_paper_video_url(db, paper.id, paper.tenant_id)

    # Get review status for this assignment
    review_status = None
    review_result = await db.execute(
        select(PaperReview.status).where(
            PaperReview.assignment_id == assignment.id,
        )
    )
    review_row = review_result.scalar_one_or_none()
    if review_row:
        review_status = review_row

    # Hide accepted/rejected status from portal users until CFP is completed
    portal_status = paper.status
    if paper.status in (PaperStatus.ACCEPTED.value, PaperStatus.REJECTED.value):
        cfp_status = cfp.status if cfp else None
        if cfp_status != CFPStatus.COMPLETED.value:
            portal_status = PaperStatus.FINAL_CONSIDERATION.value

    return PortalAssignedPaperResponse(
        id=paper.id,
        assignment_id=assignment.id,
        is_anonymous=is_anonymous,
        assigned_at=assignment.assigned_at,
        conference_id=conf_id,
        conference_name=conf_name,
        cfp_id=paper.cfp_id,
        cfp_title=cfp.title if cfp else None,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
        importance=paper.importance,
        status=portal_status,
        session_type_name=session_type_name,
        topics=topics,
        video_url=video_url,
        main_speaker_first_name=main_speaker_first_name,
        main_speaker_last_name=main_speaker_last_name,
        cospeakers=cospeakers,
        review_status=review_status,
    )
