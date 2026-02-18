"""Review Questions CRUD endpoints (nested under criteria)."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.review import ReviewAnswer, ReviewCriterion, ReviewQuestion, ReviewScoreScale
from app.schemas.review import (
    ReviewQuestionCreate,
    ReviewQuestionListResponse,
    ReviewQuestionResponse,
    ReviewQuestionUpdate,
    ReviewScaleOptionResponse,
    ReviewScoreScaleResponse,
)

from ._shared import _check_conference_admin, _resolve_conference

router = APIRouter()


def _build_question_response(question: ReviewQuestion) -> ReviewQuestionResponse:
    """Build a response with score_scale included."""
    score_scale = None
    if question.score_scale is not None:
        score_scale = ReviewScoreScaleResponse(
            id=question.score_scale.id,
            tenant_id=question.score_scale.tenant_id,
            conference_id=question.score_scale.conference_id,
            name=question.score_scale.name,
            scale_type=question.score_scale.scale_type,
            is_active=question.score_scale.is_active,
            options=[
                ReviewScaleOptionResponse(
                    id=opt.id,
                    scale_id=opt.scale_id,
                    label=opt.label,
                    numeric_value=opt.numeric_value,
                    is_unsure=opt.is_unsure,
                    display_order=opt.display_order,
                    created_at=opt.created_at,
                    updated_at=opt.updated_at,
                )
                for opt in question.score_scale.options
            ],
            created_at=question.score_scale.created_at,
            updated_at=question.score_scale.updated_at,
        )

    return ReviewQuestionResponse(
        id=question.id,
        criterion_id=question.criterion_id,
        tenant_id=question.tenant_id,
        conference_id=question.conference_id,
        text=question.text,
        help_text=question.help_text,
        question_type=question.question_type,
        score_scale_id=question.score_scale_id,
        score_scale=score_scale,
        weight=question.weight,
        comment_requirement=question.comment_requirement,
        low_score_threshold=question.low_score_threshold,
        show_to_reviewers=question.show_to_reviewers,
        count_in_score=question.count_in_score,
        display_order=question.display_order,
        is_active=question.is_active,
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


@router.get(
    "/review-criteria/{criterion_id}/questions",
    response_model=ReviewQuestionListResponse,
)
async def list_review_questions(
    conference_id: UUID,
    criterion_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ReviewQuestionListResponse:
    """List all questions for a criterion."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(ReviewQuestion)
        .where(
            ReviewQuestion.criterion_id == criterion_id,
            ReviewQuestion.conference_id == conference.id,
        )
        .order_by(ReviewQuestion.display_order)
    )
    result = await db.execute(query)
    questions = result.scalars().all()

    items = [_build_question_response(q) for q in questions]

    return ReviewQuestionListResponse(items=items, total=len(items))


@router.post(
    "/review-criteria/{criterion_id}/questions",
    response_model=ReviewQuestionResponse,
)
async def create_review_question(
    conference_id: UUID,
    criterion_id: UUID,
    question_data: ReviewQuestionCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewQuestionResponse:
    """Create a new review question under a criterion."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Validate criterion exists and belongs to conference
    crit_result = await db.execute(
        select(ReviewCriterion).where(
            ReviewCriterion.id == criterion_id,
            ReviewCriterion.conference_id == conference.id,
        )
    )
    criterion = crit_result.scalar_one_or_none()
    if not criterion:
        raise NotFoundError(f"Review criterion with ID '{criterion_id}' not found")

    # If score_scale_id provided, validate it exists in same conference
    if question_data.score_scale_id is not None:
        scale_result = await db.execute(
            select(ReviewScoreScale).where(
                ReviewScoreScale.id == question_data.score_scale_id,
                ReviewScoreScale.conference_id == conference.id,
            )
        )
        if not scale_result.scalar_one_or_none():
            raise ValidationError(f"Score scale with ID '{question_data.score_scale_id}' not found in this conference")

    question = ReviewQuestion(
        criterion_id=criterion_id,
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        text=question_data.text,
        help_text=question_data.help_text,
        question_type=question_data.question_type,
        score_scale_id=question_data.score_scale_id,
        weight=question_data.weight,
        comment_requirement=question_data.comment_requirement,
        low_score_threshold=question_data.low_score_threshold,
        show_to_reviewers=question_data.show_to_reviewers,
        count_in_score=question_data.count_in_score,
        display_order=question_data.display_order,
        is_active=question_data.is_active,
    )
    db.add(question)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_question.create",
        resource_type="review_question",
        resource_id=question.id,
        details={
            "criterion_id": str(criterion_id),
            "conference_id": str(conference.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(question)

    return _build_question_response(question)


@router.put(
    "/review-criteria/{criterion_id}/questions/{question_id}",
    response_model=ReviewQuestionResponse,
)
async def update_review_question(
    conference_id: UUID,
    criterion_id: UUID,
    question_id: UUID,
    question_data: ReviewQuestionUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewQuestionResponse:
    """Update an existing review question."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewQuestion).where(
            ReviewQuestion.id == question_id,
            ReviewQuestion.criterion_id == criterion_id,
            ReviewQuestion.conference_id == conference.id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise NotFoundError(f"Review question with ID '{question_id}' not found")

    # If score_scale_id is being updated, validate it exists in same conference
    if question_data.score_scale_id is not None and question_data.score_scale_id != question.score_scale_id:
        scale_result = await db.execute(
            select(ReviewScoreScale).where(
                ReviewScoreScale.id == question_data.score_scale_id,
                ReviewScoreScale.conference_id == conference.id,
            )
        )
        if not scale_result.scalar_one_or_none():
            raise ValidationError(f"Score scale with ID '{question_data.score_scale_id}' not found in this conference")

    update_data = question_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(question, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_question.update",
        resource_type="review_question",
        resource_id=question.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(question)

    return _build_question_response(question)


@router.delete("/review-criteria/{criterion_id}/questions/{question_id}")
async def delete_review_question(
    conference_id: UUID,
    criterion_id: UUID,
    question_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a review question. Fails if any review answer references it."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewQuestion).where(
            ReviewQuestion.id == question_id,
            ReviewQuestion.criterion_id == criterion_id,
            ReviewQuestion.conference_id == conference.id,
        )
    )
    question = result.scalar_one_or_none()
    if not question:
        raise NotFoundError(f"Review question with ID '{question_id}' not found")

    # Check if any ReviewAnswer references this question
    answer_check = await db.execute(
        select(ReviewAnswer).where(
            ReviewAnswer.question_id == question_id,
        )
    )
    if answer_check.scalar_one_or_none():
        raise ValidationError(
            "Cannot delete this review question because it is referenced by one or more review answers"
        )

    question_text = question.text

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_question.delete",
        resource_type="review_question",
        resource_id=question.id,
        details={"text": question_text, "criterion_id": str(criterion_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(question)
    await db.commit()

    return {"message": "Review question deleted successfully"}
