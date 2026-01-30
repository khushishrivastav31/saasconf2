"""Review Score Scales CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
)
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

from ._shared import _resolve_conference

router = APIRouter()


def _build_scale_response(scale: ReviewScoreScale) -> ReviewScoreScaleResponse:
    """Build a response with eagerly loaded options."""
    return ReviewScoreScaleResponse(
        id=scale.id,
        tenant_id=scale.tenant_id,
        conference_id=scale.conference_id,
        name=scale.name,
        scale_type=scale.scale_type,
        is_active=scale.is_active,
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
            for opt in scale.options
        ],
        created_at=scale.created_at,
        updated_at=scale.updated_at,
    )


@router.get("/score-scales", response_model=ReviewScoreScaleListResponse)
async def list_score_scales(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ReviewScoreScaleListResponse:
    """List all score scales for a conference with nested options."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(ReviewScoreScale)
        .where(
            ReviewScoreScale.conference_id == conference.id,
            ReviewScoreScale.tenant_id == conference.tenant_id,
        )
        .order_by(ReviewScoreScale.name)
    )
    result = await db.execute(query)
    scales = result.scalars().all()

    items = [_build_scale_response(s) for s in scales]

    return ReviewScoreScaleListResponse(items=items, total=len(items))


@router.post("/score-scales", response_model=ReviewScoreScaleResponse)
async def create_score_scale(
    conference_id: UUID,
    scale_data: ReviewScoreScaleCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewScoreScaleResponse:
    """Create a new score scale with nested options."""
    conference = await _resolve_conference(conference_id, current_user, db)

    # Check unique name within conference
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

    # Create nested options
    for opt_data in scale_data.options:
        option = ReviewScaleOption(
            scale_id=scale.id,
            label=opt_data.label,
            numeric_value=opt_data.numeric_value,
            is_unsure=opt_data.is_unsure,
            display_order=opt_data.display_order,
        )
        db.add(option)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="score_scale.create",
        resource_type="score_scale",
        resource_id=scale.id,
        details={"name": scale.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(scale)

    return _build_scale_response(scale)


@router.put("/score-scales/{scale_id}", response_model=ReviewScoreScaleResponse)
async def update_score_scale(
    conference_id: UUID,
    scale_id: UUID,
    scale_data: ReviewScoreScaleUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> ReviewScoreScaleResponse:
    """Update an existing score scale. If options array provided, replace all options."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewScoreScale).where(
            ReviewScoreScale.id == scale_id,
            ReviewScoreScale.conference_id == conference.id,
        )
    )
    scale = result.scalar_one_or_none()
    if not scale:
        raise NotFoundError(f"Score scale with ID '{scale_id}' not found")

    # If name is changing, check uniqueness
    if scale_data.name is not None and scale_data.name != scale.name:
        existing = await db.execute(
            select(ReviewScoreScale).where(
                ReviewScoreScale.conference_id == conference.id,
                ReviewScoreScale.tenant_id == conference.tenant_id,
                ReviewScoreScale.name == scale_data.name,
                ReviewScoreScale.id != scale_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A score scale named '{scale_data.name}' already exists")

    update_data = scale_data.model_dump(exclude_unset=True, exclude={"options"})
    for field, value in update_data.items():
        setattr(scale, field, value)

    # If options array provided, delete existing and recreate (replace-all strategy)
    if scale_data.options is not None:
        for existing_opt in list(scale.options):
            await db.delete(existing_opt)
        await db.flush()

        for opt_data in scale_data.options:
            option = ReviewScaleOption(
                scale_id=scale.id,
                label=opt_data.label,
                numeric_value=opt_data.numeric_value,
                is_unsure=opt_data.is_unsure,
                display_order=opt_data.display_order,
            )
            db.add(option)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="score_scale.update",
        resource_type="score_scale",
        resource_id=scale.id,
        details={"updated_fields": list(scale_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(scale)

    return _build_scale_response(scale)


@router.delete("/score-scales/{scale_id}")
async def delete_score_scale(
    conference_id: UUID,
    scale_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a score scale. Fails if any review question references it."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewScoreScale).where(
            ReviewScoreScale.id == scale_id,
            ReviewScoreScale.conference_id == conference.id,
        )
    )
    scale = result.scalar_one_or_none()
    if not scale:
        raise NotFoundError(f"Score scale with ID '{scale_id}' not found")

    # Check if any ReviewQuestion references this scale
    question_check = await db.execute(
        select(ReviewQuestion).where(
            ReviewQuestion.score_scale_id == scale_id,
        )
    )
    if question_check.scalar_one_or_none():
        raise ValidationError(
            f"Cannot delete score scale '{scale.name}' because it is referenced by one or more review questions"
        )

    scale_name = scale.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="score_scale.delete",
        resource_type="score_scale",
        resource_id=scale.id,
        details={"name": scale_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(scale)
    await db.commit()

    return {"message": f"Score scale '{scale_name}' deleted successfully"}
