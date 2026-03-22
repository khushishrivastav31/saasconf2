"""Budget Planning API endpoints (conference-scoped)."""

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.budget import Budget, BudgetCategory, BudgetLineItem
from app.schemas.budget import (
    BudgetCategoryCreate,
    BudgetCategoryResponse,
    BudgetCategoryUpdate,
    BudgetCreate,
    BudgetDetailResponse,
    BudgetLineItemCreate,
    BudgetLineItemResponse,
    BudgetLineItemUpdate,
    BudgetListResponse,
    BudgetResponse,
    BudgetSummaryResponse,
    BudgetUpdate,
    CategorySummary,
)

router = APIRouter()


# ── Helpers ──


async def _recalculate_budget_totals(db: DbSessionDep, budget_id: UUID) -> None:
    """Recalculate denormalized totals on a budget from its line items."""
    result = await db.execute(
        select(
            func.coalesce(func.sum(BudgetLineItem.planned_amount), 0),
            func.coalesce(func.sum(BudgetLineItem.actual_amount), 0),
        ).where(BudgetLineItem.budget_id == budget_id)
    )
    total_planned, total_actual = result.one()
    await db.execute(
        Budget.__table__.update()
        .where(Budget.id == budget_id)
        .values(total_planned=total_planned, total_actual=total_actual)
    )


def _budget_to_response(budget: Budget, items_count: int = 0) -> BudgetResponse:
    total_planned = budget.total_planned or Decimal("0")
    total_actual = budget.total_actual or Decimal("0")
    remaining = total_planned - total_actual
    pct = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0
    return BudgetResponse(
        id=budget.id,
        conference_id=budget.conference_id,
        name=budget.name,
        status=budget.status,
        total_planned=total_planned,
        total_actual=total_actual,
        total_remaining=remaining,
        percent_used=round(pct, 1),
        currency=budget.currency,
        notes=budget.notes,
        created_by=budget.created_by,
        created_at=str(budget.created_at),
        updated_at=str(budget.updated_at),
        items_count=items_count,
    )


def _line_item_to_response(item: BudgetLineItem) -> BudgetLineItemResponse:
    planned = item.planned_amount or Decimal("0")
    actual = item.actual_amount or Decimal("0")
    return BudgetLineItemResponse(
        id=item.id,
        budget_id=item.budget_id,
        category_id=item.category_id,
        category_name=item.category.name if item.category else None,
        description=item.description,
        planned_amount=planned,
        actual_amount=actual,
        variance=planned - actual,
        vendor_name=item.vendor_name,
        notes=item.notes,
        sort_order=item.sort_order,
    )


# ── Budget Category Endpoints ──


@router.get("/categories", response_model=list[BudgetCategoryResponse])
async def list_budget_categories(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[BudgetCategoryResponse]:
    """List budget categories for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    result = await db.execute(
        select(BudgetCategory)
        .where(
            BudgetCategory.conference_id == conference.id,
            BudgetCategory.tenant_id == current_user.tenant_id,
        )
        .order_by(BudgetCategory.sort_order, BudgetCategory.name)
    )
    return [BudgetCategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=BudgetCategoryResponse, status_code=201)
async def create_budget_category(
    conference_id: UUID,
    data: BudgetCategoryCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetCategoryResponse:
    """Create a budget category."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    category = BudgetCategory(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        name=data.name,
        color=data.color,
        sort_order=data.sort_order,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return BudgetCategoryResponse.model_validate(category)


@router.put("/categories/{category_id}", response_model=BudgetCategoryResponse)
async def update_budget_category(
    conference_id: UUID,
    category_id: UUID,
    data: BudgetCategoryUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetCategoryResponse:
    """Update a budget category."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(BudgetCategory).where(
            BudgetCategory.id == category_id,
            BudgetCategory.conference_id == conference_id,
            BudgetCategory.tenant_id == current_user.tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Budget category not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return BudgetCategoryResponse.model_validate(category)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_budget_category(
    conference_id: UUID,
    category_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a budget category."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(BudgetCategory).where(
            BudgetCategory.id == category_id,
            BudgetCategory.conference_id == conference_id,
            BudgetCategory.tenant_id == current_user.tenant_id,
        )
    )
    category = result.scalar_one_or_none()
    if not category:
        raise NotFoundError("Budget category not found")
    await db.delete(category)
    await db.commit()


# ── Budget Endpoints ──


@router.get("", response_model=BudgetListResponse)
async def list_budgets(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> BudgetListResponse:
    """List budgets for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    base_filter = [
        Budget.conference_id == conference.id,
        Budget.tenant_id == current_user.tenant_id,
    ]
    if status:
        base_filter.append(Budget.status == status)

    count_result = await db.execute(select(func.count()).select_from(Budget).where(*base_filter))
    total = count_result.scalar() or 0

    result = await db.execute(
        select(Budget)
        .where(*base_filter)
        .order_by(Budget.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    budgets = result.scalars().all()

    # Get item counts
    item_counts: dict[UUID, int] = {}
    if budgets:
        budget_ids = [b.id for b in budgets]
        count_result = await db.execute(
            select(BudgetLineItem.budget_id, func.count())
            .where(BudgetLineItem.budget_id.in_(budget_ids))
            .group_by(BudgetLineItem.budget_id)
        )
        item_counts = dict(count_result.all())

    items = [_budget_to_response(b, item_counts.get(b.id, 0)) for b in budgets]
    return BudgetListResponse(items=items, total=total)


@router.post("", response_model=BudgetResponse, status_code=201)
async def create_budget(
    conference_id: UUID,
    data: BudgetCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetResponse:
    """Create a new budget."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    budget = Budget(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        name=data.name,
        status="active",
        currency=data.currency,
        notes=data.notes,
        created_by=current_user.user_id,
    )
    db.add(budget)
    await db.commit()
    await db.refresh(budget)
    return _budget_to_response(budget)


@router.get("/{budget_id}", response_model=BudgetDetailResponse)
async def get_budget(
    conference_id: UUID,
    budget_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetDetailResponse:
    """Get budget detail with all line items."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(Budget)
        .options(selectinload(Budget.line_items).selectinload(BudgetLineItem.category))
        .where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFoundError("Budget not found")

    items = sorted(budget.line_items, key=lambda i: i.sort_order)
    total_planned = budget.total_planned or Decimal("0")
    total_actual = budget.total_actual or Decimal("0")
    remaining = total_planned - total_actual
    pct = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0

    return BudgetDetailResponse(
        id=budget.id,
        conference_id=budget.conference_id,
        name=budget.name,
        status=budget.status,
        total_planned=total_planned,
        total_actual=total_actual,
        total_remaining=remaining,
        percent_used=round(pct, 1),
        currency=budget.currency,
        notes=budget.notes,
        created_by=budget.created_by,
        created_at=str(budget.created_at),
        updated_at=str(budget.updated_at),
        items_count=len(items),
        items=[_line_item_to_response(i) for i in items],
    )


@router.put("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    conference_id: UUID,
    budget_id: UUID,
    data: BudgetUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetResponse:
    """Update budget name/notes."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFoundError("Budget not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    await db.commit()
    await db.refresh(budget)
    return _budget_to_response(budget)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    conference_id: UUID,
    budget_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a draft budget."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFoundError("Budget not found")
    await db.delete(budget)
    await db.commit()


@router.post("/{budget_id}/activate", response_model=BudgetResponse)
async def activate_budget(
    conference_id: UUID,
    budget_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetResponse:
    """Activate a budget, archiving the currently active one."""
    await check_conference_admin(conference_id, current_user, db)
    result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFoundError("Budget not found")

    # Archive currently active budget
    active_result = await db.execute(
        select(Budget).where(
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
            Budget.status == "active",
        )
    )
    for active_budget in active_result.scalars().all():
        active_budget.status = "archived"

    budget.status = "active"
    await db.commit()
    await db.refresh(budget)
    return _budget_to_response(budget)


@router.get("/{budget_id}/summary", response_model=BudgetSummaryResponse)
async def get_budget_summary(
    conference_id: UUID,
    budget_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetSummaryResponse:
    """Get aggregated budget summary by category."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Verify budget exists
    budget_result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    budget = budget_result.scalar_one_or_none()
    if not budget:
        raise NotFoundError("Budget not found")

    # Aggregate by category
    result = await db.execute(
        select(
            BudgetLineItem.category_id,
            BudgetCategory.name,
            BudgetCategory.color,
            func.coalesce(func.sum(BudgetLineItem.planned_amount), 0),
            func.coalesce(func.sum(BudgetLineItem.actual_amount), 0),
        )
        .outerjoin(BudgetCategory, BudgetCategory.id == BudgetLineItem.category_id)
        .where(BudgetLineItem.budget_id == budget_id)
        .group_by(BudgetLineItem.category_id, BudgetCategory.name, BudgetCategory.color)
    )

    categories = []
    total_planned = Decimal("0")
    total_actual = Decimal("0")
    for cat_id, cat_name, color, planned, actual in result.all():
        planned_d = Decimal(str(planned))
        actual_d = Decimal(str(actual))
        remaining = planned_d - actual_d
        pct = float(actual_d / planned_d * 100) if planned_d > 0 else 0.0
        categories.append(
            CategorySummary(
                category_id=cat_id,
                category_name=cat_name or "Uncategorized",
                color=color,
                planned=planned_d,
                actual=actual_d,
                remaining=remaining,
                percent_used=round(pct, 1),
            )
        )
        total_planned += planned_d
        total_actual += actual_d

    total_remaining = total_planned - total_actual
    pct_total = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0

    return BudgetSummaryResponse(
        total_planned=total_planned,
        total_actual=total_actual,
        total_remaining=total_remaining,
        percent_used=round(pct_total, 1),
        by_category=categories,
    )


# ── Line Item Endpoints ──


@router.get("/{budget_id}/items", response_model=list[BudgetLineItemResponse])
async def list_budget_items(
    conference_id: UUID,
    budget_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[BudgetLineItemResponse]:
    """List line items for a budget."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(BudgetLineItem)
        .options(selectinload(BudgetLineItem.category))
        .where(
            BudgetLineItem.budget_id == budget_id,
            BudgetLineItem.tenant_id == current_user.tenant_id,
        )
        .order_by(BudgetLineItem.sort_order, BudgetLineItem.created_at)
    )
    return [_line_item_to_response(i) for i in result.scalars().all()]


@router.post("/{budget_id}/items", response_model=BudgetLineItemResponse, status_code=201)
async def create_budget_item(
    conference_id: UUID,
    budget_id: UUID,
    data: BudgetLineItemCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetLineItemResponse:
    """Create a line item in a budget."""
    await check_conference_admin(conference_id, current_user, db)

    # Verify budget exists and belongs to conference
    budget_result = await db.execute(
        select(Budget).where(
            Budget.id == budget_id,
            Budget.conference_id == conference_id,
            Budget.tenant_id == current_user.tenant_id,
        )
    )
    if not budget_result.scalar_one_or_none():
        raise NotFoundError("Budget not found")

    item = BudgetLineItem(
        tenant_id=current_user.tenant_id,
        budget_id=budget_id,
        category_id=data.category_id,
        description=data.description,
        planned_amount=data.planned_amount,
        actual_amount=data.actual_amount,
        vendor_name=data.vendor_name,
        notes=data.notes,
        sort_order=data.sort_order,
    )
    db.add(item)
    await db.flush()
    await _recalculate_budget_totals(db, budget_id)
    await db.commit()
    await db.refresh(item)

    # Load category for response
    if item.category_id:
        cat_result = await db.execute(select(BudgetCategory).where(BudgetCategory.id == item.category_id))
        item.category = cat_result.scalar_one_or_none()  # type: ignore[assignment]

    return _line_item_to_response(item)


@router.put("/{budget_id}/items/{item_id}", response_model=BudgetLineItemResponse)
async def update_budget_item(
    conference_id: UUID,
    budget_id: UUID,
    item_id: UUID,
    data: BudgetLineItemUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BudgetLineItemResponse:
    """Update a budget line item."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BudgetLineItem)
        .options(selectinload(BudgetLineItem.category))
        .where(
            BudgetLineItem.id == item_id,
            BudgetLineItem.budget_id == budget_id,
            BudgetLineItem.tenant_id == current_user.tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Budget line item not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await _recalculate_budget_totals(db, budget_id)
    await db.commit()
    await db.refresh(item)

    # Reload category if changed
    if data.category_id is not None:
        cat_result = await db.execute(select(BudgetCategory).where(BudgetCategory.id == item.category_id))
        item.category = cat_result.scalar_one_or_none()  # type: ignore[assignment]

    return _line_item_to_response(item)


@router.delete("/{budget_id}/items/{item_id}", status_code=204)
async def delete_budget_item(
    conference_id: UUID,
    budget_id: UUID,
    item_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete a budget line item."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BudgetLineItem).where(
            BudgetLineItem.id == item_id,
            BudgetLineItem.budget_id == budget_id,
            BudgetLineItem.tenant_id == current_user.tenant_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise NotFoundError("Budget line item not found")

    await db.delete(item)
    await db.flush()
    await _recalculate_budget_totals(db, budget_id)
    await db.commit()
