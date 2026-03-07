"""Tests for invoice line item generation."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.core.invoice_line_items import (
    generate_line_items_for_bulk_registrations,
    generate_line_items_from_registration,
)
from app.models.booking import BookingOption, BookingPeriod, DiscountCode
from app.models.program import ProgramSession
from app.models.registration import BillingProfile, Registration, RegistrationItem


@pytest.mark.asyncio
async def test_generate_line_items_no_session_selection(db_session, tenant, conference):
    """Test line item generation for registration without session selection."""
    # Create booking option
    booking_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    db_session.add(booking_option)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(booking_option.id): 290.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration without session selection (no RegistrationItem for main option)
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period
    )

    # Should have 1 line item with plain booking option name
    assert len(line_items) == 1
    assert line_items[0].description == "Tutorial Day"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 290.00
    assert line_items[0].discount == 0.00
    assert line_items[0].total == 290.00
    assert subtotal == Decimal("290.00")
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_with_session_selection(db_session, tenant, conference):
    """Test line item generation for registration with session selection (no double invoicing)."""
    # Create booking option
    booking_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    db_session.add(booking_option)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(booking_option.id): 290.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration with session selection
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()

    # Create RegistrationItem for main booking option with session selection
    # Note: program_session_id omitted - not needed for invoice generation (uses item_name)
    registration_item = RegistrationItem(
        id=uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        item_type="booking_option",
        booking_option_id=booking_option.id,  # Same as registration's main option
        item_name="Tutorial Day - Back to Testing Basics",
        pending=False,
    )
    db_session.add(registration_item)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period
    )

    # Should have 1 line item with combined name (NOT 2 items)
    assert len(line_items) == 1
    assert line_items[0].description == "Tutorial Day - Back to Testing Basics"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 290.00
    assert line_items[0].discount == 0.00
    assert line_items[0].total == 290.00
    assert subtotal == Decimal("290.00")  # NOT 580.00 (no double charge)
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_with_session_and_addons(db_session, tenant, conference):
    """Test line item generation for registration with session selection and additional items."""
    # Create booking options
    tutorial_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    day1_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 1",
        description="Conference day 1",
        is_active=True,
        sort_order=2,
    )
    day2_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 2",
        description="Conference day 2",
        is_active=True,
        sort_order=3,
    )
    db_session.add_all([tutorial_option, day1_option, day2_option])

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={
            str(tutorial_option.id): 290.00,
            str(day1_option.id): 290.00,
            str(day2_option.id): 290.00,
        },
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration with tutorial as main option
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=tutorial_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()

    # Create RegistrationItems
    # Item 1: Tutorial with session (matches main booking option)
    tutorial_item = RegistrationItem(
        id=uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        item_type="booking_option",
        booking_option_id=tutorial_option.id,  # Same as registration's main option
        item_name="Tutorial Day - Back to Testing Basics",
        pending=False,
    )
    # Item 2: Day 1 (different booking option)
    day1_item = RegistrationItem(
        id=uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        item_type="booking_option",
        booking_option_id=day1_option.id,
        item_name="Day 1",
        pending=False,
    )
    # Item 3: Day 2 (different booking option)
    day2_item = RegistrationItem(
        id=uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        item_type="booking_option",
        booking_option_id=day2_option.id,
        item_name="Day 2",
        pending=False,
    )
    db_session.add_all([tutorial_item, day1_item, day2_item])
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period
    )

    # Should have 3 line items (tutorial with session + day1 + day2)
    assert len(line_items) == 3

    # Check tutorial line item (should use combined name, NOT duplicate)
    tutorial_line = next(item for item in line_items if "Tutorial" in item.description)
    assert tutorial_line.description == "Tutorial Day - Back to Testing Basics"
    assert tutorial_line.quantity == 1
    assert tutorial_line.unit_price == 290.00
    assert tutorial_line.discount == 0.00

    # Check Day 1 line item
    day1_line = next(item for item in line_items if item.description == "Day 1")
    assert day1_line.quantity == 1
    assert day1_line.unit_price == 290.00
    assert day1_line.discount == 0.00

    # Check Day 2 line item
    day2_line = next(item for item in line_items if item.description == "Day 2")
    assert day2_line.quantity == 1
    assert day2_line.unit_price == 290.00
    assert day2_line.discount == 0.00

    # Total should be 870.00 (NOT 1160.00 with double tutorial charge)
    assert subtotal == Decimal("870.00")
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_bulk_no_duplicates(db_session, tenant, conference):
    """Test bulk line item generation doesn't create duplicates."""
    # Create booking option
    tutorial_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    db_session.add(tutorial_option)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(tutorial_option.id): 290.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create 2 registrations with session selections
    registrations = []
    for i in range(2):
        registration = Registration(
            id=uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            billing_profile_id=billing_profile.id,
            booking_option_id=tutorial_option.id,
            first_name=f"Test{i}",
            last_name="User",
            email=f"test{i}@example.com",
            status="registered_pending_invoice",
        )
        db_session.add(registration)
        registrations.append(registration)

    await db_session.commit()

    # Add session selections for both
    for reg in registrations:
        item = RegistrationItem(
            id=uuid4(),
            tenant_id=tenant.id,
            registration_id=reg.id,
            item_type="booking_option",
            booking_option_id=tutorial_option.id,
            item_name="Tutorial Day - Back to Testing Basics",
            pending=False,
        )
        db_session.add(item)

    await db_session.commit()

    # Generate bulk line items
    line_items, subtotal, total_discount = await generate_line_items_for_bulk_registrations(
        db_session, registrations, booking_period
    )

    # Should have 1 consolidated line item with quantity 2 (NOT 2 items or 4 items)
    assert len(line_items) == 1
    assert line_items[0].description == "Tutorial Day - Back to Testing Basics"
    assert line_items[0].quantity == 2
    assert line_items[0].unit_price == 290.00
    assert line_items[0].discount == 0.00
    assert line_items[0].total == 580.00
    assert subtotal == Decimal("580.00")  # 2 people x 290, NOT 1160 with double charge
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_with_main_session_id(db_session, tenant, conference):
    """Test line item generation using main_session_id field (new approach)."""
    # Create booking option
    booking_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    db_session.add(booking_option)

    # Create program session
    program_session = ProgramSession(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        title="Back to Testing Basics",
        description="Testing workshop",
        session_type="tutorial",
    )
    db_session.add(program_session)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(booking_option.id): 290.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration with main_session_id (NEW approach)
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        main_session_id=program_session.id,  # NEW field
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period
    )

    # Should have 1 line item with session title in description
    assert len(line_items) == 1
    assert line_items[0].description == "Tutorial Day - Back to Testing Basics"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 290.00
    assert line_items[0].discount == 0.00
    assert line_items[0].total == 290.00
    assert subtotal == Decimal("290.00")
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_with_percentage_discount(db_session, tenant, conference):
    """Test line item generation with percentage discount code."""
    # Create booking option
    booking_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        description="Full day tutorial",
        is_active=True,
        sort_order=1,
    )
    db_session.add(booking_option)

    # Create discount code (20% off)
    discount_code = DiscountCode(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="LISA",
        description="20% discount",
        discount_type="percentage",
        discount_value=Decimal("20.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount_code)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(booking_option.id): 290.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items WITH discount
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period, discount_code
    )

    # Should have 1 line item with discount applied
    assert len(line_items) == 1
    assert line_items[0].description == "Tutorial Day"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 290.00
    assert line_items[0].discount == 58.00  # 20% of 290
    assert line_items[0].total == 232.00  # 290 - 58
    assert subtotal == Decimal("290.00")
    assert total_discount == Decimal("58.00")


@pytest.mark.asyncio
async def test_generate_line_items_with_fixed_discount(db_session, tenant, conference):
    """Test line item generation with fixed amount discount code."""
    # Create booking option
    booking_option = BookingOption(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Conference Pass",
        description="Full conference access",
        is_active=True,
        sort_order=1,
    )
    db_session.add(booking_option)

    # Create discount code (€50 off)
    discount_code = DiscountCode(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        code="FLAT50",
        description="€50 off",
        discount_type="fixed",
        discount_value=Decimal("50.00"),
        is_active=True,
        max_uses=0,
        usage_count=0,
    )
    db_session.add(discount_code)

    # Create booking period with pricing
    booking_period = BookingPeriod(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Regular",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
        is_active=True,
        sort_order=1,
        prices={str(booking_option.id): 500.00},
        currency="EUR",
    )
    db_session.add(booking_period)

    # Create billing profile
    billing_profile = BillingProfile(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="12345",
        city="Test City",
        country="US",
        contact_first_name="Test",
        contact_last_name="User",
        contact_phone="+1234567890",
        contact_email="test@example.com",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create registration
    registration = Registration(
        id=uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.com",
        status="registered_pending_invoice",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items WITH discount
    line_items, subtotal, total_discount = await generate_line_items_from_registration(
        db_session, registration, booking_period, discount_code
    )

    # Should have 1 line item with fixed discount applied
    assert len(line_items) == 1
    assert line_items[0].description == "Conference Pass"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 500.00
    assert line_items[0].discount == 50.00
    assert line_items[0].total == 450.00  # 500 - 50
    assert subtotal == Decimal("500.00")
    assert total_discount == Decimal("50.00")
