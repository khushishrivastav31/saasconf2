"""Billing profile endpoints for registrations."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import check_conference_admin
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError
from app.models.registration import Registration
from app.schemas.registration import (
    BillingProfileResponse,
    BillingProfileUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Billing profile CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/{registration_id}/billing",
    response_model=BillingProfileResponse,
)
async def get_billing_profile(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BillingProfileResponse:
    """Get the billing profile for a registration."""
    tenant_id = current_user.tenant_id
    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(selectinload(Registration.billing_profile))
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    return BillingProfileResponse.model_validate(reg.billing_profile)


@router.put(
    "/{registration_id}/billing",
    response_model=BillingProfileResponse,
)
async def update_billing_profile(
    conference_id: UUID,
    registration_id: UUID,
    data: BillingProfileUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BillingProfileResponse:
    """Update the billing profile for a registration."""
    tenant_id = current_user.tenant_id
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Registration)
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference_id,
            Registration.tenant_id == tenant_id,
        )
        .options(selectinload(Registration.billing_profile))
    )
    reg = result.scalar_one_or_none()
    if not reg:
        raise NotFoundError(f"Registration '{registration_id}' not found")

    billing = reg.billing_profile
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(billing, field, value)

    await db.commit()
    await db.refresh(billing)

    return BillingProfileResponse.model_validate(billing)
