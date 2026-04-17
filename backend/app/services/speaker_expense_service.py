"""Speaker-expense *configuration* services.

Owns the CRUD for tiers, categories, allowance defaults, and per-speaker
allowances. The workflow side (expense submit/approve/reject/pay + stats)
lives in :mod:`app.services.speaker_expense_workflow_service` to stay
under the 600-LOC guardrail.

Pure business logic — no FastAPI ``Request``/``HTTPException`` coupling.
Routers parse params and verify admin access, then delegate here.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError, ValidationError
from app.models.cfp_applicants import CFPApplicant
from app.models.speaker_expense import (
    ExpenseCategory,
    ExpenseTier,
    SpeakerExpense,
    SpeakerExpenseAllowance,
    SpeakerExpenseAllowanceDefault,
)
from app.schemas.speaker_expense import (
    AllowanceDefaultCreate,
    AllowanceDefaultResponse,
    AllowanceDefaultUpdate,
    AssignTierByApplicantRequest,
    AssignTierRequest,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseTierCreate,
    ExpenseTierResponse,
    ExpenseTierUpdate,
    SpeakerAllowanceResponse,
    SpeakerAllowanceUpdate,
)

# =============================================================================
# Response helpers
# =============================================================================


def _default_to_response(default: SpeakerExpenseAllowanceDefault) -> AllowanceDefaultResponse:
    return AllowanceDefaultResponse(
        id=default.id,
        session_type_id=default.session_type_id,
        session_type_name=default.session_type.name if default.session_type else None,
        max_amount=default.max_amount,
        currency=default.currency,
        conference_id=default.conference_id,
    )


def _applicant_name(applicant: CFPApplicant | None) -> str:
    if not applicant:
        return ""
    return f"{applicant.first_name or ''} {applicant.last_name or ''}".strip()


def _allowance_to_response(
    allowance: SpeakerExpenseAllowance,
    *,
    tier_name_override: str | None = None,
    total_claimed: Decimal | None = None,
    total_approved: Decimal | None = None,
) -> SpeakerAllowanceResponse:
    tier_name = (
        tier_name_override
        if tier_name_override is not None
        else (allowance.expense_tier.name if allowance.expense_tier else None)
    )
    kwargs: dict = {
        "id": allowance.id,
        "cfp_applicant_id": allowance.cfp_applicant_id,
        "speaker_name": _applicant_name(allowance.applicant),
        "expense_tier_id": allowance.expense_tier_id,
        "expense_tier_name": tier_name,
        "max_amount": allowance.max_amount,
        "currency": allowance.currency,
        "source": allowance.source,
        "notes": allowance.notes,
    }
    if total_claimed is not None:
        kwargs["total_claimed"] = total_claimed
    if total_approved is not None:
        kwargs["total_approved"] = total_approved
        kwargs["remaining"] = allowance.max_amount - total_approved
    return SpeakerAllowanceResponse(**kwargs)


# =============================================================================
# Expense Tiers
# =============================================================================


async def list_expense_tiers(db: AsyncSession, *, conference_id: UUID, tenant_id: UUID) -> list[ExpenseTierResponse]:
    result = await db.execute(
        select(ExpenseTier)
        .where(
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == tenant_id,
        )
        .order_by(ExpenseTier.sort_order, ExpenseTier.name)
    )
    return [ExpenseTierResponse.model_validate(t) for t in result.scalars().all()]


async def create_expense_tier(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    data: ExpenseTierCreate,
) -> ExpenseTierResponse:
    tier = ExpenseTier(
        tenant_id=tenant_id,
        conference_id=conference_id,
        name=data.name,
        max_amount=data.max_amount,
        currency=data.currency,
        sort_order=data.sort_order,
    )
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return ExpenseTierResponse.model_validate(tier)


async def update_expense_tier(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    tier_id: UUID,
    data: ExpenseTierUpdate,
) -> ExpenseTierResponse:
    result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == tenant_id,
        )
    )
    tier = result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tier, field, value)
    await db.commit()
    await db.refresh(tier)
    return ExpenseTierResponse.model_validate(tier)


async def delete_expense_tier(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, tier_id: UUID) -> None:
    result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == tenant_id,
        )
    )
    tier = result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found")
    await db.delete(tier)
    await db.commit()


# =============================================================================
# Expense Categories
# =============================================================================


async def list_expense_categories(
    db: AsyncSession, *, conference_id: UUID, tenant_id: UUID
) -> list[ExpenseCategoryResponse]:
    result = await db.execute(
        select(ExpenseCategory)
        .where(
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == tenant_id,
        )
        .order_by(ExpenseCategory.sort_order, ExpenseCategory.name)
    )
    return [ExpenseCategoryResponse.model_validate(c) for c in result.scalars().all()]


async def create_expense_category(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    data: ExpenseCategoryCreate,
) -> ExpenseCategoryResponse:
    category = ExpenseCategory(
        tenant_id=tenant_id,
        conference_id=conference_id,
        name=data.name,
        sort_order=data.sort_order,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return ExpenseCategoryResponse.model_validate(category)


async def update_expense_category(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    category_id: UUID,
    data: ExpenseCategoryUpdate,
) -> ExpenseCategoryResponse:
    result = await db.execute(
        select(ExpenseCategory).where(
            ExpenseCategory.id == category_id,
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Expense category not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return ExpenseCategoryResponse.model_validate(category)


async def delete_expense_category(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, category_id: UUID) -> None:
    result = await db.execute(
        select(ExpenseCategory).where(
            ExpenseCategory.id == category_id,
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Expense category not found")

    count_result = await db.execute(
        select(func.count()).select_from(SpeakerExpense).where(SpeakerExpense.category_id == category_id)
    )
    if (count_result.scalar() or 0) > 0:
        raise ValidationError("Cannot delete category with existing expenses. Reassign expenses first.")

    await db.delete(category)
    await db.commit()


# =============================================================================
# Allowance Defaults (per session type)
# =============================================================================


async def list_allowance_defaults(
    db: AsyncSession, *, conference_id: UUID, tenant_id: UUID
) -> list[AllowanceDefaultResponse]:
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(
            SpeakerExpenseAllowanceDefault.conference_id == conference_id,
            SpeakerExpenseAllowanceDefault.tenant_id == tenant_id,
        )
    )
    return [_default_to_response(d) for d in result.scalars().all()]


async def create_allowance_default(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    data: AllowanceDefaultCreate,
) -> AllowanceDefaultResponse:
    default = SpeakerExpenseAllowanceDefault(
        tenant_id=tenant_id,
        conference_id=conference_id,
        session_type_id=data.session_type_id,
        max_amount=data.max_amount,
        currency=data.currency,
    )
    db.add(default)
    await db.commit()
    await db.refresh(default)

    reload = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(SpeakerExpenseAllowanceDefault.id == default.id)
    )
    return _default_to_response(reload.scalar_one())


async def update_allowance_default(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    default_id: UUID,
    data: AllowanceDefaultUpdate,
) -> AllowanceDefaultResponse:
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(
            SpeakerExpenseAllowanceDefault.id == default_id,
            SpeakerExpenseAllowanceDefault.conference_id == conference_id,
            SpeakerExpenseAllowanceDefault.tenant_id == tenant_id,
        )
    )
    default = result.scalar_one_or_none()
    if not default:
        raise NotFoundError("Allowance default not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(default, field, value)
    await db.commit()
    await db.refresh(default)
    return _default_to_response(default)


async def delete_allowance_default(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, default_id: UUID) -> None:
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault).where(
            SpeakerExpenseAllowanceDefault.id == default_id,
            SpeakerExpenseAllowanceDefault.conference_id == conference_id,
            SpeakerExpenseAllowanceDefault.tenant_id == tenant_id,
        )
    )
    default = result.scalar_one_or_none()
    if not default:
        raise NotFoundError("Allowance default not found")
    await db.delete(default)
    await db.commit()


# =============================================================================
# Speaker Allowances
# =============================================================================


async def list_speaker_allowances(
    db: AsyncSession, *, conference_id: UUID, tenant_id: UUID
) -> list[SpeakerAllowanceResponse]:
    """List per-speaker allowances with claimed/approved totals."""
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == tenant_id,
        )
    )
    allowances = result.scalars().all()

    expense_stats = await db.execute(
        select(
            SpeakerExpense.cfp_applicant_id,
            SpeakerExpense.status,
            func.coalesce(func.sum(SpeakerExpense.original_amount), 0),
        )
        .where(
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == tenant_id,
        )
        .group_by(SpeakerExpense.cfp_applicant_id, SpeakerExpense.status)
    )

    totals: dict[UUID, dict[str, Decimal]] = {}
    for app_id, status, total in expense_stats.all():
        totals.setdefault(app_id, {"claimed": Decimal("0"), "approved": Decimal("0")})
        total_d = Decimal(str(total))
        if status in ("submitted", "approved", "paid"):
            totals[app_id]["claimed"] += total_d
        if status in ("approved", "paid"):
            totals[app_id]["approved"] += total_d

    responses: list[SpeakerAllowanceResponse] = []
    for a in allowances:
        app_totals = totals.get(a.cfp_applicant_id, {"claimed": Decimal("0"), "approved": Decimal("0")})
        responses.append(
            _allowance_to_response(
                a,
                total_claimed=app_totals["claimed"],
                total_approved=app_totals["approved"],
            )
        )
    return responses


async def update_speaker_allowance(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    allowance_id: UUID,
    data: SpeakerAllowanceUpdate,
) -> SpeakerAllowanceResponse:
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.id == allowance_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == tenant_id,
        )
    )
    allowance = result.scalar_one_or_none()
    if not allowance:
        raise NotFoundError("Speaker allowance not found")

    allowance.max_amount = data.max_amount
    allowance.currency = data.currency
    allowance.source = "manual"
    allowance.expense_tier_id = None
    if data.notes is not None:
        allowance.notes = data.notes
    await db.commit()
    await db.refresh(allowance)
    return _allowance_to_response(allowance)


async def assign_tier_to_allowance(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    allowance_id: UUID,
    data: AssignTierRequest,
) -> SpeakerAllowanceResponse:
    tier = await _load_active_tier(db, tenant_id=tenant_id, conference_id=conference_id, tier_id=data.expense_tier_id)

    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.id == allowance_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == tenant_id,
        )
    )
    allowance = result.scalar_one_or_none()
    if not allowance:
        raise NotFoundError("Speaker allowance not found")

    allowance.expense_tier_id = tier.id
    allowance.max_amount = tier.max_amount
    allowance.currency = tier.currency
    allowance.source = "tier"
    await db.commit()
    await db.refresh(allowance)
    return _allowance_to_response(allowance, tier_name_override=tier.name)


async def assign_tier_to_speaker(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    data: AssignTierByApplicantRequest,
) -> SpeakerAllowanceResponse:
    tier = await _load_active_tier(db, tenant_id=tenant_id, conference_id=conference_id, tier_id=data.expense_tier_id)

    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.cfp_applicant_id == data.cfp_applicant_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == tenant_id,
        )
    )
    allowance = result.scalar_one_or_none()

    if allowance:
        allowance.expense_tier_id = tier.id
        allowance.max_amount = tier.max_amount
        allowance.currency = tier.currency
        allowance.source = "tier"
    else:
        allowance = SpeakerExpenseAllowance(
            tenant_id=tenant_id,
            conference_id=conference_id,
            cfp_applicant_id=data.cfp_applicant_id,
            expense_tier_id=tier.id,
            max_amount=tier.max_amount,
            currency=tier.currency,
            source="tier",
        )
        db.add(allowance)

    await db.commit()
    await db.refresh(allowance)

    reload = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(SpeakerExpenseAllowance.id == allowance.id)
    )
    return _allowance_to_response(reload.scalar_one(), tier_name_override=tier.name)


async def _load_active_tier(db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, tier_id: UUID) -> ExpenseTier:
    result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == tenant_id,
            ExpenseTier.is_active.is_(True),
        )
    )
    tier = result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found or inactive")
    return tier
