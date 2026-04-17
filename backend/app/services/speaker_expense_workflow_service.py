"""Speaker-expense *workflow* services.

Owns expense CRUD + approval transitions + stats. Pairs with
:mod:`app.services.speaker_expense_service` (which owns tiers,
categories, allowance-defaults, and per-speaker allowances) to keep
each module under the 600-LOC guardrail.

Pure business logic — no FastAPI ``Request``/``HTTPException`` coupling.
Routers parse params and verify admin access, then delegate here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.attachment import Attachment
from app.models.cfp_applicants import CFPApplicant
from app.models.speaker_expense import SpeakerExpense
from app.schemas.speaker_expense import (
    AdminSpeakerExpenseCreate,
    ExpenseStatsResponse,
    ExpenseStatusCount,
    MarkPaidRequest,
    RejectRequest,
    SpeakerExpenseListResponse,
    SpeakerExpenseResponse,
)

ExpenseStatusFilter = Literal["draft", "submitted", "approved", "rejected", "paid"]


# =============================================================================
# Response helper
# =============================================================================


def _expense_to_response(expense: SpeakerExpense, attachment_count: int = 0) -> SpeakerExpenseResponse:
    return SpeakerExpenseResponse(
        id=expense.id,
        conference_id=expense.conference_id,
        cfp_applicant_id=expense.cfp_applicant_id,
        speaker_name=expense.speaker_name,
        category_id=expense.category_id,
        category_name=expense.category.name if expense.category else None,
        title=expense.title,
        description=expense.description,
        expense_date=str(expense.expense_date),
        original_amount=expense.original_amount,
        original_currency=expense.original_currency,
        converted_amount=expense.converted_amount,
        conference_currency=expense.conference_currency,
        exchange_rate=expense.exchange_rate,
        session_id=expense.session_id,
        session_title=expense.session.title if expense.session else None,
        status=expense.status,
        approved_by=expense.approved_by,
        approved_at=str(expense.approved_at) if expense.approved_at else None,
        rejection_reason=expense.rejection_reason,
        paid_at=str(expense.paid_at) if expense.paid_at else None,
        payment_reference=expense.payment_reference,
        notes=expense.notes,
        attachment_count=attachment_count,
        created_at=str(expense.created_at),
        updated_at=str(expense.updated_at),
    )


async def _get_expense_or_404(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, expense_id: UUID
) -> SpeakerExpense:
    result = await db.execute(
        select(SpeakerExpense).where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    return expense


# =============================================================================
# Expense CRUD + listing
# =============================================================================


async def list_speaker_expenses(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    status: ExpenseStatusFilter | None = None,
    category_id: UUID | None = None,
    speaker_name: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 100,
) -> SpeakerExpenseListResponse:
    base_filter = [
        SpeakerExpense.conference_id == conference_id,
        SpeakerExpense.tenant_id == tenant_id,
    ]
    if status:
        base_filter.append(SpeakerExpense.status == status)
    if category_id:
        base_filter.append(SpeakerExpense.category_id == category_id)
    if speaker_name:
        base_filter.append(SpeakerExpense.speaker_name.ilike(f"%{speaker_name}%"))
    if search:
        search_filter = f"%{search}%"
        base_filter.append(SpeakerExpense.title.ilike(search_filter) | SpeakerExpense.speaker_name.ilike(search_filter))

    count_result = await db.execute(select(func.count()).select_from(SpeakerExpense).where(*base_filter))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
        )
        .where(*base_filter)
        .order_by(SpeakerExpense.speaker_name, SpeakerExpense.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    expenses = result.scalars().all()

    expense_ids = [e.id for e in expenses]
    attachment_counts: dict[UUID, int] = {}
    if expense_ids:
        att_result = await db.execute(
            select(
                Attachment.entity_id,
                func.count().label("cnt"),
            )
            .where(
                Attachment.entity_type == literal("speaker_expense"),
                Attachment.entity_id.in_(expense_ids),
            )
            .group_by(Attachment.entity_id)
        )
        for entity_id, cnt in att_result.all():
            attachment_counts[entity_id] = cnt

    items = [_expense_to_response(e, attachment_counts.get(e.id, 0)) for e in expenses]
    return SpeakerExpenseListResponse(items=items, total=total)


async def create_speaker_expense_admin(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    data: AdminSpeakerExpenseCreate,
) -> SpeakerExpenseResponse:
    applicant_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == data.cfp_applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Speaker (CFP applicant) not found")

    speaker_name = f"{applicant.first_name or ''} {applicant.last_name or ''}".strip()

    expense = SpeakerExpense(
        tenant_id=tenant_id,
        conference_id=conference_id,
        cfp_applicant_id=data.cfp_applicant_id,
        speaker_name=speaker_name,
        title=data.title,
        category_id=data.category_id,
        description=data.description,
        expense_date=data.expense_date,
        original_amount=data.original_amount,
        original_currency=data.original_currency,
        converted_amount=data.converted_amount,
        exchange_rate=data.exchange_rate,
        session_id=data.session_id,
        notes=data.notes,
        status=data.status,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)

    reload = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
        )
        .where(SpeakerExpense.id == expense.id)
    )
    return _expense_to_response(reload.scalar_one())


async def get_speaker_expense(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, expense_id: UUID
) -> SpeakerExpenseResponse:
    result = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
        )
        .where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    return _expense_to_response(expense)


async def get_expense_stats(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID) -> ExpenseStatsResponse:
    result = await db.execute(
        select(
            SpeakerExpense.status,
            func.count(),
            func.coalesce(func.sum(SpeakerExpense.original_amount), 0),
        )
        .where(
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == tenant_id,
        )
        .group_by(SpeakerExpense.status)
    )

    by_status: list[ExpenseStatusCount] = []
    total_expenses = 0
    total_amount = Decimal("0")
    for status_val, count, amount in result.all():
        by_status.append(ExpenseStatusCount(status=status_val, count=count, total_amount=Decimal(str(amount))))
        total_expenses += count
        total_amount += Decimal(str(amount))

    return ExpenseStatsResponse(
        by_status=by_status,
        total_expenses=total_expenses,
        total_amount=total_amount,
    )


# =============================================================================
# Approval workflow
# =============================================================================


async def approve_expense(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, expense_id: UUID, user_id: UUID
) -> dict:
    expense = await _get_expense_or_404(db, tenant_id=tenant_id, conference_id=conference_id, expense_id=expense_id)
    if expense.status != "submitted":
        raise ValidationError(f"Can only approve submitted expenses, current status: {expense.status}")

    expense.status = "approved"
    expense.approved_by = user_id
    expense.approved_at = datetime.now(UTC)
    expense.rejection_reason = None
    await db.commit()
    return {"success": True, "message": "Expense approved"}


async def reject_expense(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    expense_id: UUID,
    data: RejectRequest,
) -> dict:
    expense = await _get_expense_or_404(db, tenant_id=tenant_id, conference_id=conference_id, expense_id=expense_id)
    if expense.status != "submitted":
        raise ValidationError(f"Can only reject submitted expenses, current status: {expense.status}")

    expense.status = "rejected"
    expense.rejection_reason = data.reason
    await db.commit()
    return {"success": True, "message": "Expense rejected"}


async def mark_expense_paid(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    expense_id: UUID,
    data: MarkPaidRequest,
) -> dict:
    expense = await _get_expense_or_404(db, tenant_id=tenant_id, conference_id=conference_id, expense_id=expense_id)
    if expense.status != "approved":
        raise ValidationError(f"Can only mark approved expenses as paid, current status: {expense.status}")

    expense.status = "paid"
    expense.paid_at = datetime.now(UTC)
    expense.payment_reference = data.payment_reference
    await db.commit()
    return {"success": True, "message": "Expense marked as paid"}
