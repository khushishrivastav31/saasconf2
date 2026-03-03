"""Paper assignment endpoints (list, create, auto-assign, delete)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    PaperStatus,
)
from app.models.review import PaperReview, ReviewStatus
from app.schemas.cfp import (
    AutoAssignRequest,
    AutoAssignResponse,
    PaperAssignmentCreate,
    PaperAssignmentListResponse,
    PaperAssignmentResponse,
)

from .committee import _check_committee_conflict
from .shared import MODULE_CODE

router = APIRouter()


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
