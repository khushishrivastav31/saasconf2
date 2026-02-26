"""Discount Codes CRUD endpoints."""

import re
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import delete, select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import DiscountCode, DiscountCodeOption, DiscountCodePeriod
from app.schemas.settings import (
    BulkDiscountCodeCreate,
    BulkDiscountCodeResponse,
    DiscountCodeCreate,
    DiscountCodeListResponse,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)

from ._shared import _check_conference_admin, _resolve_conference

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_applicable_option_ids(db: DbSessionDep, discount_code_id: UUID) -> list[UUID]:
    """Get the list of applicable booking option IDs for a discount code."""
    result = await db.execute(
        select(DiscountCodeOption.booking_option_id).where(DiscountCodeOption.discount_code_id == discount_code_id)
    )
    return [row[0] for row in result.fetchall()]


async def _set_applicable_option_ids(
    db: DbSessionDep,
    discount_code_id: UUID,
    tenant_id: UUID,
    option_ids: list[UUID] | None,
) -> None:
    """Set the applicable booking option IDs for a discount code."""
    await db.execute(delete(DiscountCodeOption).where(DiscountCodeOption.discount_code_id == discount_code_id))
    if option_ids:
        for option_id in option_ids:
            db.add(
                DiscountCodeOption(
                    tenant_id=tenant_id,
                    discount_code_id=discount_code_id,
                    booking_option_id=option_id,
                )
            )


async def _get_applicable_period_ids(db: DbSessionDep, discount_code_id: UUID) -> list[UUID]:
    """Get the list of applicable booking period IDs for a discount code."""
    result = await db.execute(
        select(DiscountCodePeriod.booking_period_id).where(DiscountCodePeriod.discount_code_id == discount_code_id)
    )
    return [row[0] for row in result.fetchall()]


async def _set_applicable_period_ids(
    db: DbSessionDep,
    discount_code_id: UUID,
    tenant_id: UUID,
    period_ids: list[UUID] | None,
) -> None:
    """Set the applicable booking period IDs for a discount code."""
    await db.execute(delete(DiscountCodePeriod).where(DiscountCodePeriod.discount_code_id == discount_code_id))
    if period_ids:
        for period_id in period_ids:
            db.add(
                DiscountCodePeriod(
                    tenant_id=tenant_id,
                    discount_code_id=discount_code_id,
                    booking_period_id=period_id,
                )
            )


def _build_response(
    discount: DiscountCode,
    applicable_option_ids: list[UUID],
    applicable_period_ids: list[UUID],
) -> DiscountCodeResponse:
    """Build a DiscountCodeResponse from a DiscountCode model."""
    return DiscountCodeResponse(
        id=discount.id,
        tenant_id=discount.tenant_id,
        conference_id=discount.conference_id,
        description=discount.description,
        code=discount.code,
        discount_type=discount.discount_type,
        discount_value=discount.discount_value,
        currency=discount.currency,
        start_date=discount.start_date,
        end_date=discount.end_date,
        max_uses=discount.max_uses,
        usage_count=discount.usage_count,
        is_active=discount.is_active,
        is_combinable=discount.is_combinable,
        applicable_option_ids=applicable_option_ids,
        applicable_period_ids=applicable_period_ids,
        created_at=discount.created_at,
        updated_at=discount.updated_at,
    )


def _resolve_template(template: str, variables: dict[str, str]) -> str:
    """Replace [VarName] placeholders in a template with variable values."""

    def replacer(match: re.Match[str]) -> str:
        key = match.group(1)
        return variables.get(key, match.group(0))

    return re.sub(r"\[(\w+)\]", replacer, template)


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------


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
        .order_by(DiscountCode.description)
    )
    result = await db.execute(query)
    codes = result.scalars().all()

    items = []
    for c in codes:
        option_ids = await _get_applicable_option_ids(db, c.id)
        period_ids = await _get_applicable_period_ids(db, c.id)
        items.append(_build_response(c, option_ids, period_ids))

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
        description=code_data.description,
        code=code_data.code,
        discount_type=code_data.discount_type,
        discount_value=code_data.discount_value,
        currency=code_data.currency,
        start_date=code_data.start_date,
        end_date=code_data.end_date,
        max_uses=code_data.max_uses,
        is_active=code_data.is_active,
        is_combinable=code_data.is_combinable,
    )
    db.add(discount)
    await db.flush()

    await _set_applicable_option_ids(db, discount.id, conference.tenant_id, code_data.applicable_option_ids)
    await _set_applicable_period_ids(db, discount.id, conference.tenant_id, code_data.applicable_period_ids)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.create",
        resource_type="discount_code",
        resource_id=discount.id,
        details={
            "code": discount.code,
            "description": discount.description,
            "conference_id": str(conference.id),
            "applicable_option_ids": [str(oid) for oid in (code_data.applicable_option_ids or [])],
            "applicable_period_ids": [str(pid) for pid in (code_data.applicable_period_ids or [])],
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(discount)

    option_ids = await _get_applicable_option_ids(db, discount.id)
    period_ids = await _get_applicable_period_ids(db, discount.id)
    return _build_response(discount, option_ids, period_ids)


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

    # Handle junction table fields separately
    update_data = code_data.model_dump(exclude_unset=True)
    applicable_option_ids = update_data.pop("applicable_option_ids", None)
    applicable_period_ids = update_data.pop("applicable_period_ids", None)

    for field, value in update_data.items():
        setattr(discount, field, value)

    if applicable_option_ids is not None:
        await _set_applicable_option_ids(db, discount.id, conference.tenant_id, applicable_option_ids)

    if applicable_period_ids is not None:
        await _set_applicable_period_ids(db, discount.id, conference.tenant_id, applicable_period_ids)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.update",
        resource_type="discount_code",
        resource_id=discount.id,
        details={"updated_fields": list(code_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(discount)

    option_ids = await _get_applicable_option_ids(db, discount.id)
    period_ids = await _get_applicable_period_ids(db, discount.id)
    return _build_response(discount, option_ids, period_ids)


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

    code_description = discount.description

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.delete",
        resource_type="discount_code",
        resource_id=discount.id,
        details={"code": discount.code, "description": code_description},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # Associations will be deleted by CASCADE
    await db.delete(discount)
    await db.commit()

    return {"message": f"Discount code '{code_description}' deleted successfully"}


# ---------------------------------------------------------------------------
# Bulk generation
# ---------------------------------------------------------------------------


@router.post("/discount-codes/bulk", response_model=BulkDiscountCodeResponse)
async def bulk_create_discount_codes(
    conference_id: UUID,
    bulk_data: BulkDiscountCodeCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BulkDiscountCodeResponse:
    """Bulk-generate discount codes from a list of entries using templates."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    slug = (conference.abbreviation or conference.name or "").upper().replace(" ", "")

    # Generate all codes first to validate uniqueness
    generated: list[tuple[str, str, int]] = []  # (code, description, index)
    seen_codes: set[str] = set()

    for i, entry in enumerate(bulk_data.entries):
        counter = bulk_data.counter_start + i
        variables = {
            "ConferenceSlug": slug,
            "FirstName": entry.first_name,
            "LastName": entry.last_name,
            "FullName": f"{entry.first_name} {entry.last_name}",
            "CompanyName": entry.company_name,
            "Email": entry.email,
            "Counter": str(counter).zfill(bulk_data.counter_padding),
        }

        code = _resolve_template(bulk_data.code_template, variables).upper().replace(" ", "")
        description = _resolve_template(bulk_data.description_template, variables)

        if code in seen_codes:
            raise ValidationError(f"Duplicate generated code: '{code}' (entry {i + 1})")
        seen_codes.add(code)
        generated.append((code, description, i))

    # Check all codes are unique within the conference
    for code, _desc, _idx in generated:
        existing = await db.execute(
            select(DiscountCode.id).where(
                DiscountCode.conference_id == conference.id,
                DiscountCode.tenant_id == conference.tenant_id,
                DiscountCode.code == code,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"Discount code '{code}' already exists in this conference")

    # Create all discount codes
    created_discounts: list[DiscountCode] = []
    for code, description, _idx in generated:
        discount = DiscountCode(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            description=description,
            code=code,
            discount_type=bulk_data.discount_type,
            discount_value=bulk_data.discount_value,
            currency=bulk_data.currency,
            start_date=bulk_data.start_date,
            end_date=bulk_data.end_date,
            max_uses=bulk_data.max_uses,
            is_active=bulk_data.is_active,
            is_combinable=bulk_data.is_combinable,
        )
        db.add(discount)
        created_discounts.append(discount)

    await db.flush()

    # Set associations for each discount
    for discount in created_discounts:
        await _set_applicable_option_ids(db, discount.id, conference.tenant_id, bulk_data.applicable_option_ids)
        await _set_applicable_period_ids(db, discount.id, conference.tenant_id, bulk_data.applicable_period_ids)

    # Single audit log for the batch
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="discount_code.bulk_create",
        resource_type="discount_code",
        resource_id=created_discounts[0].id,
        details={
            "count": len(created_discounts),
            "code_template": bulk_data.code_template,
            "description_template": bulk_data.description_template,
            "conference_id": str(conference.id),
            "codes": [d.code for d in created_discounts],
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()

    # Build responses
    items: list[DiscountCodeResponse] = []
    for discount in created_discounts:
        await db.refresh(discount)
        option_ids = await _get_applicable_option_ids(db, discount.id)
        period_ids = await _get_applicable_period_ids(db, discount.id)
        items.append(_build_response(discount, option_ids, period_ids))

    return BulkDiscountCodeResponse(created=items, total=len(items))
