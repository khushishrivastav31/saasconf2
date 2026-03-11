"""Speaker expense settings endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.default_settings import DEFAULT_SPEAKER_EXPENSE_SETTINGS
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.conference import Conference
from app.schemas.settings import SpeakerExpenseSettings, SpeakerExpenseSettingsResponse

router = APIRouter()


@router.get(
    "/speaker-expense-settings",
    response_model=SpeakerExpenseSettingsResponse,
)
async def get_speaker_expense_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseSettingsResponse:
    """Get speaker expense settings for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    conf_settings = conference.settings or {}
    expense_settings = conf_settings.get("speaker_expenses", {})

    return SpeakerExpenseSettingsResponse(
        expenses_enabled=expense_settings.get(
            "expenses_enabled",
            DEFAULT_SPEAKER_EXPENSE_SETTINGS["expenses_enabled"],
        ),
    )


@router.put(
    "/speaker-expense-settings",
    response_model=SpeakerExpenseSettingsResponse,
)
async def update_speaker_expense_settings(
    conference_id: UUID,
    data: SpeakerExpenseSettings,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseSettingsResponse:
    """Update speaker expense settings for a conference."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    settings = conference.settings or {}
    settings["speaker_expenses"] = data.model_dump()
    conference.settings = settings
    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    return SpeakerExpenseSettingsResponse(**data.model_dump())
