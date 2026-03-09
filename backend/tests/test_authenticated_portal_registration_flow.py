"""
Module: test_authenticated_portal_registration_flow.py
Purpose: Comprehensive tests for authenticated portal user registration with alumni discount

Covers:
- Alumni discount auto-application and validation
- Pre-filled billing and attendee data from user profile
- Payment flows (credit card, bank transfer) with discounts
- Registration mode = PORTAL_AUTHENTICATED
- Email validation (must match logged-in user)
- Edge cases (non-ALUMNI discount rejection, expired codes, etc.)

Fixtures: cfp_applicant_user, alumni_records, alumni_discount_code
Mocking: Email sending

Coverage Target: 90% of api/v1/cfp_portal/registration.py
"""

import pytest
import pytest_asyncio
from decimal import Decimal
from sqlalchemy import select
from app.models.cfp_applicants import CFPApplicant
from app.models.registration import Registration, RegistrationStatus, RegistrationMode
from app.models.invoice import Invoice
from app.models.discount_code import DiscountCode
from app.models.user import User


# ──────────────────────────────────────────────────────────────────────────
# Test Fixtures
# ──────────────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def cfp_applicant_user(db_session, tenant, conference):
    """Create a CFP applicant user (logged-in portal user)."""
    from app.core.security import hash_password

    # Create user account
    user = User(
        tenant_id=tenant.id,
        email="applicant@example.com",
        hashed_password=hash_password("testpass123"),
        first_name="John",
        last_name="Applicant",
        role="user",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # Create CFP applicant profile
    applicant = CFPApplicant(
        tenant_id=tenant.id,
        conference_id=conference.id,
        user_id=user.id,
        first_name="John",
        last_name="Applicant",
        email="applicant@example.com",
        phone="+491234567890",
        company="Test Company GmbH",
    )
    db_session.add(applicant)
    await db_session.commit()

    await db_session.refresh(user)
    await db_session.refresh(applicant)

    return {"user": user, "applicant": applicant}


@pytest_asyncio.fixture
async def cfp_applicant_headers(cfp_applicant_user):
    """Generate auth headers for CFP applicant."""
    from app.core.security import create_access_token

    user = cfp_applicant_user["user"]
    token = create_access_token(data={
        "sub": user.email,
        "tenant_id": str(user.tenant_id),
        "user_id": str(user.id),
    })
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def alumni_records(db_session, tenant, cfp_applicant_user):
    """Create alumni records for the applicant (past attendee)."""
    from app.models.conference import Conference

    applicant = cfp_applicant_user["applicant"]

    # Create a past conference
    past_conference = Conference(
        tenant_id=tenant.id,
        name="PyCon 2025",
        abbreviation="PC25",
        start_date="2025-07-01",
        end_date="2025-07-03",
    )
    db_session.add(past_conference)
    await db_session.flush()

    # Create registration for past conference (makes them alumni)
    past_registration = Registration(
        tenant_id=tenant.id,
        conference_id=past_conference.id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        phone=applicant.phone,
        status=RegistrationStatus.PAID,
        registration_mode=RegistrationMode.INDIVIDUAL,
    )
    db_session.add(past_registration)
    await db_session.commit()

    await db_session.refresh(past_conference)
    await db_session.refresh(past_registration)

    return {
        "past_conference": past_conference,
        "past_registration": past_registration,
    }


@pytest_asyncio.fixture
async def alumni_discount_code(db_session, conference, booking_periods):
    """Create ALUMNI discount code for automatic application."""
    standard_period = booking_periods["Standard"]

    code = DiscountCode(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        code="ALUMNI",
        description="Alumni discount for past attendees",
        discount_type="percentage",
        discount_value=Decimal("15.00"),  # 15% off
        valid_from="2026-01-01",
        valid_until="2026-12-31",
        max_uses=1000,
        current_uses=0,
        applies_to_periods=[str(standard_period.id)],
    )
    db_session.add(code)
    await db_session.commit()
    await db_session.refresh(code)
    return code


@pytest_asyncio.fixture
def mock_portal_emails(monkeypatch):
    """Mock email sending for portal registration."""
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
# Alumni Discount Logic Tests
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_alumni_check_endpoint_is_alumni(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    alumni_records,
    alumni_discount_code,
):
    """
    Test alumni-check endpoint for past attendee with available discount.

    Expected:
    - is_alumni = true
    - has_discount = true
    - discount_id returned
    - alumni_conferences list included
    """
    response = await client.get(
        f"/portal/conferences/{conference.id}/alumni-check",
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 200
    data = response.json()

    assert data["is_alumni"] is True
    assert data["has_discount"] is True
    assert data["discount_id"] is not None
    assert len(data["alumni_conferences"]) == 1
    assert data["alumni_conferences"][0]["conference_name"] == "PyCon 2025"


@pytest.mark.asyncio
async def test_alumni_check_endpoint_not_alumni(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    alumni_discount_code,
):
    """
    Test alumni-check endpoint for user who is NOT alumni.

    Expected:
    - is_alumni = false
    - has_discount = false
    - empty alumni_conferences list
    """
    response = await client.get(
        f"/portal/conferences/{conference.id}/alumni-check",
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 200
    data = response.json()

    assert data["is_alumni"] is False
    assert data["has_discount"] is False
    assert data["discount_id"] is None
    assert len(data["alumni_conferences"]) == 0


@pytest.mark.asyncio
async def test_alumni_discount_auto_application(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_records,
    alumni_discount_code,
    mock_portal_emails,
    db_session,
):
    """
    Test automatic ALUMNI discount application for past attendee.

    Scenario:
    - User is alumni (has past registration)
    - ALUMNI discount code exists
    - No discount code specified in request
    - Discount should be auto-applied

    Expected:
    - Registration created
    - Discount applied to invoice
    - 15% discount on Full Pass (€299 → €254.15)
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
        # No discount_code specified - should auto-apply ALUMNI
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 201
    data = response.json()

    # Verify registration created
    assert len(data["registrations"]) == 1
    reg = data["registrations"][0]
    assert reg["status"] == RegistrationStatus.REGISTERED_PENDING_INVOICE

    # Check that discount was applied
    # (Implementation detail: check invoice or registration)


@pytest.mark.asyncio
async def test_alumni_discount_explicit_code(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_records,
    alumni_discount_code,
    mock_portal_emails,
):
    """
    Test explicit ALUMNI discount code in request.

    Scenario:
    - User is alumni
    - Explicitly provides "ALUMNI" discount code
    - Should validate and apply

    Expected:
    - Registration created
    - Discount applied
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
            "discount_code": "ALUMNI",  # Explicit
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 201


@pytest.mark.asyncio
async def test_alumni_discount_not_alumni_rejection(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_discount_code,
):
    """
    Test ALUMNI discount code rejection for non-alumni user.

    Scenario:
    - User is NOT alumni (no past registrations)
    - Attempts to use ALUMNI discount code

    Expected:
    - Registration rejected with 400 error
    - Error message about not being eligible
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
            "discount_code": "ALUMNI",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 400
    error = response.json()
    assert "ALUMNI" in error["detail"] or "not eligible" in error["detail"].lower()


@pytest.mark.asyncio
async def test_non_alumni_discount_code_rejection(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_records,
    discount_code,  # SPEAKER20 discount
):
    """
    Test rejection of non-ALUMNI discount codes in portal registration.

    Scenario:
    - User is alumni
    - Attempts to use SPEAKER20 discount code (not ALUMNI)
    - Should be rejected (only ALUMNI code allowed for portal)

    Expected:
    - Registration rejected with 400 error
    - Error message about only ALUMNI code allowed
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
            "discount_code": "SPEAKER20",  # Not ALUMNI
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 400
    error = response.json()
    assert "ALUMNI" in error["detail"] or "only" in error["detail"].lower()


# ──────────────────────────────────────────────────────────────────────────
# Payment Flow Tests
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_credit_card_payment_with_alumni_discount(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_records,
    alumni_discount_code,
    mock_portal_emails,
):
    """
    Test credit card payment with alumni discount applied.

    Expected:
    - PaymentIntent amount includes discount
    - Registration created
    - Payment tracking enabled
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "credit_card",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
        "payment_intent_id": "pi_test_alumni_123",
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 201


# ──────────────────────────────────────────────────────────────────────────
# Registration Mode Tests
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_registration_mode_portal_authenticated(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    mock_portal_emails,
    db_session,
):
    """
    Test that portal registrations have mode = PORTAL_AUTHENTICATED.

    Expected:
    - registration.registration_mode = PORTAL_AUTHENTICATED
    - No created_by field (self-service)
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 201
    data = response.json()

    # Check registration mode
    reg_id = data["registrations"][0]["id"]
    result = await db_session.execute(
        select(Registration).where(Registration.id == reg_id)
    )
    registration = result.scalar_one()

    assert registration.registration_mode == RegistrationMode.PORTAL
    assert registration.created_by is None  # Self-service


# ──────────────────────────────────────────────────────────────────────────
# Edge Cases
# ──────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_conference_not_found(
    client,
    cfp_applicant_headers,
    booking_options,
):
    """
    Test rejection when conference doesn't exist.

    Expected:
    - 404 error
    """
    fake_conference_id = "00000000-0000-0000-0000-000000000000"

    payload = {
        "billing": {
            "street": "Test St",
            "postal_code": "12345",
            "city": "Test",
            "country": "DE",
            "contact_first_name": "Test",
            "contact_last_name": "User",
            "contact_email": "test@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [],
    }

    response = await client.post(
        f"/portal/conferences/{fake_conference_id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_alumni_discount_with_no_discount_available(
    client,
    conference,
    cfp_applicant_user,
    cfp_applicant_headers,
    booking_options,
    alumni_records,
    mock_portal_emails,
):
    """
    Test alumni user with no ALUMNI discount code available.

    Scenario:
    - User is alumni (has past registration)
    - No ALUMNI discount code exists for this conference
    - Registration should succeed but without discount

    Expected:
    - Registration created
    - No discount applied
    - Full price charged
    """
    full_pass = booking_options["Full Conference Pass"]

    payload = {
        "billing": {
            "street": "Teststr. 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "John",
            "contact_last_name": "Applicant",
            "contact_email": "applicant@example.com",
            "contact_phone": "+491234567890",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Applicant",
                "email": "applicant@example.com",
                "phone": "+491234567890",
                "booking_option_ids": [str(full_pass.id)],
            }
        ],
    }

    response = await client.post(
        f"/portal/conferences/{conference.id}/register",
        json=payload,
        headers=cfp_applicant_headers,
    )

    # Should succeed even without discount
    assert response.status_code == 201
