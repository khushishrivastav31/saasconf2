"""Speaker Expense Management API endpoints (conference-scoped, admin).

Thin router: parses params, verifies tenant/admin access, delegates to
:mod:`app.services.speaker_expense_service` (config: tiers, categories,
allowance-defaults, allowances) and
:mod:`app.services.speaker_expense_workflow_service` (expenses +
approval + stats).
"""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep
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
from app.services import speaker_expense_service as svc
from app.services import speaker_expense_workflow_service as wsvc

router = APIRouter()


# ── Expense Tiers ──


@router.get("/tiers", response_model=list[ExpenseTierResponse])
async def list_expense_tiers(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[ExpenseTierResponse]:
    """List expense tiers for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.list_expense_tiers(db, conference_id=conference.id, tenant_id=current_user.require_tenant_id())


@router.post("/tiers", response_model=ExpenseTierResponse, status_code=201)
async def create_expense_tier(
    conference_id: UUID,
    data: ExpenseTierCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseTierResponse:
    """Create an expense tier."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.create_expense_tier(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference.id, data=data
    )


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
    return await svc.update_expense_tier(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        tier_id=tier_id,
        data=data,
    )


@router.delete("/tiers/{tier_id}", status_code=204)
async def delete_expense_tier(
    conference_id: UUID,
    tier_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete an expense tier (nullifies any allowances referencing it)."""
    await check_conference_admin(conference_id, current_user, db)
    await svc.delete_expense_tier(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference_id, tier_id=tier_id
    )


# ── Expense Categories ──


@router.get("/categories", response_model=list[ExpenseCategoryResponse])
async def list_expense_categories(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[ExpenseCategoryResponse]:
    """List expense categories for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.list_expense_categories(
        db, conference_id=conference.id, tenant_id=current_user.require_tenant_id()
    )


@router.post("/categories", response_model=ExpenseCategoryResponse, status_code=201)
async def create_expense_category(
    conference_id: UUID,
    data: ExpenseCategoryCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseCategoryResponse:
    """Create an expense category."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.create_expense_category(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference.id, data=data
    )


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
    return await svc.update_expense_category(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        category_id=category_id,
        data=data,
    )


@router.delete("/categories/{category_id}", status_code=204)
async def delete_expense_category(
    conference_id: UUID,
    category_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Delete an expense category (only if no expenses reference it)."""
    await check_conference_admin(conference_id, current_user, db)
    await svc.delete_expense_category(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference_id, category_id=category_id
    )


# ── Allowance Defaults (per session type) ──


@router.get("/allowance-defaults", response_model=list[AllowanceDefaultResponse])
async def list_allowance_defaults(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[AllowanceDefaultResponse]:
    """List allowance defaults per session type."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.list_allowance_defaults(
        db, conference_id=conference.id, tenant_id=current_user.require_tenant_id()
    )


@router.post("/allowance-defaults", response_model=AllowanceDefaultResponse, status_code=201)
async def create_allowance_default(
    conference_id: UUID,
    data: AllowanceDefaultCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> AllowanceDefaultResponse:
    """Create an allowance default for a session type."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.create_allowance_default(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference.id, data=data
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
    return await svc.update_allowance_default(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        default_id=default_id,
        data=data,
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
    await svc.delete_allowance_default(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference_id, default_id=default_id
    )


# ── Speaker Allowances ──


@router.get("/allowances", response_model=list[SpeakerAllowanceResponse])
async def list_speaker_allowances(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[SpeakerAllowanceResponse]:
    """List per-speaker allowances with claimed/approved totals."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await svc.list_speaker_allowances(
        db, conference_id=conference.id, tenant_id=current_user.require_tenant_id()
    )


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
    return await svc.update_speaker_allowance(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        allowance_id=allowance_id,
        data=data,
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
    return await svc.assign_tier_to_allowance(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        allowance_id=allowance_id,
        data=data,
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
    return await svc.assign_tier_to_speaker(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference_id, data=data
    )


# ── Speaker Expenses ──


@router.get("", response_model=SpeakerExpenseListResponse)
async def list_speaker_expenses(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    status: Literal["draft", "submitted", "approved", "rejected", "paid"] | None = Query(None),
    category_id: UUID | None = Query(None),
    speaker_name: str | None = Query(None),
    search: str | None = Query(None, max_length=200),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
) -> SpeakerExpenseListResponse:
    """List all speaker expenses for a conference with filters."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await wsvc.list_speaker_expenses(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference.id,
        status=status,
        category_id=category_id,
        speaker_name=speaker_name,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=SpeakerExpenseResponse, status_code=201)
async def create_speaker_expense_admin(
    conference_id: UUID,
    data: AdminSpeakerExpenseCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseResponse:
    """Admin creates an expense on behalf of a speaker."""
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await wsvc.create_speaker_expense_admin(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference.id, data=data
    )


@router.get("/stats", response_model=ExpenseStatsResponse)
async def get_expense_stats(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ExpenseStatsResponse:
    """Get expense summary statistics."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await wsvc.get_expense_stats(db, tenant_id=current_user.require_tenant_id(), conference_id=conference.id)


@router.get("/{expense_id}", response_model=SpeakerExpenseResponse)
async def get_speaker_expense(
    conference_id: UUID,
    expense_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SpeakerExpenseResponse:
    """Get a single speaker expense."""
    await get_conference_for_tenant(db, conference_id, current_user.require_tenant_id())
    return await wsvc.get_speaker_expense(
        db, tenant_id=current_user.require_tenant_id(), conference_id=conference_id, expense_id=expense_id
    )


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
    return await wsvc.approve_expense(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        expense_id=expense_id,
        user_id=current_user.user_id,
    )


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
    return await wsvc.reject_expense(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        expense_id=expense_id,
        user_id=current_user.user_id,
        data=data,
    )


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
    return await wsvc.mark_expense_paid(
        db,
        tenant_id=current_user.require_tenant_id(),
        conference_id=conference_id,
        expense_id=expense_id,
        user_id=current_user.user_id,
        data=data,
    )
