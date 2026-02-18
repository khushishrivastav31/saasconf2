"""Paper management, assignments, reviews, and cospeaker endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    PaperStatus,
)
from app.models.review import PaperReview, ReviewStatus
from app.schemas.cfp import (
    AutoAssignRequest,
    AutoAssignResponse,
    CospeakerInvitationListResponse,
    CospeakerInvitationResponse,
    PaperAssignmentCreate,
    PaperAssignmentListResponse,
    PaperAssignmentResponse,
    PaperCreate,
    PaperListResponse,
    PaperResponse,
    PaperStats,
    PaperUpdate,
)

from ._paper_helpers import (
    sync_paper_co_speakers,
    sync_paper_topics,
    validate_co_speakers,
    validate_main_speaker,
    validate_session_type,
    validate_topics,
)
from .committee import _check_committee_conflict
from .shared import (
    MODULE_CODE,
    _build_paper_response,
    _paper_eager_options,
    _reload_paper,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Valid admin status transitions for PUT /papers/{paper_id}
# Other transitions go through dedicated endpoints (submit, unsubmit, etc.)
# ---------------------------------------------------------------------------
VALID_ADMIN_STATUS_TRANSITIONS: dict[str, set[str]] = {
    PaperStatus.DRAFT.value: {
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.SUBMITTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.IN_EVALUATION.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.EVALUATED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.FINAL_CONSIDERATION.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.ACCEPTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.REJECTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
    },
}


# ============ Paper Assignment Endpoints ============


@router.get(
    "/paper-assignments",
    response_model=PaperAssignmentListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_paper_assignments(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    conference_id: UUID | None = Query(None, description="Filter by conference"),
    paper_id: UUID | None = Query(None, description="Filter by paper"),
    committee_member_id: UUID | None = Query(None, description="Filter by committee member"),
) -> PaperAssignmentListResponse:
    """List paper assignments for the current tenant."""
    query = (
        select(CFPPaperAssignment)
        .where(CFPPaperAssignment.tenant_id == current_user.tenant_id)
        .order_by(CFPPaperAssignment.assigned_at.desc())
    )

    if conference_id:
        query = (
            query.join(CFPPaper, CFPPaperAssignment.paper_id == CFPPaper.id)
            .join(ConferenceCFP, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
            .where(ConferenceCFP.conference_id == conference_id)
        )

    if paper_id:
        query = query.where(CFPPaperAssignment.paper_id == paper_id)

    if committee_member_id:
        query = query.where(CFPPaperAssignment.committee_member_id == committee_member_id)

    result = await db.execute(query)
    assignments = list(result.scalars().all())

    # Batch-load all papers and committee members to avoid N+1
    paper_ids = list({a.paper_id for a in assignments})
    member_ids = list({a.committee_member_id for a in assignments})

    papers_map: dict = {}
    if paper_ids:
        paper_result = await db.execute(select(CFPPaper).where(CFPPaper.id.in_(paper_ids)))
        papers_map = {p.id: p for p in paper_result.scalars().all()}

    members_map: dict = {}
    if member_ids:
        member_result = await db.execute(
            select(CFPCommitteeMember)
            .options(selectinload(CFPCommitteeMember.applicant))
            .where(CFPCommitteeMember.id.in_(member_ids))
        )
        members_map = {m.id: m for m in member_result.scalars().all()}

    items = []
    for a in assignments:
        paper = papers_map.get(a.paper_id)
        member = members_map.get(a.committee_member_id)
        items.append(
            PaperAssignmentResponse(
                id=a.id,
                paper_id=a.paper_id,
                paper_title=paper.title if paper else "",
                committee_member_id=a.committee_member_id,
                committee_member_first_name=member.applicant.first_name if member and member.applicant else None,
                committee_member_last_name=member.applicant.last_name if member and member.applicant else None,
                is_anonymous=a.is_anonymous,
                assigned_at=a.assigned_at,
            )
        )

    return PaperAssignmentListResponse(items=items, total=len(items))


@router.post(
    "/paper-assignments",
    response_model=PaperAssignmentResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_paper_assignment(
    data: PaperAssignmentCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> PaperAssignmentResponse:
    """Manually assign a paper to a committee member."""
    # Validate paper
    paper_result = await db.execute(
        select(CFPPaper).where(CFPPaper.id == data.paper_id, CFPPaper.tenant_id == current_user.tenant_id)
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        raise NotFoundError(f"Paper with ID '{data.paper_id}' not found")

    # Validate committee member
    member_result = await db.execute(
        select(CFPCommitteeMember)
        .options(selectinload(CFPCommitteeMember.applicant))
        .where(
            CFPCommitteeMember.id == data.committee_member_id, CFPCommitteeMember.tenant_id == current_user.tenant_id
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise NotFoundError(f"Committee member with ID '{data.committee_member_id}' not found")

    # Check conflict of interest
    has_conflict = await _check_committee_conflict(db, member.applicant_id, data.paper_id)
    if has_conflict:
        raise HTTPException(
            status_code=409, detail="Committee member has a conflict of interest with this paper (speaker/cospeaker)"
        )

    # Check for existing assignment
    existing = await db.execute(
        select(CFPPaperAssignment).where(
            CFPPaperAssignment.paper_id == data.paper_id,
            CFPPaperAssignment.committee_member_id == data.committee_member_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This paper is already assigned to this committee member")

    assignment = CFPPaperAssignment(
        tenant_id=current_user.tenant_id,
        paper_id=data.paper_id,
        committee_member_id=data.committee_member_id,
        is_anonymous=data.is_anonymous,
    )
    db.add(assignment)

    # Transition paper to in_evaluation when first assignment is created
    if paper.status == PaperStatus.SUBMITTED.value:
        paper.status = PaperStatus.IN_EVALUATION.value

    await db.commit()
    await db.refresh(assignment)

    return PaperAssignmentResponse(
        id=assignment.id,
        paper_id=assignment.paper_id,
        paper_title=paper.title,
        committee_member_id=assignment.committee_member_id,
        committee_member_first_name=member.applicant.first_name,
        committee_member_last_name=member.applicant.last_name,
        is_anonymous=assignment.is_anonymous,
        assigned_at=assignment.assigned_at,
    )


@router.post(
    "/paper-assignments/auto-assign",
    response_model=AutoAssignResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def auto_assign_papers(
    data: AutoAssignRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> AutoAssignResponse:
    """Automatically assign papers to committee members based on topic overlap."""
    # 1. Get all papers for the conference
    paper_query = (
        select(CFPPaper)
        .options(selectinload(CFPPaper.topics), selectinload(CFPPaper.cospeaker_associations))
        .join(ConferenceCFP, CFPPaper.cfp_id == ConferenceCFP.cfp_id)
        .where(
            ConferenceCFP.conference_id == data.conference_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    if data.only_submitted:
        paper_query = paper_query.where(CFPPaper.status == PaperStatus.SUBMITTED.value)

    papers_result = await db.execute(paper_query)
    papers = list(papers_result.scalars().unique().all())

    # 2. Get all committee members for the conference
    members_result = await db.execute(
        select(CFPCommitteeMember)
        .options(selectinload(CFPCommitteeMember.topics), selectinload(CFPCommitteeMember.applicant))
        .where(
            CFPCommitteeMember.conference_id == data.conference_id,
            CFPCommitteeMember.tenant_id == current_user.tenant_id,
        )
    )
    members = list(members_result.scalars().unique().all())

    # 3. Get existing assignments count per member (for load balancing)
    existing_count_result = await db.execute(
        select(CFPPaperAssignment.committee_member_id, func.count())
        .where(CFPPaperAssignment.tenant_id == current_user.tenant_id)
        .group_by(CFPPaperAssignment.committee_member_id)
    )
    member_load: dict[UUID, int] = {row[0]: row[1] for row in existing_count_result}

    # 4. Get existing assignments for deduplication
    existing_pairs_result = await db.execute(
        select(CFPPaperAssignment.paper_id, CFPPaperAssignment.committee_member_id).where(
            CFPPaperAssignment.tenant_id == current_user.tenant_id
        )
    )
    existing_pairs = {(row[0], row[1]) for row in existing_pairs_result}

    assignments_created = 0
    papers_processed = 0
    papers_skipped = 0
    skipped_details: list[str] = []

    for paper in papers:
        paper_topic_ids = {t.id for t in paper.topics}

        # Build conflict set: main_speaker + cospeakers
        conflict_applicant_ids = {paper.main_speaker_id}
        for assoc in paper.cospeaker_associations:
            conflict_applicant_ids.add(assoc.applicant_id)

        # Find eligible members: no excluded-topic overlap, no conflict, not already assigned.
        # member.topics = topics the member CANNOT review (exclusion list).
        eligible: list[CFPCommitteeMember] = []
        for member in members:
            if member.applicant_id in conflict_applicant_ids:
                continue
            if (paper.id, member.id) in existing_pairs:
                continue
            member_excluded_topic_ids = {t.id for t in member.topics}
            conflict = paper_topic_ids & member_excluded_topic_ids
            if not conflict:
                eligible.append(member)

        # Sort by current load (asc) for balanced distribution
        eligible.sort(key=lambda m: member_load.get(m.id, 0))

        # Count existing assignments for this paper
        existing_count = sum(1 for p, m in existing_pairs if p == paper.id)
        needed = data.reviewers_per_paper - existing_count

        if needed <= 0:
            papers_processed += 1
            continue

        assigned_count = 0
        for member in eligible[:needed]:
            assignment = CFPPaperAssignment(
                tenant_id=current_user.tenant_id,
                paper_id=paper.id,
                committee_member_id=member.id,
                is_anonymous=data.is_anonymous,
            )
            db.add(assignment)
            existing_pairs.add((paper.id, member.id))
            member_load[member.id] = member_load.get(member.id, 0) + 1
            assigned_count += 1
            assignments_created += 1

        # Transition paper to in_evaluation when assignments are created
        if assigned_count > 0 and paper.status == PaperStatus.SUBMITTED.value:
            paper.status = PaperStatus.IN_EVALUATION.value

        papers_processed += 1
        if assigned_count < needed:
            papers_skipped += 1
            skipped_details.append(
                f"Paper '{paper.title}': only {assigned_count} of {needed} reviewers assigned (insufficient eligible members)"
            )

    await db.commit()

    return AutoAssignResponse(
        assignments_created=assignments_created,
        papers_processed=papers_processed,
        papers_skipped=papers_skipped,
        skipped_details=skipped_details,
    )


@router.delete("/paper-assignments/{assignment_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_paper_assignment(
    assignment_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Remove a paper assignment."""
    result = await db.execute(
        select(CFPPaperAssignment).where(
            CFPPaperAssignment.id == assignment_id,
            CFPPaperAssignment.tenant_id == current_user.tenant_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError(f"Assignment with ID '{assignment_id}' not found")

    paper_id = assignment.paper_id
    await db.delete(assignment)

    # Re-check if the paper should transition to final_consideration now that
    # an assignment has been removed (fewer assignments may already be covered
    # by submitted reviews).
    remaining_assignments = (
        await db.execute(select(func.count()).where(CFPPaperAssignment.paper_id == paper_id))
    ).scalar() or 0
    if remaining_assignments > 0:
        submitted_reviews = (
            await db.execute(
                select(func.count()).where(
                    PaperReview.paper_id == paper_id,
                    PaperReview.status == ReviewStatus.SUBMITTED.value,
                )
            )
        ).scalar() or 0
        if submitted_reviews >= remaining_assignments:
            paper_result = await db.execute(select(CFPPaper).where(CFPPaper.id == paper_id))
            paper = paper_result.scalar_one_or_none()
            if paper and paper.status == PaperStatus.IN_EVALUATION.value:
                paper.status = PaperStatus.FINAL_CONSIDERATION.value

    await db.commit()
    return {"message": "Assignment removed successfully"}


# ============ Paper Endpoints ============
# NOTE: These routes must be defined BEFORE /{cfp_id} routes to avoid path conflicts


@router.get("/papers", response_model=PaperListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_papers(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    cfp_id: UUID | None = None,
    conference_id: UUID | None = None,
    status: str | None = None,
    main_speaker_id: UUID | None = None,
    applicant_id: UUID | None = Query(None, description="Filter papers where applicant is main speaker or co-speaker"),
) -> PaperListResponse:
    """List all papers for the current tenant."""
    query = (
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(CFPPaper.tenant_id == current_user.tenant_id)
        .order_by(CFPPaper.created_at.desc())
    )

    if conference_id:
        query = query.join(ConferenceCFP, CFPPaper.cfp_id == ConferenceCFP.cfp_id).where(
            ConferenceCFP.conference_id == conference_id
        )

    if cfp_id:
        query = query.where(CFPPaper.cfp_id == cfp_id)

    if status:
        query = query.where(CFPPaper.status == status)

    if main_speaker_id:
        query = query.where(CFPPaper.main_speaker_id == main_speaker_id)

    if applicant_id:
        cospeaker_paper_ids = (
            select(CFPPaperCospeaker.paper_id).where(CFPPaperCospeaker.applicant_id == applicant_id).scalar_subquery()
        )
        query = query.where((CFPPaper.main_speaker_id == applicant_id) | CFPPaper.id.in_(cospeaker_paper_ids))

    result = await db.execute(query)
    papers = list(result.scalars().all())

    items = []
    for paper in papers:
        items.append(await _build_paper_response(db, paper, current_user.tenant_id))

    return PaperListResponse(items=items, total=len(items))


@router.get("/papers/stats", response_model=PaperStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    cfp_id: UUID | None = None,
) -> PaperStats:
    """Get paper statistics."""
    base_query = select(CFPPaper).where(CFPPaper.tenant_id == current_user.tenant_id)

    if cfp_id:
        base_query = base_query.where(CFPPaper.cfp_id == cfp_id)

    result = await db.execute(base_query)
    papers = list(result.scalars().all())

    stats = {
        "total": len(papers),
        "draft": 0,
        "submitted": 0,
        "in_evaluation": 0,
        "evaluated": 0,
        "rejected": 0,
        "accepted": 0,
    }

    for paper in papers:
        if paper.status in stats:
            stats[paper.status] += 1

    return PaperStats(**stats)


@router.post(
    "/papers", response_model=PaperResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def create_paper(
    paper_data: PaperCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Create a new paper."""
    # Validate CFP exists and belongs to tenant
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == paper_data.cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    cfp = cfp_result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError(f"CFP with ID '{paper_data.cfp_id}' not found")

    # Validate related entities
    await validate_main_speaker(db, paper_data.main_speaker_id, current_user.tenant_id)
    if paper_data.co_speaker_ids:
        await validate_co_speakers(db, paper_data.co_speaker_ids, paper_data.main_speaker_id, current_user.tenant_id)
    if paper_data.session_type_id:
        await validate_session_type(db, paper_data.session_type_id, current_user.tenant_id)
    if paper_data.topic_ids:
        await validate_topics(db, paper_data.topic_ids, current_user.tenant_id)

    # Create paper
    paper = CFPPaper(
        tenant_id=current_user.tenant_id,
        cfp_id=paper_data.cfp_id,
        main_speaker_id=paper_data.main_speaker_id,
        session_type_id=paper_data.session_type_id,
        title=paper_data.title,
        abstract_short=paper_data.abstract_short,
        abstract_long=paper_data.abstract_long,
        level=paper_data.level.value if paper_data.level else None,
        learning_objectives=paper_data.learning_objectives,
        importance=paper_data.importance,
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.flush()

    # Sync co-speakers and topics (delete is a no-op for new papers)
    if paper_data.co_speaker_ids:
        await sync_paper_co_speakers(db, paper.id, paper_data.co_speaker_ids)
    if paper_data.topic_ids:
        await sync_paper_topics(db, paper.id, paper_data.topic_ids)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="paper.create",
        resource_type="paper",
        resource_id=paper.id,
        details={"title": paper.title, "cfp_id": str(paper_data.cfp_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper.id, current_user.tenant_id)

    return await _build_paper_response(db, paper, current_user.tenant_id)


@router.get("/papers/{paper_id}", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper(
    paper_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaperResponse:
    """Get a paper by ID."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    return await _build_paper_response(db, paper, current_user.tenant_id)


@router.put("/papers/{paper_id}", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_paper(
    paper_id: UUID,
    paper_data: PaperUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Update a paper."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    update_data = paper_data.model_dump(exclude_unset=True)

    # Validate main speaker if changing
    if "main_speaker_id" in update_data:
        await validate_main_speaker(db, update_data["main_speaker_id"], current_user.tenant_id)

    # Validate and sync co-speakers if changing
    if "co_speaker_ids" in update_data:
        co_speaker_ids = update_data.pop("co_speaker_ids")
        main_speaker_id = update_data.get("main_speaker_id", paper.main_speaker_id)
        if co_speaker_ids:
            await validate_co_speakers(db, co_speaker_ids, main_speaker_id, current_user.tenant_id)
        await sync_paper_co_speakers(db, paper_id, co_speaker_ids or [])

    # Validate session type if changing
    if update_data.get("session_type_id"):
        await validate_session_type(db, update_data["session_type_id"], current_user.tenant_id)

    # Validate and sync topics if changing
    if "topic_ids" in update_data:
        topic_ids = update_data.pop("topic_ids")
        if topic_ids:
            await validate_topics(db, topic_ids, current_user.tenant_id)
        await sync_paper_topics(db, paper_id, topic_ids or [])

    # Handle level enum
    if update_data.get("level"):
        update_data["level"] = update_data["level"].value

    # Validate and handle status transitions
    if update_data.get("status"):
        new_status = update_data["status"].value
        current_status = paper.status
        allowed = VALID_ADMIN_STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            from app.core.exceptions import ValidationError

            raise ValidationError(f"Cannot transition paper from '{current_status}' to '{new_status}'")
        update_data["status"] = new_status
        # Clear submitted_at, delete assignments & reviews when reverting to draft
        if new_status == PaperStatus.DRAFT.value:
            paper.submitted_at = None
            # Delete reviews first (ReviewAnswers cascade via FK)
            await db.execute(
                delete(PaperReview).where(
                    PaperReview.paper_id == paper_id,
                    PaperReview.tenant_id == current_user.tenant_id,
                )
            )
            # Delete assignments
            await db.execute(
                delete(CFPPaperAssignment).where(
                    CFPPaperAssignment.paper_id == paper_id,
                    CFPPaperAssignment.tenant_id == current_user.tenant_id,
                )
            )

    # Update remaining fields
    for field, value in update_data.items():
        setattr(paper, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="paper.update",
        resource_type="paper",
        resource_id=paper_id,
        details={"updated_fields": list(paper_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.tenant_id)

    return await _build_paper_response(db, paper, current_user.tenant_id)


@router.post(
    "/papers/{paper_id}/submit", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def submit_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Submit a paper (change status from draft to submitted)."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    if paper.status != PaperStatus.DRAFT.value:
        from app.core.exceptions import ValidationError

        raise ValidationError(f"Paper cannot be submitted. Current status: {paper.status}")

    paper.status = PaperStatus.SUBMITTED.value
    paper.submitted_at = utcnow()

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="paper.submit",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.tenant_id)

    return await _build_paper_response(db, paper, current_user.tenant_id)


@router.post(
    "/papers/{paper_id}/unsubmit", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def unsubmit_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Revert a submitted paper back to draft."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    if paper.status != PaperStatus.SUBMITTED.value:
        from app.core.exceptions import ValidationError

        raise ValidationError(f"Paper cannot be reverted to draft. Current status: {paper.status}")

    paper.status = PaperStatus.DRAFT.value
    paper.submitted_at = None

    # Delete reviews first (ReviewAnswers cascade via FK)
    await db.execute(
        delete(PaperReview).where(
            PaperReview.paper_id == paper_id,
            PaperReview.tenant_id == current_user.tenant_id,
        )
    )
    # Delete assignments
    await db.execute(
        delete(CFPPaperAssignment).where(
            CFPPaperAssignment.paper_id == paper_id,
            CFPPaperAssignment.tenant_id == current_user.tenant_id,
        )
    )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="paper.unsubmit",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.tenant_id)

    return await _build_paper_response(db, paper, current_user.tenant_id)


@router.delete("/papers/{paper_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a paper and its attachments."""
    result = await db.execute(
        select(CFPPaper).where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.tenant_id,
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    paper_title = paper.title

    # Delete associated video attachment
    attachments_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.tenant_id,
            Attachment.entity_type == "paper_video",
            Attachment.entity_id == paper_id,
        )
    )
    for attachment in attachments_result.scalars().all():
        await db.delete(attachment)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="paper.delete",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper_title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(paper)
    await db.commit()

    return {"message": f"Paper '{paper_title}' deleted successfully"}


@router.get(
    "/papers/{paper_id}/assignments",
    response_model=PaperAssignmentListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_paper_assignments(
    paper_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaperAssignmentListResponse:
    """Get all assignments for a specific paper."""
    paper_result = await db.execute(
        select(CFPPaper).where(CFPPaper.id == paper_id, CFPPaper.tenant_id == current_user.tenant_id)
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    result = await db.execute(
        select(CFPPaperAssignment)
        .where(
            CFPPaperAssignment.paper_id == paper_id,
            CFPPaperAssignment.tenant_id == current_user.tenant_id,
        )
        .order_by(CFPPaperAssignment.assigned_at.desc())
    )
    assignments = list(result.scalars().all())

    # Batch-load all committee members to avoid N+1
    member_ids = list({a.committee_member_id for a in assignments})
    members_map: dict = {}
    if member_ids:
        member_result = await db.execute(
            select(CFPCommitteeMember)
            .options(selectinload(CFPCommitteeMember.applicant))
            .where(CFPCommitteeMember.id.in_(member_ids))
        )
        members_map = {m.id: m for m in member_result.scalars().all()}

    items = []
    for a in assignments:
        member = members_map.get(a.committee_member_id)
        items.append(
            PaperAssignmentResponse(
                id=a.id,
                paper_id=a.paper_id,
                paper_title=paper.title,
                committee_member_id=a.committee_member_id,
                committee_member_first_name=member.applicant.first_name if member and member.applicant else None,
                committee_member_last_name=member.applicant.last_name if member and member.applicant else None,
                is_anonymous=a.is_anonymous,
                assigned_at=a.assigned_at,
            )
        )

    return PaperAssignmentListResponse(items=items, total=len(items))


# ============ Paper Reviews (Admin View) ============


@router.get("/papers/{paper_id}/reviews", dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper_reviews(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
):
    """Get all reviews for a paper with reviewer names (admin view)."""
    from app.models.review import PaperReview
    from app.schemas.review import AdminPaperReviewResponse, PaperReviewListResponse, ReviewAnswerResponse

    paper_result = await db.execute(
        select(CFPPaper).where(CFPPaper.id == paper_id, CFPPaper.tenant_id == current_user.tenant_id)
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    reviews_result = await db.execute(
        select(PaperReview)
        .where(
            PaperReview.paper_id == paper_id,
            PaperReview.tenant_id == current_user.tenant_id,
        )
        .order_by(PaperReview.created_at)
    )
    reviews = list(reviews_result.scalars().all())

    # Batch-load all committee members to avoid N+1
    member_ids = list({r.committee_member_id for r in reviews})
    members_map: dict = {}
    if member_ids:
        member_result = await db.execute(
            select(CFPCommitteeMember)
            .options(selectinload(CFPCommitteeMember.applicant))
            .where(CFPCommitteeMember.id.in_(member_ids))
        )
        members_map = {m.id: m for m in member_result.scalars().all()}

    items = []
    for review in reviews:
        member = members_map.get(review.committee_member_id)
        reviewer_first_name = member.applicant.first_name if member and member.applicant else None
        reviewer_last_name = member.applicant.last_name if member and member.applicant else None

        items.append(
            AdminPaperReviewResponse(
                id=review.id,
                assignment_id=review.assignment_id,
                paper_id=review.paper_id,
                committee_member_id=review.committee_member_id,
                reviewer_first_name=reviewer_first_name,
                reviewer_last_name=reviewer_last_name,
                status=review.status,
                total_score=review.total_score,
                speaker_feedback=review.speaker_feedback,
                internal_comment=review.internal_comment,
                must_have=review.must_have,
                answers=[
                    ReviewAnswerResponse(
                        id=a.id,
                        question_id=a.question_id,
                        selected_option_id=a.selected_option_id,
                        numeric_score=a.numeric_score,
                        is_unsure=a.is_unsure,
                        comment=a.comment,
                        snapshot_weight=a.snapshot_weight,
                        snapshot_question_text=a.snapshot_question_text,
                        snapshot_option_label=a.snapshot_option_label,
                    )
                    for a in review.answers
                ],
                submitted_at=review.submitted_at,
                created_at=review.created_at,
                updated_at=review.updated_at,
            )
        )

    return PaperReviewListResponse(items=items, total=len(items))


# ============ Cospeaker Invitation Endpoints ============


@router.get(
    "/papers/my-invitations",
    response_model=CospeakerInvitationListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_my_invitations(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    applicant_email: str | None = None,
) -> CospeakerInvitationListResponse:
    """List co-speaker invitations for an applicant."""
    # Find the applicant by email
    if not applicant_email:
        raise HTTPException(status_code=400, detail="applicant_email is required")

    applicant_result = await db.execute(
        select(CFPApplicant).where(
            func.lower(CFPApplicant.email) == applicant_email.strip().lower(),
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        return CospeakerInvitationListResponse(items=[], total=0)

    # Get all cospeaker associations for this applicant
    result = await db.execute(
        select(CFPPaperCospeaker)
        .options(
            selectinload(CFPPaperCospeaker.paper).selectinload(CFPPaper.cfp),
            selectinload(CFPPaperCospeaker.paper).selectinload(CFPPaper.main_speaker),
        )
        .where(
            CFPPaperCospeaker.applicant_id == applicant.id,
            CFPPaperCospeaker.invitation_status == "pending",
        )
    )
    associations = list(result.scalars().all())

    items = [
        CospeakerInvitationResponse(
            paper_id=assoc.paper_id,
            paper_title=assoc.paper.title,
            cfp_title=assoc.paper.cfp.title if assoc.paper.cfp else None,
            main_speaker_first_name=assoc.paper.main_speaker.first_name if assoc.paper.main_speaker else None,
            main_speaker_last_name=assoc.paper.main_speaker.last_name if assoc.paper.main_speaker else None,
            invitation_status=assoc.invitation_status,
            invited_at=assoc.invited_at,
        )
        for assoc in associations
    ]

    return CospeakerInvitationListResponse(items=items, total=len(items))


@router.post("/papers/{paper_id}/cospeakers/{applicant_id}/accept", dependencies=[Depends(require_module(MODULE_CODE))])
async def accept_cospeaker_invitation(
    paper_id: UUID,
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Accept a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
        )
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Invitation not found")

    assoc.invitation_status = "accepted"
    assoc.responded_at = func.now()
    await db.commit()

    return {"message": "Invitation accepted"}


@router.post(
    "/papers/{paper_id}/cospeakers/{applicant_id}/decline", dependencies=[Depends(require_module(MODULE_CODE))]
)
async def decline_cospeaker_invitation(
    paper_id: UUID,
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Decline a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
        )
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Invitation not found")

    assoc.invitation_status = "declined"
    assoc.responded_at = func.now()
    await db.commit()

    return {"message": "Invitation declined"}
