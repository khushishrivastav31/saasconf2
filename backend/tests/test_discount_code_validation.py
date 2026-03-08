"""Tests for discount code validation and application logic."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discount_code_validation import (
    calculate_discount_for_item,
    check_discount_applies_to_option,
    check_discount_applies_to_period,
    increment_discount_usage,
    validate_and_get_discount_code,
)
from app.core.exceptions import ValidationError
from app.models.booking import BookingOption, BookingPeriod, DiscountCode, DiscountCodeOption, DiscountCodePeriod


@pytest.mark.asyncio
async def test_validate_discount_code_valid(db_session: AsyncSession, tenant, conference):
    """Test validating a valid discount code."""
    # Create active discount code
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="VALID20",
        description="Valid 20% discount",
        discount_type="percentage",
        discount_value=Decimal("20.00"),
        is_active=True,
        start_date=date.today() - timedelta(days=1),
        end_date=date.today() + timedelta(days=30),
        max_uses=100,
        usage_count=0,
    )
    db_session.add(discount)
    await db_session.commit()

    # Validate discount code
    result = await validate_and_get_discount_code(
        db_session, "VALID20", conference.id, tenant.id, registration_date=date.today()
    )

    assert result.id == discount.id
    assert result.code == "VALID20"
    assert result.is_active is True


@pytest.mark.asyncio
async def test_validate_discount_code_not_found(db_session: AsyncSession, tenant, conference):
    """Test validating a non-existent discount code."""
    with pytest.raises(ValidationError, match="not found"):
        await validate_and_get_discount_code(db_session, "NOTEXIST", conference.id, tenant.id)


@pytest.mark.asyncio
async def test_validate_discount_code_inactive(db_session: AsyncSession, tenant, conference):
    """Test validating an inactive discount code."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="INACTIVE",
        description="Inactive discount",
        discount_type="percentage",
        discount_value=Decimal("10.00"),
        is_active=False,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)
    await db_session.commit()

    with pytest.raises(ValidationError, match="inactive"):
        await validate_and_get_discount_code(db_session, "INACTIVE", conference.id, tenant.id)


@pytest.mark.asyncio
async def test_validate_discount_code_expired(db_session: AsyncSession, tenant, conference):
    """Test validating an expired discount code."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="EXPIRED",
        description="Expired discount",
        discount_type="percentage",
        discount_value=Decimal("15.00"),
        is_active=True,
        start_date=date.today() - timedelta(days=60),
        end_date=date.today() - timedelta(days=30),
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)
    await db_session.commit()

    with pytest.raises(ValidationError, match="expired"):
        await validate_and_get_discount_code(db_session, "EXPIRED", conference.id, tenant.id, registration_date=date.today())


@pytest.mark.asyncio
async def test_validate_discount_code_not_yet_active(db_session: AsyncSession, tenant, conference):
    """Test validating a discount code that hasn't started yet."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="FUTURE",
        description="Future discount",
        discount_type="percentage",
        discount_value=Decimal("25.00"),
        is_active=True,
        start_date=date.today() + timedelta(days=7),
        end_date=date.today() + timedelta(days=30),
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)
    await db_session.commit()

    with pytest.raises(ValidationError, match="not yet active"):
        await validate_and_get_discount_code(db_session, "FUTURE", conference.id, tenant.id, registration_date=date.today())


@pytest.mark.asyncio
async def test_validate_discount_code_usage_limit(db_session: AsyncSession, tenant, conference):
    """Test validating a discount code that has reached its usage limit."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="MAXED",
        description="Maxed out discount",
        discount_type="percentage",
        discount_value=Decimal("30.00"),
        is_active=True,
        max_uses=10,
        usage_count=10,
    )
    db_session.add(discount)
    await db_session.commit()

    with pytest.raises(ValidationError, match="usage limit"):
        await validate_and_get_discount_code(db_session, "MAXED", conference.id, tenant.id)


@pytest.mark.asyncio
async def test_check_discount_applies_to_option_no_restrictions(db_session: AsyncSession, tenant, conference):
    """Test that discount applies to all options when no restrictions are set."""
    # Create discount with no option restrictions
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="ALLOPT",
        description="All options discount",
        discount_type="percentage",
        discount_value=Decimal("10.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)
    await db_session.commit()

    # Create booking option
    option = BookingOption(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        description="Full access",
        sort_order=1,
    )
    db_session.add(option)
    await db_session.commit()

    # Check if discount applies (should be True since no restrictions)
    applies = await check_discount_applies_to_option(db_session, discount.id, option.id)
    assert applies is True


@pytest.mark.asyncio
async def test_check_discount_applies_to_option_with_restrictions(db_session: AsyncSession, tenant, conference):
    """Test that discount only applies to allowed options when restrictions are set."""
    # Create discount
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="TUTONLY",
        description="Tutorial only discount",
        discount_type="percentage",
        discount_value=Decimal("15.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)

    # Create two booking options
    tutorial = BookingOption(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Tutorial access",
        sort_order=1,
    )
    conference_pass = BookingOption(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Conference Pass",
        description="Conference access",
        sort_order=2,
    )
    db_session.add_all([tutorial, conference_pass])
    await db_session.commit()

    # Add restriction: discount only applies to tutorial
    restriction = DiscountCodeOption(
        discount_code_id=discount.id, booking_option_id=tutorial.id, tenant_id=tenant.id
    )
    db_session.add(restriction)
    await db_session.commit()

    # Check if discount applies to tutorial (should be True)
    applies_to_tutorial = await check_discount_applies_to_option(db_session, discount.id, tutorial.id)
    assert applies_to_tutorial is True

    # Check if discount applies to conference pass (should be False)
    applies_to_conference = await check_discount_applies_to_option(db_session, discount.id, conference_pass.id)
    assert applies_to_conference is False


@pytest.mark.asyncio
async def test_check_discount_applies_to_period_no_restrictions(db_session: AsyncSession, tenant, conference):
    """Test that discount applies to all periods when no restrictions are set."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="ALLPER",
        description="All periods discount",
        discount_type="percentage",
        discount_value=Decimal("5.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)

    period = BookingPeriod(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        prices={},
        currency="EUR",
        is_active=True,
    )
    db_session.add(period)
    await db_session.commit()

    applies = await check_discount_applies_to_period(db_session, discount.id, period.id)
    assert applies is True


@pytest.mark.asyncio
async def test_check_discount_applies_to_period_with_restrictions(db_session: AsyncSession, tenant, conference):
    """Test that discount only applies to allowed periods when restrictions are set."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="EARLYONLY",
        description="Early bird only",
        discount_type="fixed",
        discount_value=Decimal("50.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount)

    early_bird = BookingPeriod(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        prices={},
        currency="EUR",
        is_active=True,
    )
    regular = BookingPeriod(
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Regular",
        start_date=date.today() + timedelta(days=31),
        end_date=date.today() + timedelta(days=60),
        prices={},
        currency="EUR",
        is_active=True,
    )
    db_session.add_all([early_bird, regular])
    await db_session.commit()

    # Add restriction: discount only applies to early bird
    restriction = DiscountCodePeriod(
        discount_code_id=discount.id, booking_period_id=early_bird.id, tenant_id=tenant.id
    )
    db_session.add(restriction)
    await db_session.commit()

    applies_to_early = await check_discount_applies_to_period(db_session, discount.id, early_bird.id)
    assert applies_to_early is True

    applies_to_regular = await check_discount_applies_to_period(db_session, discount.id, regular.id)
    assert applies_to_regular is False


def test_calculate_discount_percentage():
    """Test calculating percentage discount."""
    discount = DiscountCode(
        code="TEST20",
        discount_type="percentage",
        discount_value=Decimal("20.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )

    # 20% of €100 = €20
    result = calculate_discount_for_item(discount, Decimal("100.00"))
    assert result == Decimal("20.00")

    # 20% of €290 = €58
    result = calculate_discount_for_item(discount, Decimal("290.00"))
    assert result == Decimal("58.00")

    # 20% of €50.50 = €10.10
    result = calculate_discount_for_item(discount, Decimal("50.50"))
    assert result == Decimal("10.10")


def test_calculate_discount_fixed():
    """Test calculating fixed discount."""
    discount = DiscountCode(
        code="FLAT50",
        discount_type="fixed",
        discount_value=Decimal("50.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )

    # Fixed €50 discount on €100 = €50
    result = calculate_discount_for_item(discount, Decimal("100.00"))
    assert result == Decimal("50.00")

    # Fixed €50 discount on €290 = €50
    result = calculate_discount_for_item(discount, Decimal("290.00"))
    assert result == Decimal("50.00")


def test_calculate_discount_fixed_exceeds_price():
    """Test that fixed discount never exceeds item price."""
    discount = DiscountCode(
        code="BIG100",
        discount_type="fixed",
        discount_value=Decimal("100.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )

    # Fixed €100 discount on €50 item should cap at €50
    result = calculate_discount_for_item(discount, Decimal("50.00"))
    assert result == Decimal("50.00")

    # Fixed €100 discount on €25 item should cap at €25
    result = calculate_discount_for_item(discount, Decimal("25.00"))
    assert result == Decimal("25.00")


def test_calculate_discount_invalid_type():
    """Test that invalid discount types return 0."""
    discount = DiscountCode(
        code="INVALID",
        discount_type="invalid_type",  # type: ignore
        discount_value=Decimal("20.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )

    result = calculate_discount_for_item(discount, Decimal("100.00"))
    assert result == Decimal("0.00")


@pytest.mark.asyncio
async def test_increment_discount_usage(db_session: AsyncSession, tenant, conference):
    """Test incrementing discount usage count."""
    discount = DiscountCode(
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="INCR",
        description="Usage increment test",
        discount_type="percentage",
        discount_value=Decimal("10.00"),
        is_active=True,
        max_uses=100,
        usage_count=5,
    )
    db_session.add(discount)
    await db_session.commit()

    initial_count = discount.usage_count
    await increment_discount_usage(db_session, discount)

    assert discount.usage_count == initial_count + 1
    assert discount.usage_count == 6
