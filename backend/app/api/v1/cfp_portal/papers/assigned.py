"""Endpoints for papers an applicant has been assigned to review as a
committee member. Separate from ``authored.py`` because the access model
is different (membership in CFPCommitteeMember, not ownership of the paper)
and because the response respects anonymity flags that never apply on
the authored side.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.cfp import CFPCommitteeMember, CFPPaperAssignment
from app.models.review import PaperReview
from app.schemas.cfp_portal import (
    PortalAssignedPaperListResponse,
    PortalAssignedPaperResponse,
)

from ._helpers import _build_assigned_paper_response

router = APIRouter()


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
