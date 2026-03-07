"""Discount code validation and application logic."""

import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.booking import DiscountCode, DiscountCodeOption, DiscountCodePeriod

logger = logging.getLogger(__name__)


async def validate_and_get_discount_code(
    db: AsyncSession,
    code: str,
    conference_id: UUID,
    tenant_id: UUID,
    registration_date: date | None = None,
) -> DiscountCode:
    """Validate discount code and return if valid.

    Checks: existence, is_active, date range, usage limit.

    Raises:
        ValidationError if code is invalid

    Returns:
        DiscountCode instance if valid
    """
    stmt = select(DiscountCode).where(
        DiscountCode.code == code,
        DiscountCode.conference_id == conference_id,
        DiscountCode.tenant_id == tenant_id,
    )
    result = await db.execute(stmt)
    discount = result.scalar_one_or_none()

    if not discount:
        raise ValidationError(f"Discount code '{code}' not found")

    if not discount.is_active:
        raise ValidationError(f"Discount code '{code}' is inactive")

    # Check date range
    check_date = registration_date or date.today()
    if discount.start_date and check_date < discount.start_date:
        raise ValidationError(f"Discount code '{code}' is not yet active")
    if discount.end_date and check_date > discount.end_date:
        raise ValidationError(f"Discount code '{code}' has expired")

    # Check usage limit
    if discount.max_uses > 0 and discount.usage_count >= discount.max_uses:
        raise ValidationError(f"Discount code '{code}' has reached its usage limit")

    return discount


async def check_discount_applies_to_option(
    db: AsyncSession,
    discount_code_id: UUID,
    booking_option_id: UUID,
) -> bool:
    """Check if discount applies to a booking option.

    Returns True if no restrictions OR option is in allowed list.
    """
    # Check if there are any restrictions
    stmt = select(DiscountCodeOption).where(DiscountCodeOption.discount_code_id == discount_code_id).limit(1)
    result = await db.execute(stmt)
    has_restrictions = result.scalar_one_or_none() is not None

    # If no restrictions, applies to all
    if not has_restrictions:
        return True

    # Check if this option is allowed
    stmt = select(DiscountCodeOption).where(
        DiscountCodeOption.discount_code_id == discount_code_id,
        DiscountCodeOption.booking_option_id == booking_option_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def check_discount_applies_to_period(
    db: AsyncSession,
    discount_code_id: UUID,
    booking_period_id: UUID,
) -> bool:
    """Check if discount applies to a booking period."""
    stmt = select(DiscountCodePeriod).where(DiscountCodePeriod.discount_code_id == discount_code_id).limit(1)
    result = await db.execute(stmt)
    has_restrictions = result.scalar_one_or_none() is not None

    if not has_restrictions:
        return True

    stmt = select(DiscountCodePeriod).where(
        DiscountCodePeriod.discount_code_id == discount_code_id,
        DiscountCodePeriod.booking_period_id == booking_period_id,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


def calculate_discount_for_item(
    discount_code: DiscountCode,
    item_subtotal: Decimal,
) -> Decimal:
    """Calculate discount amount for a line item.

    Returns discount amount (always >= 0, never exceeds item price).
    """
    if discount_code.discount_type == "percentage":
        discount_amount = item_subtotal * (discount_code.discount_value / Decimal("100"))
    elif discount_code.discount_type == "fixed":
        discount_amount = min(discount_code.discount_value, item_subtotal)
    else:
        discount_amount = Decimal("0.00")

    return discount_amount.quantize(Decimal("0.01"))


async def increment_discount_usage(
    db: AsyncSession,
    discount_code: DiscountCode,
) -> None:
    """Increment usage_count for discount code."""
    discount_code.usage_count += 1
    logger.info(f"Incremented usage count for discount code '{discount_code.code}' to {discount_code.usage_count}")
