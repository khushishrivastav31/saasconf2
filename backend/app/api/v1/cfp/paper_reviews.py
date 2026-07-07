"""Paper review endpoints (admin view)."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.models.cfp import (
    CFPCommitteeMember,
    CFPPaper,
)
from app.models.review import PaperReview
from app.schemas.review import AdminPaperReviewResponse, PaperReviewListResponse, ReviewAnswerResponse

from .shared import MODULE_CODE

router = APIRouter()


@router.get("/papers/{paper_id}/reviews", dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper_reviews(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
):
    """Get all reviews for a paper with reviewer names (admin view)."""
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
                last_edited_at=review.last_edited_at,
                edit_count=review.edit_count,
                created_at=review.created_at,
                updated_at=review.updated_at,
            )
        )

    return PaperReviewListResponse(items=items, total=len(items))
