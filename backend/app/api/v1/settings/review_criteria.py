"""Review Criteria CRUD endpoints."""

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
from app.models.review import ReviewCriterion
from app.schemas.review import (
    ReviewCriterionCreate,
    ReviewCriterionListResponse,
    ReviewCriterionResponse,
    ReviewCriterionUpdate,
    ReviewQuestionResponse,
    ReviewScaleOptionResponse,
    ReviewScoreScaleResponse,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


def _build_criterion_response(criterion: ReviewCriterion) -> ReviewCriterionResponse:
    """Build a response with nested questions, each including score_scale with options."""
    questions = []
    for q in criterion.questions:
        score_scale = None
        if q.score_scale is not None:
            score_scale = ReviewScoreScaleResponse(
                id=q.score_scale.id,
                tenant_id=q.score_scale.tenant_id,
                conference_id=q.score_scale.conference_id,
                name=q.score_scale.name,
                scale_type=q.score_scale.scale_type,
                is_active=q.score_scale.is_active,
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
                    for opt in q.score_scale.options
                ],
                created_at=q.score_scale.created_at,
                updated_at=q.score_scale.updated_at,
            )

        questions.append(
            ReviewQuestionResponse(
                id=q.id,
                criterion_id=q.criterion_id,
                tenant_id=q.tenant_id,
                conference_id=q.conference_id,
                text=q.text,
                help_text=q.help_text,
                question_type=q.question_type,
                score_scale_id=q.score_scale_id,
                score_scale=score_scale,
                weight=q.weight,
                comment_requirement=q.comment_requirement,
                low_score_threshold=q.low_score_threshold,
                show_to_reviewers=q.show_to_reviewers,
                count_in_score=q.count_in_score,
                display_order=q.display_order,
                is_active=q.is_active,
                created_at=q.created_at,
                updated_at=q.updated_at,
            )
        )

    return ReviewCriterionResponse(
        id=criterion.id,
        tenant_id=criterion.tenant_id,
        conference_id=criterion.conference_id,
        title=criterion.title,
        description=criterion.description,
        display_order=criterion.display_order,
        is_active=criterion.is_active,
        questions=questions,
        created_at=criterion.created_at,
        updated_at=criterion.updated_at,
    )


@router.get("/review-criteria", response_model=ReviewCriterionListResponse)
async def list_review_criteria(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ReviewCriterionListResponse:
    """List all review criteria for a conference, ordered by display_order, with nested questions."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(ReviewCriterion)
        .where(
            ReviewCriterion.conference_id == conference.id,
            ReviewCriterion.tenant_id == conference.tenant_id,
        )
        .order_by(ReviewCriterion.display_order)
    )
    result = await db.execute(query)
    criteria = result.scalars().all()

    items = [_build_criterion_response(c) for c in criteria]

    return ReviewCriterionListResponse(items=items, total=len(items))


@router.post("/review-criteria", response_model=ReviewCriterionResponse)
async def create_review_criterion(
    conference_id: UUID,
    criterion_data: ReviewCriterionCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewCriterionResponse:
    """Create a new review criterion for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique title within conference
    existing = await db.execute(
        select(ReviewCriterion).where(
            ReviewCriterion.conference_id == conference.id,
            ReviewCriterion.tenant_id == conference.tenant_id,
            ReviewCriterion.title == criterion_data.title,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A review criterion titled '{criterion_data.title}' already exists")

    criterion = ReviewCriterion(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        title=criterion_data.title,
        description=criterion_data.description,
        display_order=criterion_data.display_order,
        is_active=criterion_data.is_active,
    )
    db.add(criterion)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_criterion.create",
        resource_type="review_criterion",
        resource_id=criterion.id,
        details={"title": criterion.title, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(criterion)

    return _build_criterion_response(criterion)


@router.put("/review-criteria/{criterion_id}", response_model=ReviewCriterionResponse)
async def update_review_criterion(
    conference_id: UUID,
    criterion_id: UUID,
    criterion_data: ReviewCriterionUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewCriterionResponse:
    """Update an existing review criterion."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewCriterion).where(
            ReviewCriterion.id == criterion_id,
            ReviewCriterion.conference_id == conference.id,
        )
    )
    criterion = result.scalar_one_or_none()
    if not criterion:
        raise NotFoundError(f"Review criterion with ID '{criterion_id}' not found")

    # If title is changing, check uniqueness
    if criterion_data.title is not None and criterion_data.title != criterion.title:
        existing = await db.execute(
            select(ReviewCriterion).where(
                ReviewCriterion.conference_id == conference.id,
                ReviewCriterion.tenant_id == conference.tenant_id,
                ReviewCriterion.title == criterion_data.title,
                ReviewCriterion.id != criterion_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A review criterion titled '{criterion_data.title}' already exists")

    update_data = criterion_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(criterion, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_criterion.update",
        resource_type="review_criterion",
        resource_id=criterion.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(criterion)

    return _build_criterion_response(criterion)


@router.delete("/review-criteria/{criterion_id}")
async def delete_review_criterion(
    conference_id: UUID,
    criterion_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a review criterion. Cascades to questions via model relationship."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewCriterion).where(
            ReviewCriterion.id == criterion_id,
            ReviewCriterion.conference_id == conference.id,
        )
    )
    criterion = result.scalar_one_or_none()
    if not criterion:
        raise NotFoundError(f"Review criterion with ID '{criterion_id}' not found")

    criterion_title = criterion.title

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="review_criterion.delete",
        resource_type="review_criterion",
        resource_id=criterion.id,
        details={"title": criterion_title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(criterion)
    await db.commit()

    return {"message": f"Review criterion '{criterion_title}' deleted successfully"}
