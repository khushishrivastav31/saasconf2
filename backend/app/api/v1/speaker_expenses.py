"""Speaker Expense Management API endpoints (conference-scoped, admin)."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, literal, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.attachment import Attachment
from app.models.speaker_expense import (
    ExpenseCategory,
    ExpenseTier,
    SpeakerExpense,
    SpeakerExpenseAllowance,
    SpeakerExpenseAllowanceDefault,
)
from app.schemas.speaker_expense import (
    AdminSpeakerExpenseCreate,
    AllowanceDefaultCreate,
    AllowanceDefaultResponse,
    AllowanceDefaultUpdate,
    AssignTierByApplicantRequest,
    AssignTierRequest,
    ExpenseCategoryCreate,
    ExpenseCategoryResponse,
    ExpenseCategoryUpdate,
    ExpenseStatsResponse,
    ExpenseStatusCount,
    ExpenseTierCreate,
    ExpenseTierResponse,
    ExpenseTierUpdate,
    MarkPaidRequest,
    RejectRequest,
    SpeakerAllowanceResponse,
    SpeakerAllowanceUpdate,
    SpeakerExpenseListResponse,
    SpeakerExpenseResponse,
)

router = APIRouter()


# ── Helpers ──


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


# ── Expense Tier Endpoints ──


@router.get("/tiers", response_model=list[ExpenseTierResponse])
async def list_expense_tiers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[ExpenseTierResponse]:
    """List expense tiers for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    result = await db.execute(
        select(ExpenseTier)
        .where(
            ExpenseTier.conference_id == conference.id,
            ExpenseTier.tenant_id == current_user.tenant_id,
        )
        .order_by(ExpenseTier.sort_order, ExpenseTier.name)
    )
    return [ExpenseTierResponse.model_validate(t) for t in result.scalars().all()]


@router.post("/tiers", response_model=ExpenseTierResponse, status_code=201)
async def create_expense_tier(
    conference_id: UUID,
    data: ExpenseTierCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseTierResponse:
    """Create an expense tier."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    tier = ExpenseTier(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        name=data.name,
        max_amount=data.max_amount,
        currency=data.currency,
        sort_order=data.sort_order,
    )
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    return ExpenseTierResponse.model_validate(tier)


@router.put("/tiers/{tier_id}", response_model=ExpenseTierResponse)
async def update_expense_tier(
    conference_id: UUID,
    tier_id: UUID,
    data: ExpenseTierUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseTierResponse:
    """Update an expense tier."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == current_user.tenant_id,
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


@router.delete("/tiers/{tier_id}", status_code=204)
async def delete_expense_tier(
    conference_id: UUID,
    tier_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete an expense tier (nullifies any allowances referencing it)."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == current_user.tenant_id,
        )
    )
    tier = result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found")
    await db.delete(tier)
    await db.commit()


# ── Expense Category Endpoints ──


@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_expense_categories(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[ExpenseCategoryResponse]:
    """List expense categories for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    result = await db.execute(
        select(ExpenseCategory)
        .where(
            ExpenseCategory.conference_id == conference.id,
            ExpenseCategory.tenant_id == current_user.tenant_id,
        )
        .order_by(ExpenseCategory.sort_order, ExpenseCategory.name)
    )
    return [ExpenseCategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=201)
async def create_expense_category(
    conference_id: UUID,
    data: ExpenseCategoryCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseCategoryResponse:
    """Create an expense category."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    category = ExpenseCategory(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        name=data.name,
        sort_order=data.sort_order,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return ExpenseCategoryResponse.model_validate(category)


@router.put("/categories/{category_id}", response_model=ExpenseCategoryResponse)
async def update_expense_category(
    conference_id: UUID,
    category_id: UUID,
    data: ExpenseCategoryUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseCategoryResponse:
    """Update an expense category."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(ExpenseCategory).where(
            ExpenseCategory.id == category_id,
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == current_user.tenant_id,
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


@router.delete("/categories/{category_id}", status_code=204)
async def delete_expense_category(
    conference_id: UUID,
    category_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete an expense category (only if no expenses reference it)."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(ExpenseCategory).where(
            ExpenseCategory.id == category_id,
            ExpenseCategory.conference_id == conference_id,
            ExpenseCategory.tenant_id == current_user.tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Expense category not found")

    # Check if any expenses reference this category
    count_result = await db.execute(
        select(func.count()).select_from(SpeakerExpense).where(SpeakerExpense.category_id == category_id)
    )
    if (count_result.scalar() or 0) > 0:
        raise ValidationError("Cannot delete category with existing expenses. Reassign expenses first.")

    await db.delete(category)
    await db.commit()


# ── Allowance Default Endpoints (per session type) ──


@router.get("/allowance-defaults", response_model=list[AllowanceDefaultResponse])
async def list_allowance_defaults(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[AllowanceDefaultResponse]:
    """List allowance defaults per session type."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(
            SpeakerExpenseAllowanceDefault.conference_id == conference.id,
            SpeakerExpenseAllowanceDefault.tenant_id == current_user.tenant_id,
        )
    )
    items = result.scalars().all()
    return [
        AllowanceDefaultResponse(
            id=d.id,
            session_type_id=d.session_type_id,
            session_type_name=d.session_type.name if d.session_type else None,
            max_amount=d.max_amount,
            currency=d.currency,
            conference_id=d.conference_id,
        )
        for d in items
    ]


@router.post("/allowance-defaults", response_model=AllowanceDefaultResponse, status_code=201)
async def create_allowance_default(
    conference_id: UUID,
    data: AllowanceDefaultCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> AllowanceDefaultResponse:
    """Create an allowance default for a session type."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    default = SpeakerExpenseAllowanceDefault(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        session_type_id=data.session_type_id,
        max_amount=data.max_amount,
        currency=data.currency,
    )
    db.add(default)
    await db.commit()
    await db.refresh(default)

    # Load session_type for response
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(SpeakerExpenseAllowanceDefault.id == default.id)
    )
    default = result.scalar_one()
    return AllowanceDefaultResponse(
        id=default.id,
        session_type_id=default.session_type_id,
        session_type_name=default.session_type.name if default.session_type else None,
        max_amount=default.max_amount,
        currency=default.currency,
        conference_id=default.conference_id,
    )


@router.put("/allowance-defaults/{default_id}", response_model=AllowanceDefaultResponse)
async def update_allowance_default(
    conference_id: UUID,
    default_id: UUID,
    data: AllowanceDefaultUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> AllowanceDefaultResponse:
    """Update an allowance default."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault)
        .options(selectinload(SpeakerExpenseAllowanceDefault.session_type))
        .where(
            SpeakerExpenseAllowanceDefault.id == default_id,
            SpeakerExpenseAllowanceDefault.conference_id == conference_id,
            SpeakerExpenseAllowanceDefault.tenant_id == current_user.tenant_id,
        )
    )
    default = result.scalar_one_or_none()
    if not default:
        raise NotFoundError("Allowance default not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(default, field, value)
    await db.commit()
    await db.refresh(default)
    return AllowanceDefaultResponse(
        id=default.id,
        session_type_id=default.session_type_id,
        session_type_name=default.session_type.name if default.session_type else None,
        max_amount=default.max_amount,
        currency=default.currency,
        conference_id=default.conference_id,
    )


@router.delete("/allowance-defaults/{default_id}", status_code=204)
async def delete_allowance_default(
    conference_id: UUID,
    default_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete an allowance default."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(SpeakerExpenseAllowanceDefault).where(
            SpeakerExpenseAllowanceDefault.id == default_id,
            SpeakerExpenseAllowanceDefault.conference_id == conference_id,
            SpeakerExpenseAllowanceDefault.tenant_id == current_user.tenant_id,
        )
    )
    default = result.scalar_one_or_none()
    if not default:
        raise NotFoundError("Allowance default not found")
    await db.delete(default)
    await db.commit()


# ── Speaker Allowance Endpoints ──


@router.get("/allowances", response_model=list[SpeakerAllowanceResponse])
async def list_speaker_allowances(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[SpeakerAllowanceResponse]:
    """List per-speaker allowances with claimed/approved totals."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.conference_id == conference.id,
            SpeakerExpenseAllowance.tenant_id == current_user.tenant_id,
        )
    )
    allowances = result.scalars().all()

    # Get expense totals per speaker
    expense_stats = await db.execute(
        select(
            SpeakerExpense.cfp_applicant_id,
            SpeakerExpense.status,
            func.coalesce(func.sum(SpeakerExpense.original_amount), 0),
        )
        .where(
            SpeakerExpense.conference_id == conference.id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
        .group_by(SpeakerExpense.cfp_applicant_id, SpeakerExpense.status)
    )

    # Build lookup: applicant_id -> {claimed, approved}
    totals: dict[UUID, dict[str, Decimal]] = {}
    for app_id, status, total in expense_stats.all():
        if app_id not in totals:
            totals[app_id] = {"claimed": Decimal("0"), "approved": Decimal("0")}
        total_d = Decimal(str(total))
        if status in ("submitted", "approved", "paid"):
            totals[app_id]["claimed"] += total_d
        if status in ("approved", "paid"):
            totals[app_id]["approved"] += total_d

    responses = []
    for a in allowances:
        app_totals = totals.get(a.cfp_applicant_id, {"claimed": Decimal("0"), "approved": Decimal("0")})
        speaker_name = ""
        if a.applicant:
            speaker_name = f"{a.applicant.first_name or ''} {a.applicant.last_name or ''}".strip()
        responses.append(
            SpeakerAllowanceResponse(
                id=a.id,
                cfp_applicant_id=a.cfp_applicant_id,
                speaker_name=speaker_name,
                expense_tier_id=a.expense_tier_id,
                expense_tier_name=a.expense_tier.name if a.expense_tier else None,
                max_amount=a.max_amount,
                currency=a.currency,
                source=a.source,
                notes=a.notes,
                total_claimed=app_totals["claimed"],
                total_approved=app_totals["approved"],
                remaining=a.max_amount - app_totals["approved"],
            )
        )
    return responses


@router.put("/allowances/{allowance_id}", response_model=SpeakerAllowanceResponse)
async def update_speaker_allowance(
    conference_id: UUID,
    allowance_id: UUID,
    data: SpeakerAllowanceUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerAllowanceResponse:
    """Manually update a speaker's expense allowance."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.id == allowance_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == current_user.tenant_id,
        )
    )
    allowance = result.scalar_one_or_none()
    if not allowance:
        raise NotFoundError("Speaker allowance not found")

    allowance.max_amount = data.max_amount
    allowance.currency = data.currency
    allowance.source = "manual"
    allowance.expense_tier_id = None  # Clear tier when manually setting
    if data.notes is not None:
        allowance.notes = data.notes
    await db.commit()
    await db.refresh(allowance)

    speaker_name = ""
    if allowance.applicant:
        speaker_name = f"{allowance.applicant.first_name or ''} {allowance.applicant.last_name or ''}".strip()

    return SpeakerAllowanceResponse(
        id=allowance.id,
        cfp_applicant_id=allowance.cfp_applicant_id,
        speaker_name=speaker_name,
        expense_tier_id=allowance.expense_tier_id,
        expense_tier_name=allowance.expense_tier.name if allowance.expense_tier else None,
        max_amount=allowance.max_amount,
        currency=allowance.currency,
        source=allowance.source,
        notes=allowance.notes,
    )


@router.post("/allowances/{allowance_id}/assign-tier", response_model=SpeakerAllowanceResponse)
async def assign_tier_to_allowance(
    conference_id: UUID,
    allowance_id: UUID,
    data: AssignTierRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerAllowanceResponse:
    """Assign an expense tier to a speaker's allowance (sets max_amount from tier)."""
    await check_conference_admin(conference_id, current_user, db)

    # Load the tier
    tier_result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == data.expense_tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == current_user.tenant_id,
            ExpenseTier.is_active.is_(True),
        )
    )
    tier = tier_result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found or inactive")

    # Load the allowance
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.id == allowance_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == current_user.tenant_id,
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

    speaker_name = ""
    if allowance.applicant:
        speaker_name = f"{allowance.applicant.first_name or ''} {allowance.applicant.last_name or ''}".strip()

    return SpeakerAllowanceResponse(
        id=allowance.id,
        cfp_applicant_id=allowance.cfp_applicant_id,
        speaker_name=speaker_name,
        expense_tier_id=allowance.expense_tier_id,
        expense_tier_name=tier.name,
        max_amount=allowance.max_amount,
        currency=allowance.currency,
        source=allowance.source,
        notes=allowance.notes,
    )


@router.post("/assign-tier", response_model=SpeakerAllowanceResponse)
async def assign_tier_to_speaker(
    conference_id: UUID,
    data: AssignTierByApplicantRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerAllowanceResponse:
    """Assign an expense tier to a speaker, creating the allowance if needed."""
    await check_conference_admin(conference_id, current_user, db)

    # Load the tier
    tier_result = await db.execute(
        select(ExpenseTier).where(
            ExpenseTier.id == data.expense_tier_id,
            ExpenseTier.conference_id == conference_id,
            ExpenseTier.tenant_id == current_user.tenant_id,
            ExpenseTier.is_active.is_(True),
        )
    )
    tier = tier_result.scalar_one_or_none()
    if not tier:
        raise NotFoundError("Expense tier not found or inactive")

    # Find or create allowance
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(
            SpeakerExpenseAllowance.cfp_applicant_id == data.cfp_applicant_id,
            SpeakerExpenseAllowance.conference_id == conference_id,
            SpeakerExpenseAllowance.tenant_id == current_user.tenant_id,
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
            tenant_id=current_user.tenant_id,
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

    # Reload with relationships
    result = await db.execute(
        select(SpeakerExpenseAllowance)
        .options(
            selectinload(SpeakerExpenseAllowance.applicant),
            selectinload(SpeakerExpenseAllowance.expense_tier),
        )
        .where(SpeakerExpenseAllowance.id == allowance.id)
    )
    allowance = result.scalar_one()

    speaker_name = ""
    if allowance.applicant:
        speaker_name = f"{allowance.applicant.first_name or ''} {allowance.applicant.last_name or ''}".strip()

    return SpeakerAllowanceResponse(
        id=allowance.id,
        cfp_applicant_id=allowance.cfp_applicant_id,
        speaker_name=speaker_name,
        expense_tier_id=allowance.expense_tier_id,
        expense_tier_name=tier.name,
        max_amount=allowance.max_amount,
        currency=allowance.currency,
        source=allowance.source,
        notes=allowance.notes,
    )


# ── Speaker Expense Endpoints ──


@router.get("", response_model=SpeakerExpenseListResponse)
async def list_speaker_expenses(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    category_id: UUID | None = Query(None),
    speaker_name: str | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> SpeakerExpenseListResponse:
    """List all speaker expenses for a conference with filters."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    base_filter = [
        SpeakerExpense.conference_id == conference.id,
        SpeakerExpense.tenant_id == current_user.tenant_id,
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
        .offset(skip)
        .limit(limit)
    )
    expenses = result.scalars().all()

    # Batch-fetch attachment counts for all expenses
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


@router.post("", response_model=SpeakerExpenseResponse, status_code=201)
async def create_speaker_expense_admin(
    conference_id: UUID,
    data: AdminSpeakerExpenseCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseResponse:
    """Admin creates an expense on behalf of a speaker."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Verify the applicant exists
    from app.models.cfp_applicants import CFPApplicant

    applicant_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == data.cfp_applicant_id,
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        raise NotFoundError("Speaker (CFP applicant) not found")

    speaker_name = f"{applicant.first_name or ''} {applicant.last_name or ''}".strip()

    expense = SpeakerExpense(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
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

    # Reload with relationships
    result = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
        )
        .where(SpeakerExpense.id == expense.id)
    )
    expense = result.scalar_one()
    return _expense_to_response(expense)


@router.get("/stats", response_model=ExpenseStatsResponse)
async def get_expense_stats(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseStatsResponse:
    """Get expense summary statistics."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(
            SpeakerExpense.status,
            func.count(),
            func.coalesce(func.sum(SpeakerExpense.original_amount), 0),
        )
        .where(
            SpeakerExpense.conference_id == conference.id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
        .group_by(SpeakerExpense.status)
    )

    by_status = []
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


@router.get("/{expense_id}", response_model=SpeakerExpenseResponse)
async def get_speaker_expense(
    conference_id: UUID,
    expense_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseResponse:
    """Get a single speaker expense."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(SpeakerExpense)
        .options(
            selectinload(SpeakerExpense.category),
            selectinload(SpeakerExpense.session),
        )
        .where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    return _expense_to_response(expense)


# ── Approval Workflow ──


@router.post("/{expense_id}/approve")
async def approve_expense(
    conference_id: UUID,
    expense_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Approve a submitted expense."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SpeakerExpense).where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    if expense.status != "submitted":
        raise ValidationError(f"Can only approve submitted expenses, current status: {expense.status}")

    expense.status = "approved"
    expense.approved_by = current_user.user_id
    expense.approved_at = datetime.now(UTC)
    expense.rejection_reason = None
    await db.commit()
    return {"success": True, "message": "Expense approved"}


@router.post("/{expense_id}/reject")
async def reject_expense(
    conference_id: UUID,
    expense_id: UUID,
    data: RejectRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Reject a submitted expense with a reason."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SpeakerExpense).where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    if expense.status != "submitted":
        raise ValidationError(f"Can only reject submitted expenses, current status: {expense.status}")

    expense.status = "rejected"
    expense.rejection_reason = data.reason
    await db.commit()
    return {"success": True, "message": "Expense rejected"}


@router.post("/{expense_id}/mark-paid")
async def mark_expense_paid(
    conference_id: UUID,
    expense_id: UUID,
    data: MarkPaidRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Mark an approved expense as paid."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SpeakerExpense).where(
            SpeakerExpense.id == expense_id,
            SpeakerExpense.conference_id == conference_id,
            SpeakerExpense.tenant_id == current_user.tenant_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFoundError("Speaker expense not found")
    if expense.status != "approved":
        raise ValidationError(f"Can only mark approved expenses as paid, current status: {expense.status}")

    expense.status = "paid"
    expense.paid_at = datetime.now(UTC)
    expense.payment_reference = data.payment_reference
    await db.commit()
    return {"success": True, "message": "Expense marked as paid"}
