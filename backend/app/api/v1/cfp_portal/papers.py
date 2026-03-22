"""CFP Applicant Portal - Paper CRUD, submission, and assigned-paper endpoints."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.email import send_cospeaker_invitation_email, send_email_background
from app.core.exceptions import AuthorizationError, NotFoundError, SubmissionValidationError, ValidationError
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    CFPStatus,
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
    PortalCospeakerResponse,
    PortalPaperCreateRequest,
    PortalPaperListResponse,
    PortalPaperResponse,
    PortalPaperUpdateRequest,
    PortalTopicResponse,
)

from .shared import (
    _get_applicant_picture_url,
    _get_applicant_video_url,
    _get_paper_video_url,
)

router = APIRouter()


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
        form_variant_id=data.form_variant_id,
        title=data.title,
        abstract_short=data.abstract_short,
        abstract_long=data.abstract_long,
        level=data.level,
        learning_objectives=data.learning_objectives,
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
            raise SubmissionValidationError(
                "Missing required fields",
                missing_fields=missing,
            )

    # --- Validate character limits from form schema config ---
    from app.api.v1.cfp._paper_helpers import strip_html_for_char_count
    from app.models.form_schema import ConferencePaperFormSchema
    from app.models.paper_form_variant import PaperFormVariant

    builtin_cfg: dict = {}
    if paper.form_variant_id:
        fv_result = await db.execute(select(PaperFormVariant).where(PaperFormVariant.id == paper.form_variant_id))
        variant = fv_result.scalar_one_or_none()
        if variant and variant.builtin_fields_config:
            builtin_cfg = variant.builtin_fields_config
    if not builtin_cfg:
        # Get conference_id via the CFP junction table (papers don't have conference_id directly)
        conf_id_result = await db.execute(
            select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == paper.cfp_id)
        )
        conf_id = conf_id_result.scalar_one_or_none()
        schema_result = (
            await db.execute(
                select(ConferencePaperFormSchema).where(ConferencePaperFormSchema.conference_id == conf_id)
            )
            if conf_id
            else None
        )
        schema = schema_result.scalar_one_or_none() if schema_result else None
        if schema and schema.builtin_fields_config:
            builtin_cfg = schema.builtin_fields_config

    if builtin_cfg:
        char_limit_fields = {
            "title": ("Title", paper.title, False),
            "abstract_short": ("Short Abstract", paper.abstract_short, True),
            "abstract_long": ("Detailed Abstract", paper.abstract_long, True),
            "learning_objectives": ("Learning Objectives", paper.learning_objectives, True),
        }
        char_errors: list[str] = []
        for field_key, (label, value, is_html) in char_limit_fields.items():
            cfg = builtin_cfg.get(field_key, {})
            if not cfg.get("visible", True):
                continue
            plain = strip_html_for_char_count(value) if is_html else (value or "").strip()
            min_c = cfg.get("min_chars")
            max_c = cfg.get("max_chars")
            if min_c is not None and len(plain) < min_c:
                char_errors.append(f"{label} must be at least {min_c} characters (currently {len(plain)})")
            if max_c is not None and len(plain) > max_c:
                char_errors.append(f"{label} must be at most {max_c} characters (currently {len(plain)})")
        if char_errors:
            raise SubmissionValidationError(
                "Character limit validation failed",
                char_errors=char_errors,
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

    # Form variant
    form_variant_name = None
    if paper.form_variant_id:
        from app.models.paper_form_variant import PaperFormVariant

        fv_result = await db.execute(select(PaperFormVariant).where(PaperFormVariant.id == paper.form_variant_id))
        fv = fv_result.scalar_one_or_none()
        if fv:
            form_variant_name = fv.name

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
        form_variant_id=paper.form_variant_id,
        form_variant_name=form_variant_name,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
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

            cospeaker_settings = get_settings()
            send_email_background(
                send_cospeaker_invitation_email,
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
                base_url=cospeaker_settings.PORTAL_BASE_URL,
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
        status=portal_status,
        session_type_name=session_type_name,
        topics=topics,
        video_url=video_url,
        main_speaker_first_name=main_speaker_first_name,
        main_speaker_last_name=main_speaker_last_name,
        cospeakers=cospeakers,
        review_status=review_status,
    )
