"""CFP Applicant Portal - Review workflow endpoints."""

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.score_utils import normalize_to_5
from app.core.text_utils import strip_html
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.review import (
    PaperReview,
    ReviewAnswer,
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewStatus,
)
from app.schemas.cfp_portal import (
    PortalExistingReviewResponse,
    PortalReviewAnswerResponse,
    PortalReviewConfigResponse,
    PortalReviewCriterionResponse,
    PortalReviewFormSettingsResponse,
    PortalReviewQuestionResponse,
    PortalReviewScaleOptionResponse,
    PortalReviewScaleResponse,
    PortalSpeakerFeedbackListResponse,
    PortalSpeakerFeedbackResponse,
)
from app.schemas.review import PaperReviewSubmit

from .papers import _get_applicant_or_cospeaker_paper

router = APIRouter()


# ──────────────────────────────────────────────
#  REVIEW ENDPOINTS (for committee members)
# ──────────────────────────────────────────────


@router.get(
    "/portal/assignments/{assignment_id}/review-config",
    response_model=PortalReviewConfigResponse,
)
async def get_review_config(
    assignment_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalReviewConfigResponse:
    """Get the review configuration for an assignment (criteria, questions, scales)
    along with any existing review draft/submission."""
    from uuid import UUID as UUIDType

    # Verify the assignment belongs to one of the applicant's committee memberships
    memberships_result = await db.execute(
        select(CFPCommitteeMember.id).where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    member_ids = [row[0] for row in memberships_result]
    if not member_ids:
        raise NotFoundError("Assignment not found")

    assignment_result = await db.execute(
        select(CFPPaperAssignment).where(
            CFPPaperAssignment.id == UUIDType(assignment_id),
            CFPPaperAssignment.committee_member_id.in_(member_ids),
            CFPPaperAssignment.tenant_id == current.tenant_id,
        )
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Assignment not found")

    # Conflict-of-interest check: author cannot review their own paper
    author_check_result = await db.execute(select(CFPPaper.main_speaker_id).where(CFPPaper.id == assignment.paper_id))
    main_speaker_id = author_check_result.scalar_one_or_none()
    if main_speaker_id == current.applicant_id:
        raise HTTPException(status_code=403, detail="You cannot review your own paper")

    # Determine the conference for this assignment's paper
    paper_result = await db.execute(select(CFPPaper.cfp_id).where(CFPPaper.id == assignment.paper_id))
    cfp_id = paper_result.scalar_one_or_none()
    if not cfp_id:
        raise NotFoundError("Paper not found")

    conf_result = await db.execute(
        select(Conference.id)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == cfp_id)
        .limit(1)
    )
    conference_id = conf_result.scalar_one_or_none()
    if not conference_id:
        raise NotFoundError("Conference not found")

    # Load form settings
    form_settings_result = await db.execute(
        select(ReviewFormSettings).where(
            ReviewFormSettings.conference_id == conference_id,
            ReviewFormSettings.tenant_id == current.tenant_id,
        )
    )
    form_settings_row = form_settings_result.scalar_one_or_none()
    form_settings = PortalReviewFormSettingsResponse(
        enable_speaker_feedback=form_settings_row.enable_speaker_feedback if form_settings_row else True,
        enable_internal_comment=form_settings_row.enable_internal_comment if form_settings_row else True,
        enable_must_have=form_settings_row.enable_must_have if form_settings_row else True,
    )

    # Load active criteria with active questions (show_to_reviewers=true)
    criteria_result = await db.execute(
        select(ReviewCriterion)
        .where(
            ReviewCriterion.conference_id == conference_id,
            ReviewCriterion.tenant_id == current.tenant_id,
            ReviewCriterion.is_active == True,
        )
        .order_by(ReviewCriterion.display_order)
    )
    criteria = list(criteria_result.scalars().all())

    portal_criteria = []
    for criterion in criteria:
        active_questions = [q for q in criterion.questions if q.is_active and q.show_to_reviewers]
        if not active_questions:
            continue

        portal_questions = []
        for q in sorted(active_questions, key=lambda x: x.display_order):
            scale = None
            if q.score_scale:
                scale = PortalReviewScaleResponse(
                    id=q.score_scale.id,
                    name=q.score_scale.name,
                    scale_type=q.score_scale.scale_type,
                    options=[
                        PortalReviewScaleOptionResponse(
                            id=opt.id,
                            label=opt.label,
                            numeric_value=opt.numeric_value,
                            is_unsure=opt.is_unsure,
                            display_order=opt.display_order,
                        )
                        for opt in sorted(q.score_scale.options, key=lambda o: o.display_order)
                    ],
                )

            portal_questions.append(
                PortalReviewQuestionResponse(
                    id=q.id,
                    text=q.text,
                    help_text=q.help_text,
                    question_type=q.question_type,
                    weight=q.weight,
                    comment_requirement=q.comment_requirement,
                    low_score_threshold=q.low_score_threshold,
                    count_in_score=q.count_in_score,
                    display_order=q.display_order,
                    scale=scale,
                )
            )

        portal_criteria.append(
            PortalReviewCriterionResponse(
                id=criterion.id,
                title=criterion.title,
                description=criterion.description,
                display_order=criterion.display_order,
                questions=portal_questions,
            )
        )

    # Load existing review if any
    existing_review = None
    review_result = await db.execute(
        select(PaperReview).where(
            PaperReview.assignment_id == UUIDType(assignment_id),
        )
    )
    review = review_result.scalar_one_or_none()
    if review:
        existing_review = PortalExistingReviewResponse(
            id=review.id,
            status=review.status,
            total_score=review.total_score,
            speaker_feedback=review.speaker_feedback,
            internal_comment=review.internal_comment,
            must_have=review.must_have,
            answers=[
                PortalReviewAnswerResponse(
                    question_id=a.question_id,
                    selected_option_id=a.selected_option_id,
                    comment=a.comment,
                )
                for a in review.answers
            ],
            submitted_at=review.submitted_at,
        )

    return PortalReviewConfigResponse(
        criteria=portal_criteria,
        existing_review=existing_review,
        form_settings=form_settings,
    )


@router.post("/portal/assignments/{assignment_id}/review")
async def submit_or_save_review(
    assignment_id: str,
    data: PaperReviewSubmit,
    current: CurrentApplicantDep,
    db: DbSessionDep,
    submit: bool = False,
) -> dict:
    """Create or update a review for an assignment.

    Pass submit=false to save as draft, submit=true to finalize.
    """
    from uuid import UUID as UUIDType

    # Verify assignment belongs to current applicant's committee membership
    memberships_result = await db.execute(
        select(CFPCommitteeMember).where(
            CFPCommitteeMember.applicant_id == current.applicant_id,
            CFPCommitteeMember.tenant_id == current.tenant_id,
        )
    )
    memberships = list(memberships_result.scalars().all())
    member_ids = [m.id for m in memberships]
    if not member_ids:
        raise NotFoundError("Assignment not found")

    assignment_result = await db.execute(
        select(CFPPaperAssignment).where(
            CFPPaperAssignment.id == UUIDType(assignment_id),
            CFPPaperAssignment.committee_member_id.in_(member_ids),
            CFPPaperAssignment.tenant_id == current.tenant_id,
        )
    )
    assignment = assignment_result.scalar_one_or_none()
    if not assignment:
        raise NotFoundError("Assignment not found")

    # Conflict-of-interest check: author cannot review their own paper
    author_check_result2 = await db.execute(select(CFPPaper.main_speaker_id).where(CFPPaper.id == assignment.paper_id))
    main_speaker_id2 = author_check_result2.scalar_one_or_none()
    if main_speaker_id2 == current.applicant_id:
        raise HTTPException(status_code=403, detail="You cannot review your own paper")

    # Find or create review
    review_result = await db.execute(
        select(PaperReview).where(
            PaperReview.assignment_id == assignment.id,
        )
    )
    review = review_result.scalar_one_or_none()

    if review and review.status == ReviewStatus.SUBMITTED.value:
        raise HTTPException(status_code=400, detail="Review has already been submitted")

    if not review:
        review = PaperReview(
            tenant_id=current.tenant_id,
            assignment_id=assignment.id,
            paper_id=assignment.paper_id,
            committee_member_id=assignment.committee_member_id,
            status=ReviewStatus.DRAFT.value,
        )
        db.add(review)
        await db.flush()

    # Update feedback fields
    review.speaker_feedback = data.speaker_feedback
    review.internal_comment = data.internal_comment
    review.must_have = data.must_have

    # Delete existing answers and recreate
    # refresh ensures the answers collection is loaded (needed for newly created reviews
    # where selectin loading hasn't run yet — accessing .answers without this triggers
    # a synchronous lazy load which fails in async context with MissingGreenlet)
    await db.refresh(review, ["answers"])
    for existing_answer in list(review.answers):
        await db.delete(existing_answer)
    await db.flush()

    # Determine conference for loading questions
    paper_result = await db.execute(select(CFPPaper.cfp_id).where(CFPPaper.id == assignment.paper_id))
    cfp_id = paper_result.scalar_one_or_none()
    if not cfp_id:
        raise NotFoundError("Paper's CFP not found")

    conf_result = await db.execute(
        select(Conference.id)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == cfp_id)
        .limit(1)
    )
    conference_id = conf_result.scalar_one_or_none()
    if not conference_id:
        raise NotFoundError("Conference not found for this paper")

    # Load all active questions for validation
    questions_result = await db.execute(
        select(ReviewQuestion).where(
            ReviewQuestion.conference_id == conference_id,
            ReviewQuestion.tenant_id == current.tenant_id,
            ReviewQuestion.is_active == True,
            ReviewQuestion.show_to_reviewers == True,
        )
    )
    questions_by_id = {q.id: q for q in questions_result.scalars().all()}

    # Create new answers
    for answer_data in data.answers:
        question = questions_by_id.get(answer_data.question_id)
        if not question:
            continue  # Skip answers for unknown questions

        # Resolve selected option
        selected_option = None
        numeric_score = None
        is_unsure = False
        if answer_data.selected_option_id and question.score_scale:
            opt_result = await db.execute(
                select(ReviewScaleOption).where(
                    ReviewScaleOption.id == answer_data.selected_option_id,
                )
            )
            selected_option = opt_result.scalar_one_or_none()
            if selected_option:
                numeric_score = selected_option.numeric_value
                is_unsure = selected_option.is_unsure

        answer = ReviewAnswer(
            review_id=review.id,
            question_id=answer_data.question_id,
            selected_option_id=selected_option.id if selected_option else None,
            numeric_score=numeric_score,
            is_unsure=is_unsure,
            comment=answer_data.comment,
        )

        # Populate snapshot fields on submission
        if submit:
            answer.snapshot_weight = question.weight
            answer.snapshot_question_text = question.text
            if selected_option:
                answer.snapshot_option_label = selected_option.label

        db.add(answer)

    if submit:
        # Validate required fields: speaker feedback is required and must be >= 200 plain-text chars
        submit_form_settings_result = await db.execute(
            select(ReviewFormSettings).where(
                ReviewFormSettings.conference_id == conference_id,
                ReviewFormSettings.tenant_id == current.tenant_id,
            )
        )
        submit_form_settings_row = submit_form_settings_result.scalar_one_or_none()
        enable_speaker_feedback = submit_form_settings_row.enable_speaker_feedback if submit_form_settings_row else True
        if enable_speaker_feedback:
            plain_feedback = strip_html(data.speaker_feedback or "").strip()
            if len(plain_feedback) == 0:
                raise HTTPException(status_code=422, detail="Speaker feedback is required")
            if len(plain_feedback) < 200:
                raise HTTPException(
                    status_code=422,
                    detail=f"Speaker feedback must be at least 200 characters (currently {len(plain_feedback)})",
                )

        # Compute total score: Σ(score × weight) / Σ(weight) for count_in_score questions
        total_weighted_score = 0.0
        total_weight = 0.0
        for answer_data in data.answers:
            question = questions_by_id.get(answer_data.question_id)
            if not question or not question.count_in_score:
                continue
            if not answer_data.selected_option_id:
                continue
            opt_result = await db.execute(
                select(ReviewScaleOption).where(
                    ReviewScaleOption.id == answer_data.selected_option_id,
                )
            )
            opt = opt_result.scalar_one_or_none()
            if not opt or opt.is_unsure or opt.numeric_value is None:
                continue
            option_values = (
                [
                    option.numeric_value
                    for option in question.score_scale.options
                    if option.numeric_value is not None and not option.is_unsure
                ]
                if question.score_scale
                else []
            )
            min_val = min(option_values, default=opt.numeric_value)
            max_val = max(option_values, default=opt.numeric_value)
            normalized_score = normalize_to_5(opt.numeric_value, min_val, max_val)
            total_weighted_score += normalized_score * question.weight
            total_weight += question.weight

        review.total_score = (total_weighted_score / total_weight) if total_weight > 0 else None
        review.status = ReviewStatus.SUBMITTED.value
        review.submitted_at = utcnow()

        # Build config snapshot
        criteria_result = await db.execute(
            select(ReviewCriterion).where(
                ReviewCriterion.conference_id == conference_id,
                ReviewCriterion.tenant_id == current.tenant_id,
                ReviewCriterion.is_active == True,
            )
        )
        snapshot_criteria = criteria_result.scalars().all()
        review.config_snapshot = {
            "criteria": [
                {
                    "id": str(c.id),
                    "title": c.title,
                    "questions": [
                        {
                            "id": str(q.id),
                            "text": q.text,
                            "weight": q.weight,
                            "question_type": q.question_type,
                            "count_in_score": q.count_in_score,
                        }
                        for q in questions_by_id.values()
                        if q.criterion_id == c.id
                    ],
                }
                for c in snapshot_criteria
            ],
        }
        # Flush so the review status change is visible to the count queries
        await db.flush()

        # Check if all assignments for this paper now have submitted reviews
        total_assignments = (
            await db.execute(
                select(func.count()).where(
                    CFPPaperAssignment.paper_id == assignment.paper_id,
                )
            )
        ).scalar() or 0
        submitted_reviews = (
            await db.execute(
                select(func.count()).where(
                    PaperReview.paper_id == assignment.paper_id,
                    PaperReview.status == ReviewStatus.SUBMITTED.value,
                )
            )
        ).scalar() or 0
        if total_assignments > 0 and submitted_reviews >= total_assignments:
            paper_result2 = await db.execute(select(CFPPaper).where(CFPPaper.id == assignment.paper_id))
            paper = paper_result2.scalar_one_or_none()
            if paper and paper.status == PaperStatus.IN_EVALUATION.value:
                paper.status = PaperStatus.FINAL_CONSIDERATION.value
    else:
        review.status = ReviewStatus.DRAFT.value

    await db.commit()

    return {
        "message": "Review submitted successfully" if submit else "Review draft saved",
        "review_id": str(review.id),
        "status": review.status,
        "total_score": review.total_score,
    }


@router.get(
    "/portal/papers/{paper_id}/feedback",
    response_model=PortalSpeakerFeedbackListResponse,
)
async def get_speaker_feedback(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalSpeakerFeedbackListResponse:
    """Get anonymous reviewer feedback for a paper.

    Only available when the CFP status is 'completed'.
    Caller must be the main speaker or accepted co-speaker.
    """
    from uuid import UUID as UUIDType

    # Verify the caller owns or is co-speaker on this paper
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    # Verify CFP is completed
    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()
    if not cfp or cfp.status != "completed":
        return PortalSpeakerFeedbackListResponse(items=[], total=0)

    # Get all submitted reviews for this paper
    reviews_result = await db.execute(
        select(PaperReview)
        .where(
            PaperReview.paper_id == UUIDType(paper_id),
            PaperReview.status == ReviewStatus.SUBMITTED.value,
        )
        .order_by(PaperReview.submitted_at)
    )
    reviews = list(reviews_result.scalars().all())

    items = [
        PortalSpeakerFeedbackResponse(
            speaker_feedback=r.speaker_feedback or "",
            total_score=r.total_score,
        )
        for r in reviews
        if r.speaker_feedback  # Only include reviews that have feedback text
    ]

    return PortalSpeakerFeedbackListResponse(items=items, total=len(items))
