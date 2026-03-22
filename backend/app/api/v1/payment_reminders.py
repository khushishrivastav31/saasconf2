"""Payment Reminder API endpoints (conference-scoped)."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.payment_reminder_service import resend_reminder
from app.models.payment_reminder import PaymentReminder

router = APIRouter()


# --- Schemas ---


class PaymentReminderResponse(BaseModel):
    """Response schema for a payment reminder."""

    id: UUID
    invoice_id: UUID
    reminder_number: int
    status: str
    scheduled_date: date
    sent_at: datetime | None = None
    error_message: str | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    invoice_number: str | None = None
    invoice_amount: str | None = None
    currency: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaymentReminderListResponse(BaseModel):
    """Paginated list of payment reminders."""

    items: list[PaymentReminderResponse]
    total: int


class PaymentReminderStatsResponse(BaseModel):
    """Summary statistics for payment reminders."""

    pending: int = 0
    sent: int = 0
    failed: int = 0
    total: int = 0


# --- Endpoints ---


@router.get("", response_model=PaymentReminderListResponse)
async def list_payment_reminders(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    status: Literal["pending", "sent", "failed"] | None = Query(
        None, description="Filter by status: pending, sent, failed"
    ),
    search: str | None = Query(None, max_length=200, description="Search by invoice number or recipient"),
    reminder_number: int | None = Query(None, description="Filter by reminder number: 1 or 2"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> PaymentReminderListResponse:
    """List payment reminders for a conference with optional filters."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(PaymentReminder).where(
        PaymentReminder.conference_id == conference.id,
        PaymentReminder.tenant_id == current_user.tenant_id,
    )
    count_query = (
        select(func.count())
        .select_from(PaymentReminder)
        .where(
            PaymentReminder.conference_id == conference.id,
            PaymentReminder.tenant_id == current_user.tenant_id,
        )
    )

    if status:
        query = query.where(PaymentReminder.status == status)
        count_query = count_query.where(PaymentReminder.status == status)

    if reminder_number:
        query = query.where(PaymentReminder.reminder_number == reminder_number)
        count_query = count_query.where(PaymentReminder.reminder_number == reminder_number)

    if search:
        search_filter = f"%{search}%"
        query = query.where(
            PaymentReminder.invoice_number.ilike(search_filter)
            | PaymentReminder.recipient_name.ilike(search_filter)
            | PaymentReminder.recipient_email.ilike(search_filter)
        )
        count_query = count_query.where(
            PaymentReminder.invoice_number.ilike(search_filter)
            | PaymentReminder.recipient_name.ilike(search_filter)
            | PaymentReminder.recipient_email.ilike(search_filter)
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(PaymentReminder.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [PaymentReminderResponse.model_validate(r) for r in result.scalars().all()]

    return PaymentReminderListResponse(items=items, total=total)


@router.get("/stats", response_model=PaymentReminderStatsResponse)
async def get_payment_reminder_stats(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaymentReminderStatsResponse:
    """Get summary statistics for payment reminders."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(PaymentReminder.status, func.count())
        .where(
            PaymentReminder.conference_id == conference.id,
            PaymentReminder.tenant_id == current_user.tenant_id,
        )
        .group_by(PaymentReminder.status)
    )

    stats = {"pending": 0, "sent": 0, "failed": 0}
    for status_val, count in result.all():
        if status_val in stats:
            stats[status_val] = count

    return PaymentReminderStatsResponse(
        **stats,
        total=sum(stats.values()),
    )


@router.get("/{reminder_id}", response_model=PaymentReminderResponse)
async def get_payment_reminder(
    conference_id: UUID,
    reminder_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaymentReminderResponse:
    """Get a single payment reminder."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(PaymentReminder).where(
            PaymentReminder.id == reminder_id,
            PaymentReminder.conference_id == conference.id,
            PaymentReminder.tenant_id == current_user.tenant_id,
        )
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise NotFoundError("Payment reminder not found")

    return PaymentReminderResponse.model_validate(reminder)


@router.post("/{reminder_id}/resend")
async def resend_payment_reminder(
    conference_id: UUID,
    reminder_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Manually resend a payment reminder."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(PaymentReminder).where(
            PaymentReminder.id == reminder_id,
            PaymentReminder.conference_id == conference.id,
            PaymentReminder.tenant_id == current_user.tenant_id,
        )
    )
    reminder = result.scalar_one_or_none()
    if not reminder:
        raise NotFoundError("Payment reminder not found")

    success = await resend_reminder(db, reminder, conference)
    return {"success": success, "message": "Reminder resent" if success else "Failed to resend reminder"}
