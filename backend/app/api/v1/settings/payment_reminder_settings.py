"""Payment reminder settings endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.default_settings import DEFAULT_PAYMENT_REMINDER_SETTINGS
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.conference import Conference
from app.schemas.settings import PaymentReminderSettings, PaymentReminderSettingsResponse

router = APIRouter()


@router.get(
    "/payment-reminder-settings",
    response_model=PaymentReminderSettingsResponse,
)
async def get_payment_reminder_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaymentReminderSettingsResponse:
    """Get payment reminder settings for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    conf_settings = conference.settings or {}
    reminder_settings = conf_settings.get("payment_reminders", {})

    return PaymentReminderSettingsResponse(
        payment_reminders_enabled=reminder_settings.get(
            "payment_reminders_enabled",
            DEFAULT_PAYMENT_REMINDER_SETTINGS["payment_reminders_enabled"],
        ),
        first_reminder_days=reminder_settings.get(
            "first_reminder_days",
            DEFAULT_PAYMENT_REMINDER_SETTINGS["first_reminder_days"],
        ),
        second_reminder_days=reminder_settings.get(
            "second_reminder_days",
            DEFAULT_PAYMENT_REMINDER_SETTINGS["second_reminder_days"],
        ),
        notify_admin_after_second=reminder_settings.get(
            "notify_admin_after_second",
            DEFAULT_PAYMENT_REMINDER_SETTINGS["notify_admin_after_second"],
        ),
    )


@router.put(
    "/payment-reminder-settings",
    response_model=PaymentReminderSettingsResponse,
)
async def update_payment_reminder_settings(
    conference_id: UUID,
    data: PaymentReminderSettings,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaymentReminderSettingsResponse:
    """Update payment reminder settings for a conference."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    settings = conference.settings or {}
    settings["payment_reminders"] = data.model_dump()
    conference.settings = settings
    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    return PaymentReminderSettingsResponse(**data.model_dump())
