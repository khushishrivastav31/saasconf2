"""Unit tests for automatic registration invoice generation workflow."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.booking_helpers import get_active_booking_period
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.invoice_line_items import (
    generate_line_items_for_bulk_registrations,
    generate_line_items_from_registration,
)
from app.core.user_auto_creation import create_user_for_registration
from app.models.booking import BookingOption, BookingPeriod
from app.models.registration import BillingProfile, Registration

# ── Booking Period Tests ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_active_booking_period_by_date(db_session, conference, tenant):
    """Get active booking period where today falls within date range."""
    today = date.today()

    # Create active period covering today
    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Early Bird",
        start_date=today - timedelta(days=10),
        end_date=today + timedelta(days=10),
        sort_order=1,
        currency="EUR",
        prices={"option1": 100.0, "option2": 200.0},
        is_active=True,
    )
    db_session.add(period)
    await db_session.commit()

    result = await get_active_booking_period(db_session, conference.id, tenant.id, today)

    assert result is not None
    assert result.id == period.id
    assert result.name == "Early Bird"


@pytest.mark.asyncio
async def test_get_active_booking_period_fallback(db_session, conference, tenant):
    """Fall back to first active period if no exact match by date."""
    today = date.today()

    # Create period that doesn't cover today
    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Future Period",
        start_date=today + timedelta(days=30),
        end_date=today + timedelta(days=60),
        sort_order=1,
        currency="EUR",
        prices={},
        is_active=True,
    )
    db_session.add(period)
    await db_session.commit()

    result = await get_active_booking_period(db_session, conference.id, tenant.id, today)

    assert result is not None
    assert result.id == period.id  # Falls back to first active period


@pytest.mark.asyncio
async def test_get_active_booking_period_none(db_session, conference, tenant):
    """Return None if no active periods exist."""
    result = await get_active_booking_period(db_session, conference.id, tenant.id, date.today())

    assert result is None


# ── Line Item Generation Tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_line_items_single_registration(db_session, conference, tenant):
    """Generate line items for single registration with main option."""
    # Create booking option and period
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=10),
        sort_order=1,
        currency="EUR",
        prices={str(option.id): 299.0},
        is_active=True,
    )
    db_session.add(period)

    # Create billing profile and registration
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="FR",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+33123456789",
        contact_email="john@example.com",
    )
    db_session.add(billing)

    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="John",
        last_name="Doe",
        email="john@example.com",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Generate line items
    line_items, subtotal, total_discount = await generate_line_items_from_registration(db_session, registration, period)

    assert len(line_items) == 1
    assert line_items[0].description == "Full Conference Pass"
    assert line_items[0].quantity == 1
    assert line_items[0].unit_price == 299.0
    assert line_items[0].total == 299.0
    assert subtotal == Decimal("299.00")
    assert total_discount == Decimal("0.00")


@pytest.mark.asyncio
async def test_generate_line_items_bulk_consolidated(db_session, conference, tenant):
    """Generate consolidated line items for bulk registrations."""
    # Create two booking options
    option1 = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial",
        sort_order=1,
        is_active=True,
    )
    option2 = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Conference Pass",
        sort_order=2,
        is_active=True,
    )
    db_session.add_all([option1, option2])

    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=10),
        sort_order=1,
        currency="EUR",
        prices={str(option1.id): 100.0, str(option2.id): 299.0},
        is_active=True,
    )
    db_session.add(period)

    # Create billing profile and 3 registrations (2 Tutorial, 1 Conference)
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="FR",
        contact_first_name="Admin",
        contact_last_name="User",
        contact_phone="+33123456789",
        contact_email="admin@example.com",
    )
    db_session.add(billing)

    reg1 = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option1.id,
        first_name="Alice",
        last_name="Smith",
        email="alice@example.com",
    )
    reg2 = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option1.id,
        first_name="Bob",
        last_name="Jones",
        email="bob@example.com",
    )
    reg3 = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option2.id,
        first_name="Charlie",
        last_name="Brown",
        email="charlie@example.com",
    )
    db_session.add_all([reg1, reg2, reg3])
    await db_session.commit()
    await db_session.refresh(reg1)
    await db_session.refresh(reg2)
    await db_session.refresh(reg3)

    # Generate consolidated line items
    line_items, subtotal, _total_discount = await generate_line_items_for_bulk_registrations(
        db_session, [reg1, reg2, reg3], period
    )

    # Should have 2 line items: Tutorial (x2) and Conference Pass (x1)
    assert len(line_items) == 2

    # Find Tutorial and Conference Pass line items
    tutorial_item = next((li for li in line_items if li.description == "Tutorial"), None)
    conference_item = next((li for li in line_items if li.description == "Conference Pass"), None)

    assert tutorial_item is not None
    assert tutorial_item.quantity == 2
    assert tutorial_item.unit_price == 100.0
    assert tutorial_item.total == 200.0

    assert conference_item is not None
    assert conference_item.quantity == 1
    assert conference_item.unit_price == 299.0
    assert conference_item.total == 299.0

    assert subtotal == Decimal("499.00")


# ── Invoice Auto-Generation Tests ──────────────────────────────────


@pytest.mark.asyncio
async def test_create_invoice_for_registration(db_session, conference, tenant):
    """Create invoice for single registration with VAT calculation."""
    # Create booking option and period
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=10),
        sort_order=1,
        currency="EUR",
        prices={str(option.id): 100.0},
        is_active=True,
    )
    db_session.add(period)

    # Create billing profile and registration
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Test Corp",
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="France",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+33123456789",
        contact_email="john@example.com",
        vat_number="FR12345678901",
    )
    db_session.add(billing)

    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="John",
        last_name="Doe",
        email="john@example.com",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Create invoice
    invoice = await create_invoice_for_registrations(db_session, [registration], billing, conference, tenant.id)

    assert invoice is not None
    assert invoice.invoice_number is not None
    assert invoice.status == "sent"
    assert invoice.recipient_source_type == "registration"
    assert invoice.recipient_source_id == billing.id
    assert invoice.recipient_name == "Test Corp"
    assert invoice.recipient_email == "john@example.com"
    assert invoice.recipient_vat_number == "FR12345678901"
    assert invoice.subtotal == Decimal("100.00")
    assert invoice.currency == "EUR"
    assert invoice.vat_auto_calculated is True
    assert len(invoice.line_items) == 1
    assert invoice.line_items[0]["description"] == "Full Pass"


@pytest.mark.asyncio
async def test_create_invoice_idempotency(db_session, conference, tenant):
    """Invoice creation is idempotent - returns existing invoice."""
    # Setup booking option and period
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    period = BookingPeriod(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() + timedelta(days=10),
        sort_order=1,
        currency="EUR",
        prices={str(option.id): 100.0},
        is_active=True,
    )
    db_session.add(period)

    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="France",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+33123456789",
        contact_email="john@example.com",
    )
    db_session.add(billing)

    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="John",
        last_name="Doe",
        email="john@example.com",
    )
    db_session.add(registration)
    await db_session.commit()
    await db_session.refresh(registration)

    # Create invoice first time
    invoice1 = await create_invoice_for_registrations(db_session, [registration], billing, conference, tenant.id)
    await db_session.commit()

    # Try to create again - should return existing
    invoice2 = await create_invoice_for_registrations(db_session, [registration], billing, conference, tenant.id)

    assert invoice1.id == invoice2.id
    assert invoice1.invoice_number == invoice2.invoice_number


# ── User Auto-Creation Tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_user_for_registration(db_session, conference, tenant):
    """Create user account with password setup token."""
    # Create booking option
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    # Create billing profile and registration
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="France",
        contact_first_name="Admin",
        contact_last_name="User",
        contact_phone="+33123456789",
        contact_email="admin@example.com",
    )
    db_session.add(billing)

    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="Jane",
        last_name="Smith",
        email="jane@example.com",
    )
    db_session.add(registration)
    await db_session.commit()

    # Create user
    user, raw_token = await create_user_for_registration(db_session, registration, tenant.id)

    assert user is not None
    assert user.email == "jane@example.com"
    assert user.first_name == "Jane"
    assert user.last_name == "Smith"
    assert user.tenant_id == tenant.id
    assert user.role == "user"
    assert user.is_active is True
    assert user.has_all_conference_access is False

    assert raw_token is not None  # Should have password setup token
    assert len(raw_token) > 20  # Token should be substantial length


@pytest.mark.asyncio
async def test_create_user_idempotency(db_session, conference, tenant):
    """User creation is idempotent - returns existing user without new token."""
    # Create booking option
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    # Create billing profile and registration
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="France",
        contact_first_name="Admin",
        contact_last_name="User",
        contact_phone="+33123456789",
        contact_email="admin@example.com",
    )
    db_session.add(billing)

    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="Bob",
        last_name="Jones",
        email="bob@example.com",
    )
    db_session.add(registration)
    await db_session.commit()

    # Create user first time
    user1, token1 = await create_user_for_registration(db_session, registration, tenant.id)
    await db_session.commit()

    # Try to create again
    user2, token2 = await create_user_for_registration(db_session, registration, tenant.id)

    assert user1.id == user2.id
    assert user1.email == user2.email
    assert token1 is not None  # First creation has token
    assert token2 is None  # Second creation returns no token (existing user)


@pytest.mark.asyncio
async def test_create_user_case_insensitive_email(db_session, conference, tenant):
    """User lookup is case-insensitive on email."""
    # Create booking option
    option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Pass",
        sort_order=1,
        is_active=True,
    )
    db_session.add(option)

    # Create billing profile
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="France",
        contact_first_name="Admin",
        contact_last_name="User",
        contact_phone="+33123456789",
        contact_email="admin@example.com",
    )
    db_session.add(billing)

    # Create first registration with lowercase email
    reg1 = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,
        first_name="Alice",
        last_name="Test",
        email="alice@example.com",
    )
    db_session.add(reg1)
    await db_session.commit()

    # Create user
    user1, token1 = await create_user_for_registration(db_session, reg1, tenant.id)
    await db_session.commit()

    # Create second registration with UPPERCASE email
    reg2 = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing.id,
        booking_option_id=option.id,  # Use same option as reg1
        first_name="Alice",
        last_name="Test",
        email="ALICE@EXAMPLE.COM",
    )
    db_session.add(reg2)
    await db_session.commit()

    # Try to create user with uppercase email
    user2, token2 = await create_user_for_registration(db_session, reg2, tenant.id)

    # Should find existing user (case-insensitive)
    assert user1.id == user2.id
    assert token1 is not None
    assert token2 is None  # No new token for existing user
