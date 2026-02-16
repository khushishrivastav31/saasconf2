"""Review Criteria CRUD endpoints."""

from typing import Any

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

from ._crud_factory import create_crud_router


async def _build_criterion_response(
    criterion: Any, conference: Any, db: Any
) -> ReviewCriterionResponse:
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


router = create_crud_router(
    prefix="review-criteria",
    entity_name="review_criterion",
    model_class=ReviewCriterion,
    create_schema=ReviewCriterionCreate,
    update_schema=ReviewCriterionUpdate,
    response_schema=ReviewCriterionResponse,
    list_response_schema=ReviewCriterionListResponse,
    unique_field="title",
    unique_field_label="title",
    label_field="title",
    order_by=("display_order",),
    audit_create_fields=["title"],
    response_builder=_build_criterion_response,
)
