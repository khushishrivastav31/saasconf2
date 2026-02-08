"""Discount Codes CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import DiscountCode
from app.schemas.settings import (
    DiscountCodeCreate,
    DiscountCodeListResponse,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/discount-codes", response_model=DiscountCodeListResponse)
async def list_discount_codes(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> DiscountCodeListResponse:
    """List all discount codes for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(DiscountCode)
        .where(
            DiscountCode.conference_id == conference.id,
            DiscountCode.tenant_id == conference.tenant_id,
        )
        .order_by(DiscountCode.name)
    )
    result = await db.execute(query)
    codes = result.scalars().all()

    items = [
        DiscountCodeResponse(
            id=c.id,
            tenant_id=c.tenant_id,
            conference_id=c.conference_id,
            name=c.name,
            code=c.code,
            discount_type=c.discount_type,
            discount_value=c.discount_value,
            currency=c.currency,
            start_date=c.start_date,
            end_date=c.end_date,
            max_uses=c.max_uses,
            usage_count=c.usage_count,
            is_active=c.is_active,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in codes
    ]

    return DiscountCodeListResponse(items=items, total=len(items))


@router.post("/discount-codes", response_model=DiscountCodeResponse)
async def create_discount_code(
    conference_id: UUID,
    code_data: DiscountCodeCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> DiscountCodeResponse:
    """Create a new discount code for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique code within conference
    existing = await db.execute(
        select(DiscountCode).where(
            DiscountCode.conference_id == conference.id,
            DiscountCode.tenant_id == conference.tenant_id,
            DiscountCode.code == code_data.code,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A discount code '{code_data.code}' already exists")

    discount = DiscountCode(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=code_data.name,
        code=code_data.code,
        discount_type=code_data.discount_type,
        discount_value=code_data.discount_value,
        currency=code_data.currency,
        start_date=code_data.start_date,
        end_date=code_data.end_date,
        max_uses=code_data.max_uses,
        is_active=code_data.is_active,
    )
    db.add(discount)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.create",
        resource_type="discount_code",
        resource_id=discount.id,
        details={"code": discount.code, "name": discount.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(discount)

    return DiscountCodeResponse(
        id=discount.id,
        tenant_id=discount.tenant_id,
        conference_id=discount.conference_id,
        name=discount.name,
        code=discount.code,
        discount_type=discount.discount_type,
        discount_value=discount.discount_value,
        currency=discount.currency,
        start_date=discount.start_date,
        end_date=discount.end_date,
        max_uses=discount.max_uses,
        usage_count=discount.usage_count,
        is_active=discount.is_active,
        created_at=discount.created_at,
        updated_at=discount.updated_at,
    )


@router.put("/discount-codes/{discount_code_id}", response_model=DiscountCodeResponse)
async def update_discount_code(
    conference_id: UUID,
    discount_code_id: UUID,
    code_data: DiscountCodeUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> DiscountCodeResponse:
    """Update an existing discount code."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.id == discount_code_id,
            DiscountCode.conference_id == conference.id,
        )
    )
    discount = result.scalar_one_or_none()
    if not discount:
        raise NotFoundError(f"Discount code with ID '{discount_code_id}' not found")

    # If code is changing, check uniqueness
    if code_data.code is not None and code_data.code != discount.code:
        existing = await db.execute(
            select(DiscountCode).where(
                DiscountCode.conference_id == conference.id,
                DiscountCode.tenant_id == conference.tenant_id,
                DiscountCode.code == code_data.code,
                DiscountCode.id != discount_code_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A discount code '{code_data.code}' already exists")

    update_data = code_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(discount, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.update",
        resource_type="discount_code",
        resource_id=discount.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(discount)

    return DiscountCodeResponse(
        id=discount.id,
        tenant_id=discount.tenant_id,
        conference_id=discount.conference_id,
        name=discount.name,
        code=discount.code,
        discount_type=discount.discount_type,
        discount_value=discount.discount_value,
        currency=discount.currency,
        start_date=discount.start_date,
        end_date=discount.end_date,
        max_uses=discount.max_uses,
        usage_count=discount.usage_count,
        is_active=discount.is_active,
        created_at=discount.created_at,
        updated_at=discount.updated_at,
    )


@router.delete("/discount-codes/{discount_code_id}")
async def delete_discount_code(
    conference_id: UUID,
    discount_code_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a discount code."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.id == discount_code_id,
            DiscountCode.conference_id == conference.id,
        )
    )
    discount = result.scalar_one_or_none()
    if not discount:
        raise NotFoundError(f"Discount code with ID '{discount_code_id}' not found")

    code_name = discount.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.delete",
        resource_type="discount_code",
        resource_id=discount.id,
        details={"code": discount.code, "name": code_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(discount)
    await db.commit()

    return {"message": f"Discount code '{code_name}' deleted successfully"}
