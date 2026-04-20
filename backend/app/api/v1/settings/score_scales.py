"""Review Score Scales CRUD endpoints.

Uses the CRUD factory for list and delete, with custom create/update
endpoints to handle the nested options (replace-all strategy).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.review import ReviewQuestion, ReviewScaleOption, ReviewScoreScale
from app.schemas.review import (
    ReviewScaleOptionResponse,
    ReviewScoreScaleCreate,
    ReviewScoreScaleListResponse,
    ReviewScoreScaleResponse,
    ReviewScoreScaleUpdate,
)

from ._crud_factory import create_crud_router
from ._shared import _check_conference_admin, _resolve_conference

# ---- Shared helpers --------------------------------------------------------


async def _build_scale_response(entity: Any, conference: Any, db: Any) -> ReviewScoreScaleResponse:
    """Build a response with eagerly loaded options."""
    return ReviewScoreScaleResponse(
        id=entity.id,
        tenant_id=entity.tenant_id,
        conference_id=entity.conference_id,
        name=entity.name,
        scale_type=entity.scale_type,
        is_active=entity.is_active,
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
            for opt in entity.options
        ],
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )


async def _check_questions_using_scale(entity: Any, conference: Any, db: Any) -> None:
    """Block deletion if any review questions reference this scale."""
    question_check = await db.execute(select(ReviewQuestion).where(ReviewQuestion.score_scale_id == entity.id))
    if question_check.scalar_one_or_none():
        raise ValidationError(
            f"Cannot delete score scale '{entity.name}' because it is referenced by one or more review questions"
        )


# ---- Factory router (list + delete) ---------------------------------------

_factory_router = create_crud_router(
    prefix="score-scales",
    entity_name="score_scale",
    model_class=ReviewScoreScale,
    create_schema=ReviewScoreScaleCreate,
    update_schema=ReviewScoreScaleUpdate,
    response_schema=ReviewScoreScaleResponse,
    list_response_schema=ReviewScoreScaleListResponse,
    unique_field="name",
    order_by=("name",),
    pre_delete_check=_check_questions_using_scale,
    response_builder=_build_scale_response,
    create_exclude_fields={"options"},
    update_exclude_fields={"options"},
)

# Keep only GET (list) and DELETE from the factory; create/update are custom.
_factory_router.routes = [
    route
    for route in _factory_router.routes
    if not (
        isinstance(route, APIRoute)
        and (
            ("POST" in route.methods and route.path == "/score-scales")
            or ("PUT" in route.methods and route.path == "/score-scales/{entity_id}")
        )
    )
]

router = APIRouter()
router.include_router(_factory_router)


# ---- Custom create / update (nested options) -------------------------------


@router.post("/score-scales", response_model=ReviewScoreScaleResponse)
async def create_score_scale(
    conference_id: UUID,
    scale_data: ReviewScoreScaleCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewScoreScaleResponse:
    """Create a new score scale with nested options."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    existing = await db.execute(
        select(ReviewScoreScale).where(
            ReviewScoreScale.conference_id == conference.id,
            ReviewScoreScale.tenant_id == conference.tenant_id,
            ReviewScoreScale.name == scale_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A score scale named '{scale_data.name}' already exists")

    scale = ReviewScoreScale(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=scale_data.name,
        scale_type=scale_data.scale_type,
        is_active=scale_data.is_active,
    )
    db.add(scale)
    await db.flush()

    for opt_data in scale_data.options:
        db.add(
            ReviewScaleOption(
                scale_id=scale.id,
                label=opt_data.label,
                numeric_value=opt_data.numeric_value,
                is_unsure=opt_data.is_unsure,
                display_order=opt_data.display_order,
            )
        )

    db.add(
        AuditLog(
            tenant_id=conference.tenant_id,
            user_id=current_user.user_id,
            action="score_scale.create",
            resource_type="score_scale",
            resource_id=scale.id,
            details={"name": scale.name, "conference_id": str(conference.id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    await db.refresh(scale)
    return await _build_scale_response(scale, conference, db)


@router.put("/score-scales/{entity_id}", response_model=ReviewScoreScaleResponse)
async def update_score_scale(
    conference_id: UUID,
    entity_id: UUID,
    scale_data: ReviewScoreScaleUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewScoreScaleResponse:
    """Update an existing score scale. If options array provided, replace all options."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewScoreScale).where(
            ReviewScoreScale.id == entity_id,
            ReviewScoreScale.conference_id == conference.id,
        )
    )
    scale = result.scalar_one_or_none()
    if not scale:
        raise NotFoundError(f"Score scale with ID '{entity_id}' not found")

    if scale_data.name is not None and scale_data.name != scale.name:
        existing = await db.execute(
            select(ReviewScoreScale).where(
                ReviewScoreScale.conference_id == conference.id,
                ReviewScoreScale.tenant_id == conference.tenant_id,
                ReviewScoreScale.name == scale_data.name,
                ReviewScoreScale.id != entity_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A score scale named '{scale_data.name}' already exists")

    update_data = scale_data.model_dump(exclude_unset=True, exclude={"options"})
    for field, value in update_data.items():
        setattr(scale, field, value)

    if scale_data.options is not None:
        for existing_opt in list(scale.options):
            await db.delete(existing_opt)
        await db.flush()

        for opt_data in scale_data.options:
            db.add(
                ReviewScaleOption(
                    scale_id=scale.id,
                    label=opt_data.label,
                    numeric_value=opt_data.numeric_value,
                    is_unsure=opt_data.is_unsure,
                    display_order=opt_data.display_order,
                )
            )

    db.add(
        AuditLog(
            tenant_id=conference.tenant_id,
            user_id=current_user.user_id,
            action="score_scale.update",
            resource_type="score_scale",
            resource_id=scale.id,
            details={"updated_fields": list(scale_data.model_dump(exclude_unset=True).keys())},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    await db.refresh(scale)
    return await _build_scale_response(scale, conference, db)
