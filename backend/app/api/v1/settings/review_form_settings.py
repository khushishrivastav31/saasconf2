"""Conference-scoped review form settings CRUD."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep
from app.models.review import ReviewFormSettings
from app.schemas.review import ReviewFormSettingsResponse, ReviewFormSettingsUpdate

from ._shared import _resolve_conference

router = APIRouter()


@router.get(
    "/review-form-settings",
    response_model=ReviewFormSettingsResponse,
)
async def get_review_form_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ReviewFormSettingsResponse:
    """Get review form settings for a conference. Creates defaults if not exists."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewFormSettings).where(
            ReviewFormSettings.conference_id == conference.id,
        )
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = ReviewFormSettings(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            enable_speaker_feedback=True,
            enable_internal_comment=True,
        )
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return ReviewFormSettingsResponse.model_validate(settings)


@router.put(
    "/review-form-settings",
    response_model=ReviewFormSettingsResponse,
)
async def update_review_form_settings(
    conference_id: UUID,
    data: ReviewFormSettingsUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> ReviewFormSettingsResponse:
    """Update review form settings for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    result = await db.execute(
        select(ReviewFormSettings).where(
            ReviewFormSettings.conference_id == conference.id,
        )
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = ReviewFormSettings(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
        )
        db.add(settings)
        await db.flush()

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(settings, field, value)

    await db.commit()
    await db.refresh(settings)
    return ReviewFormSettingsResponse.model_validate(settings)
