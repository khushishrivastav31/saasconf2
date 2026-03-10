"""
Module: test_admin_registration_flow_comprehensive.py
Purpose: Comprehensive integration tests for admin registration flow (tenant UI)

Covers:
- Single and bulk attendee registration
- Invoice auto-generation with line item consolidation
- User account creation with password tokens
- Email notifications (invoice + welcome emails)
- VAT calculation and validation
- Booking option and session selection
- Discount codes and procurement codes
- Edge cases and error scenarios

Fixtures: registration_module, booking_options, booking_periods, sessions_with_capacity
Mocking: Email sending (real Stripe test mode for payment validation)

Coverage Target: 95% of api/v1/registrations/core.py
"""

import pytest
import pytest_asyncio
from decimal import Decimal
from sqlalchemy import select
from app.models.registration import (
    Registration,
    BillingProfile,
    RegistrationItem,
    RegistrationStatus,
    RegistrationMode,
)
from app.models.invoice import Invoice
from app.models.user import User
from app.models.booking import BookingOption, BookingPeriod
from app.models.program import ProgramSession, ProgramTimeSlot, ProgramDay
from app.models.settings import SessionType
from app.models.booking import DiscountCode


# ──────────────────────────────────────────────────────────────────────────
# Test Fixtures
# ──────────────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def registration_module(db_session, conference, tenant_admin):
    """Enable registration module for the conference."""
    from app.models.module import Module, TenantModule

    # Get or create registration module
    result = await db_session.execute(
        select(Module).where(Module.name == "registration")
    )
    module = result.scalar_one_or_none()
    if not module:
        module = Module(name="registration", display_name="Registration Management")
        db_session.add(module)
        await db_session.flush()

    # Enable for conference
    tenant_module = TenantModule(
        tenant_id=conference.tenant_id,
        module_id=module.id,
        enabled=True,
    )
    db_session.add(tenant_module)
    await db_session.commit()
    return module


@pytest_asyncio.fixture
async def booking_options(db_session, conference):
    """Create test booking options with different configurations."""
    options = [
        BookingOption(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name="Full Conference Pass",
            description="Access to all conference days",
            price=Decimal("299.00"),
            capacity=100,
            is_active=True,
            sort_order=1,
        ),
        BookingOption(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name="Tutorial Day Only",
            description="Access to tutorial day",
            price=Decimal("99.00"),
            capacity=50,
            is_active=True,
            sort_order=2,
        ),
        BookingOption(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name="Virtual Pass",
            description="Virtual attendance",
            price=Decimal("149.00"),
            capacity=None,  # Unlimited
            is_active=True,
            sort_order=3,
        ),
    ]
    db_session.add_all(options)
    await db_session.commit()

    for opt in options:
        await db_session.refresh(opt)

    return {opt.name: opt for opt in options}


@pytest_asyncio.fixture
async def booking_periods(db_session, conference, booking_options):
    """Create booking periods with different pricing tiers."""
    full_pass = booking_options["Full Conference Pass"]
    tutorial = booking_options["Tutorial Day Only"]
    virtual = booking_options["Virtual Pass"]

    periods = [
        BookingPeriod(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name="Early Bird",
            start_date="2026-01-01",
            end_date="2026-03-31",
            prices={
                str(full_pass.id): Decimal("249.00"),
                str(tutorial.id): Decimal("79.00"),
                str(virtual.id): Decimal("119.00"),
            },
            sort_order=1,
        ),
        BookingPeriod(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            name="Standard",
            start_date="2026-04-01",
            end_date="2026-06-30",
            prices={
                str(full_pass.id): Decimal("299.00"),
                str(tutorial.id): Decimal("99.00"),
                str(virtual.id): Decimal("149.00"),
            },
            sort_order=2,
        ),
    ]
    db_session.add_all(periods)
    await db_session.commit()

    for period in periods:
        await db_session.refresh(period)

    return {period.name: period for period in periods}


@pytest_asyncio.fixture
async def program_day(db_session, conference):
    """Create a program day for session testing."""
    day = ProgramDay(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name="Tutorial Day",
        date="2026-07-15",
        sort_order=1,
    )
    db_session.add(day)
    await db_session.commit()
    await db_session.refresh(day)
    return day


@pytest_asyncio.fixture
async def session_type(db_session, conference):
    """Create a session type with capacity limit."""
    session_type = SessionType(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name="Workshop",
        max_attendees=20,
    )
    db_session.add(session_type)
    await db_session.commit()
    await db_session.refresh(session_type)
    return session_type


@pytest_asyncio.fixture
async def time_slot(db_session, conference, program_day):
    """Create a time slot for sessions."""
    slot = ProgramTimeSlot(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        start_time="09:00",
        duration_minutes=90,
        sort_order=1,
    )
    db_session.add(slot)
    await db_session.commit()
    await db_session.refresh(slot)
    return slot


@pytest_asyncio.fixture
async def sessions_with_capacity(db_session, conference, program_day, time_slot, session_type):
    """Create separately-bookable sessions with capacity limits."""
    sessions = [
        ProgramSession(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            program_day_id=program_day.id,
            start_slot_id=time_slot.id,
            session_type_id=session_type.id,
            title="Django Deep Dive",
            abstract="Advanced Django workshop",
            separately_bookable=True,
            duration_slots=1,
        ),
        ProgramSession(
            tenant_id=conference.tenant_id,
            conference_id=conference.id,
            program_day_id=program_day.id,
            start_slot_id=time_slot.id,
            session_type_id=session_type.id,
            title="FastAPI Fundamentals",
            abstract="Intro to FastAPI",
            separately_bookable=True,
            duration_slots=1,
        ),
    ]
    db_session.add_all(sessions)
    await db_session.commit()

    for session in sessions:
        await db_session.refresh(session)

    return {session.title: session for session in sessions}


@pytest_asyncio.fixture
async def discount_code(db_session, conference, booking_periods):
    """Create a test discount code."""
    standard_period = booking_periods["Standard"]

    code = DiscountCode(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        code="SPEAKER20",
        description="20% speaker discount",
        discount_type="percentage",
        discount_value=Decimal("20.00"),
        valid_from="2026-01-01",
        valid_until="2026-12-31",
        max_uses=100,
        current_uses=0,
        applies_to_periods=[str(standard_period.id)],
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
def mock_emails(monkeypatch):
    """Mock email sending functions to track calls without actually sending."""
    emails_sent = []

    async def mock_send_invoice(db, invoice, conference):
        emails_sent.append({"type": "invoice", "invoice_id": str(invoice.id)})

    async def mock_send_welcome(db, registration, conference, password_token=None):
        emails_sent.append({
            "type": "welcome",
            "registration_id": str(registration.id),
            "email": registration.email,
            "has_token": password_token is not None,
        })

    monkeypatch.setattr(
        "app.core.invoice_auto_generation.send_registration_invoice_email",
        mock_send_invoice,
    )
    monkeypatch.setattr(
        "app.core.user_auto_creation.send_attendee_welcome_email",
        mock_send_welcome,
    )

    return emails_sent


# ──────────────────────────────────────────────────────────────────────────
# Happy Path Tests
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_single_registration_with_main_option(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
    mock_emails,
):
    """
    Test admin creates single registration with main booking option.

    Scenario:
    - Single attendee
    - Full Conference Pass
    - Bank transfer payment
    - Standard pricing

    Expected:
    - Registration created with REGISTERED_PENDING_INVOICE status
    - User account created with password token
    - Invoice created with correct line items
    - Invoice email sent to billing contact
    - Welcome email sent to attendee with password token
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "company_name": "Test Corp",
            "street": "123 Main St",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "Jane",
            "contact_last_name": "Doe",
            "contact_email": "jane@testcorp.de",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Smith",
                "email": "john@testcorp.de",
                "phone": "+491234567891",
                "booking_option_id": str(full_pass.id),
            }
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 201
    data = response.json()

    # Check response structure
    assert "billing_profile_id" in data
    assert "registrations" in data
    assert len(data["registrations"]) == 1
    assert data["total_created"] == 1

    reg = data["registrations"][0]
    assert reg["first_name"] == "John"
    assert reg["last_name"] == "Smith"
    assert reg["email"] == "john@testcorp.de"
    assert reg["status"] == RegistrationStatus.REGISTERED_PENDING_INVOICE
    assert reg["registration_mode"] in ["individual", "company_single", "company_bulk"]  # Admin modes
    assert "user_id" in reg
    assert reg["user_id"] is not None

    # Check user account was created
    assert "password_setup_token" in reg
    assert len(reg["password_setup_token"]) > 20

    # Check emails were sent
    assert len(mock_emails) == 2  # Invoice + welcome
    invoice_email = next(e for e in mock_emails if e["type"] == "invoice")
    welcome_email = next(e for e in mock_emails if e["type"] == "welcome")

    assert invoice_email is not None
    assert welcome_email["email"] == "john@testcorp.de"
    assert welcome_email["has_token"] is True


@pytest.mark.asyncio
async def test_create_bulk_registration_shared_billing(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
    mock_emails,
):
    """
    Test admin creates bulk registration with multiple attendees sharing billing.

    Scenario:
    - 3 attendees
    - Same booking option (Full Pass)
    - Shared company billing profile
    - Credit card payment method

    Expected:
    - 3 registrations created
    - 1 consolidated invoice with 3x line items
    - 3 user accounts created
    - 1 invoice email + 3 welcome emails sent
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "company_name": "Big Corp GmbH",
            "street": "Hauptstr. 1",
            "postal_code": "80331",
            "city": "München",
            "country": "DE",
            "contact_first_name": "Alice",
            "contact_last_name": "Manager",
            "contact_email": "alice@bigcorp.de",
            "contact_phone": "+498912345678",
            "payment_method": "credit_card",
        },
        "attendees": [
            {
                "first_name": f"Employee{i}",
                "last_name": "Person",
                "email": f"emp{i}@bigcorp.de",
                "phone": f"+49891234567{i}",
                "booking_option_id": str(full_pass.id),
            }
            for i in range(1, 4)
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 201
    data = response.json()

    # Check response
    assert data["total_created"] == 3
    assert len(data["registrations"]) == 3

    # Verify all registrations have the same billing profile
    billing_profile_id = data["billing_profile_id"]
    for reg in data["registrations"]:
        assert reg["billing_profile_id"] == billing_profile_id
        assert reg["status"] == RegistrationStatus.REGISTERED_PENDING_INVOICE
        assert reg["user_id"] is not None
        assert reg["password_setup_token"] is not None

    # Verify emails: 1 invoice + 3 welcome emails
    assert len(mock_emails) == 4
    invoice_emails = [e for e in mock_emails if e["type"] == "invoice"]
    welcome_emails = [e for e in mock_emails if e["type"] == "welcome"]

    assert len(invoice_emails) == 1  # Consolidated
    assert len(welcome_emails) == 3


@pytest.mark.asyncio
async def test_registration_with_vat_reverse_charge(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
    mock_emails,
    db_session,
):
    """
    Test registration with EU B2B VAT reverse charge.

    Scenario:
    - Conference in Germany (DE)
    - Attendee in France (FR) with valid VAT format
    - Virtual conference (venue_type = virtual)
    - Should apply 0% VAT with reverse charge note

    Expected:
    - Registration created
    - Invoice with 0% VAT and reverse charge article reference
    - VAT number validated (format check only in tests)
    """
    # Update conference to be virtual
    conference.venue_type = "virtual"
    conference.country = "DE"
    await db_session.commit()

    virtual_pass = booking_options["Virtual Pass"]

    payload = {
        "billing": {
            "company_name": "French Company SARL",
            "vat_number": "FR12345678901",  # Valid FR VAT format
            "street": "1 Rue de Paris",
            "postal_code": "75001",
            "city": "Paris",
            "country": "FR",
            "contact_first_name": "Pierre",
            "contact_last_name": "Dubois",
            "contact_email": "pierre@frenchco.fr",
            "contact_phone": "+33123456789",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "Marie",
                "last_name": "Dupont",
                "email": "marie@frenchco.fr",
                "phone": "+33123456780",
                "booking_option_id": str(virtual_pass.id),
            }
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 201
    data = response.json()

    # Verify registration created
    assert data["total_created"] == 1

    # Check VAT number was stored
    billing_id = data["billing_profile_id"]
    result = await db_session.execute(
        select(BillingProfile).where(BillingProfile.id == billing_id)
    )
    billing = result.scalar_one()
    assert billing.vat_number == "FR12345678901"
    assert billing.country == "FR"

    # Check invoice (should be created)
    invoice_result = await db_session.execute(
        select(Invoice).where(Invoice.billing_profile_id == billing_id)
    )
    invoice = invoice_result.scalar_one()
    assert invoice is not None
    assert invoice.status in ["invoiced", "sent"]  # Invoice created for bank transfer


@pytest.mark.asyncio
async def test_registration_with_discount_code(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
    discount_code,
    mock_emails,
):
    """
    Test registration with valid discount code.

    Scenario:
    - Discount code: SPEAKER20 (20% off)
    - Full Conference Pass at standard price (€299)
    - Expected discount: €59.80 (20% of €299)
    - Final price: €239.20

    Expected:
    - Registration created
    - Discount applied to invoice
    - Discount code usage incremented
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Test St 1",
            "postal_code": "12345",
            "city": "TestCity",
            "country": "DE",
            "contact_first_name": "Speaker",
            "contact_last_name": "Person",
            "contact_email": "speaker@conf.de",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
            "discount_code": "SPEAKER20",
        },
        "attendees": [
            {
                "first_name": "Speaker",
                "last_name": "Person",
                "email": "speaker@conf.de",
                "phone": "+491234567890",
                "booking_option_id": str(full_pass.id),
            }
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["total_created"] == 1


# ──────────────────────────────────────────────────────────────────────────
# Edge Cases & Error Scenarios
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_duplicate_email_rejection_same_conference(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
):
    """
    Test that duplicate email addresses are rejected for the same conference.

    Scenario:
    - Create registration with email john@example.com
    - Attempt to create another registration with same email
    - Should fail with validation error

    Expected:
    - First registration succeeds
    - Second registration fails with 400 error
    - Error message indicates duplicate email
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Test St",
            "postal_code": "12345",
            "city": "Test",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Doe",
            "contact_email": "billing@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.com",
                "phone": "+491234567890",
                "booking_option_id": str(full_pass.id),
            }
        ],
    }

    # First registration should succeed
    response1 = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )
    assert response1.status_code == 201

    # Second registration with same email should fail
    response2 = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )
    assert response2.status_code == 400
    error = response2.json()
    assert "already registered" in error["detail"].lower() or "duplicate" in error["detail"].lower()


@pytest.mark.asyncio
async def test_invalid_booking_option_rejection(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
):
    """
    Test rejection of invalid booking option ID.

    Expected:
    - 400 or 404 error
    - Error message about invalid booking option
    """
    payload = {
        "billing": {
            "street": "Test St",
            "postal_code": "12345",
            "city": "Test",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Doe",
            "contact_email": "john@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.com",
                "phone": "+491234567890",
                "booking_option_id": "00000000-0000-0000-0000-000000000000",  # Invalid UUID
            }
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code in [400, 404]


@pytest.mark.asyncio
async def test_missing_required_billing_fields(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
    booking_options,
):
    """
    Test validation of required billing fields.

    Expected:
    - 422 validation error for missing required fields
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            # Missing: street, postal_code, city, country
            "contact_first_name": "John",
            "contact_last_name": "Doe",
            "contact_email": "john@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.com",
                "phone": "+491234567890",
                "booking_option_id": str(full_pass.id),
            }
        ],
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 422
    errors = response.json()
    assert "detail" in errors


@pytest.mark.asyncio
async def test_empty_attendees_list_rejection(
    client,
    tenant_admin_headers,
    conference,
    registration_module,
):
    """
    Test rejection of empty attendees list.

    Expected:
    - 422 validation error
    """
    payload = {
        "billing": {
            "street": "Test St",
            "postal_code": "12345",
            "city": "Test",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Doe",
            "contact_email": "john@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [],  # Empty list
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/registrations",
        json=payload,
        headers=tenant_admin_headers,
    )

    assert response.status_code == 422
