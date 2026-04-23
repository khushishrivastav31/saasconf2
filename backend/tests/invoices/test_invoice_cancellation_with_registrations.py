"""Tests for invoice cancellation with registration handling."""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _invoices_url(conference_id: uuid.UUID, invoice_id: uuid.UUID | None = None, path: str = "") -> str:
    """Build the invoices endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/invoices"
    if invoice_id:
        base = f"{base}/{invoice_id}"
    if path:
        return f"{base}/{path}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def mock_stripe_refund():
    """Mock Stripe refund for all tests."""
    from unittest.mock import MagicMock

    mock_refund_obj = type(
        "Refund",
        (object,),
        {
            "id": "re_test_12345",
            "status": "succeeded",
            "amount": 200000,  # cents
            "currency": "eur",
            "charge": "ch_test_12345",
        },
    )()

    # Build a mock StripeClient with refunds.create() returning the mock refund
    mock_client = MagicMock()
    mock_client.refunds.create.return_value = mock_refund_obj

    with patch("app.core.stripe_helper.get_stripe_client") as mock_get_client:
        mock_get_client.return_value = mock_client
        yield mock_client.refunds.create


@pytest_asyncio.fixture()
async def invoices_module(db_session: AsyncSession) -> Module:
    """Create the 'invoices' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Invoices",
        code="invoices",
        description="Invoice management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_invoices_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    invoices_module: Module,
) -> Tenant:
    """Associate both conferences and invoices modules with the test tenant."""
    for mod in (conferences_module, invoices_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    tenant.accounting_email = "accounting@testcorp.example"
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token_invoices(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with invoices module."""
    return _make_token(tenant_admin_user, modules=["invoices"])


@pytest_asyncio.fixture()
async def billing_profile_with_registrations(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> tuple[BillingProfile, list[Registration]]:
    """Create a billing profile with 2 registrations."""
    # Create a booking option first (required FK for registrations)
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard Ticket",
        is_active=True,
    )
    db_session.add(booking_option)
    await db_session.flush()

    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Test Company GmbH",
        street="123 Test Street",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+49123456789",
        contact_email="john@testcompany.example",
        vat_number="DE123456789",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    # Create 2 registrations
    registrations = []
    for i in range(2):
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            billing_profile_id=billing_profile.id,
            first_name=f"Attendee{i + 1}",
            last_name="Test",
            email=f"attendee{i + 1}@example.com",
            booking_option_id=booking_option.id,  # Use actual booking option
            status=RegistrationStatus.PAID,
        )
        db_session.add(reg)
        registrations.append(reg)

    await db_session.commit()
    for reg in registrations:
        await db_session.refresh(reg)
    await db_session.refresh(billing_profile)

    return billing_profile, registrations


@pytest_asyncio.fixture()
async def paid_invoice_with_registrations(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
) -> Invoice:
    """Create a paid credit_card invoice linked to registrations."""
    billing_profile, _ = billing_profile_with_registrations

    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-REG-001",
        template_type="credit_card",
        status="paid",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name=billing_profile.company_name or "N/A",
        recipient_email=billing_profile.contact_email,
        recipient_address_line1=billing_profile.street,
        recipient_city=billing_profile.city,
        recipient_postal_code=billing_profile.postal_code,
        recipient_country=billing_profile.country,
        recipient_vat_number=billing_profile.vat_number,
        subtotal=Decimal("2000.00"),
        total=Decimal("2000.00"),
        currency="EUR",
        stripe_payment_intent_id="pi_test_12345",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


# ── Scenario 2a: Paid Invoice Cancellation ────────────────────────────


@pytest.mark.asyncio()
async def test_cancel_paid_credit_card_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_invoice_with_registrations: Invoice,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancelling a paid credit_card invoice with registrations - issues refund + cancels registrations."""
    _, registrations = billing_profile_with_registrations

    # Verify registrations are initially confirmed
    for reg in registrations:
        await db_session.refresh(reg)
        assert reg.status == RegistrationStatus.PAID

    # Cancel invoice with registration cancellation
    response = await client.post(
        _invoices_url(conference.id, paid_invoice_with_registrations.id, "cancel"),
        json={
            "reason": "Event cancelled",
            "cancel_registrations": True,
            "cancellation_email_message": "We apologize for the inconvenience.",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify response
    assert data["cancelled_invoice"]["status"] == "cancelled"
    assert data["registrations_cancelled"] == 2
    # access_removed_count may be 0 if portal users don't exist
    assert data["access_removed_count"] >= 0

    # Verify registrations are now cancelled
    for reg in registrations:
        await db_session.refresh(reg)
        assert reg.status == RegistrationStatus.CANCELLED


@pytest.mark.asyncio()
async def test_cancel_paid_bank_transfer_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancelling paid bank_transfer invoice - no Stripe refund + cancels registrations."""
    billing_profile, _registrations = billing_profile_with_registrations

    # Create paid bank transfer invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-BT-REG-001",
        template_type="bank_transfer",
        status="paid",
        issue_date=date(2026, 3, 1),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name="Company Ltd",
        recipient_email=billing_profile.contact_email,
        subtotal=Decimal("1500.00"),
        total=Decimal("1500.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Cancel with registrations
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Refund requested",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify cancellation
    assert data["cancelled_invoice"]["status"] == "cancelled"
    assert data["registrations_cancelled"] == 2


@pytest.mark.asyncio()
async def test_cancel_paid_removes_conference_access(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_invoice_with_registrations: Invoice,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancellation removes UserConferenceAccess but keeps user account."""
    _, registrations = billing_profile_with_registrations

    # Create portal users for attendees
    portal_users = []
    for reg in registrations:
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant_with_invoices_module.id,
            email=reg.email,
            password_hash=hash_password("testpassword"),
            first_name=reg.first_name,
            last_name=reg.last_name,
            role="user",
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()

        # Grant conference access
        access = UserConferenceAccess(
            id=uuid.uuid4(),
            user_id=user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        portal_users.append(user)

    await db_session.commit()

    # Verify access exists
    result = await db_session.execute(
        select(UserConferenceAccess).where(
            UserConferenceAccess.conference_id == conference.id,
        )
    )
    access_records = result.scalars().all()
    assert len(access_records) == 2

    # Cancel invoice with registrations
    response = await client.post(
        _invoices_url(conference.id, paid_invoice_with_registrations.id, "cancel"),
        json={
            "reason": "Test cancellation",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["access_removed_count"] == 2

    # Verify conference access removed
    result = await db_session.execute(
        select(UserConferenceAccess).where(
            UserConferenceAccess.conference_id == conference.id,
        )
    )
    access_records = result.scalars().all()
    assert len(access_records) == 0

    # Verify user accounts still exist
    for user in portal_users:
        await db_session.refresh(user)
        assert user.is_active is True


@pytest.mark.asyncio()
async def test_cancel_paid_sends_attendee_emails(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_invoice_with_registrations: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test cancellation flow includes email sending (verified by no errors)."""
    response = await client.post(
        _invoices_url(conference.id, paid_invoice_with_registrations.id, "cancel"),
        json={
            "reason": "Conference postponed",
            "cancel_registrations": True,
            "cancellation_email_message": "The conference has been postponed. We will contact you with new dates.",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Email sending is best-effort, we just verify the endpoint succeeded
    assert data["registrations_cancelled"] == 2


# ── Scenario 2b: Sent Invoice Cancellation ────────────────────────────


@pytest.mark.asyncio()
async def test_cancel_sent_credit_card_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancelling sent credit_card invoice - deactivates link + cancels registrations."""
    billing_profile, _registrations = billing_profile_with_registrations

    # Create sent credit card invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-SENT-CC-REG-001",
        template_type="credit_card",
        status="sent",
        issue_date=date(2026, 3, 1),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name="Company GmbH",
        recipient_email=billing_profile.contact_email,
        subtotal=Decimal("2500.00"),
        total=Decimal("2500.00"),
        currency="EUR",
        stripe_payment_link_url="https://buy.stripe.com/test_link",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Cancel with registrations
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Customer requested cancellation",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify cancellation
    assert data["cancelled_invoice"]["status"] == "cancelled"
    assert data["registrations_cancelled"] == 2


@pytest.mark.asyncio()
async def test_cancel_sent_bank_transfer_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancelling sent bank_transfer invoice - no Stripe + cancels registrations."""
    billing_profile, _ = billing_profile_with_registrations

    # Create sent bank transfer invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-SENT-BT-REG-001",
        template_type="bank_transfer",
        status="sent",
        issue_date=date(2026, 3, 1),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name="Business Ltd",
        recipient_email=billing_profile.contact_email,
        subtotal=Decimal("1800.00"),
        total=Decimal("1800.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Cancel with registrations
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Registration cancelled",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["registrations_cancelled"] == 2


@pytest.mark.asyncio()
async def test_cancel_sent_overdue_invoice_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancelling overdue invoice - works same as sent."""
    billing_profile, _ = billing_profile_with_registrations

    # Create overdue invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-OVERDUE-REG-001",
        template_type="bank_transfer",
        status="overdue",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 2, 1),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name="Late Corp",
        recipient_email=billing_profile.contact_email,
        subtotal=Decimal("1000.00"),
        total=Decimal("1000.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Cancel with registrations
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Non-payment",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["registrations_cancelled"] == 2


@pytest.mark.asyncio()
async def test_cancel_creates_full_audit_trail(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_invoice_with_registrations: Invoice,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test that cancellation creates comprehensive audit logs."""
    from app.models.audit import AuditLog

    # Cancel with registrations
    response = await client.post(
        _invoices_url(conference.id, paid_invoice_with_registrations.id, "cancel"),
        json={
            "reason": "Audit trail test",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200

    # Check audit logs were created
    result = await db_session.execute(
        select(AuditLog).where(
            AuditLog.resource_type.in_(["invoice", "registration", "user_conference_access"]),
        )
    )
    audit_logs = result.scalars().all()

    # Should have logs for: invoice.cancelled, credit_note_created, registration cancellations
    assert len(audit_logs) >= 3  # At minimum


# ── Without Registrations ──────────────────────────────────────────────


@pytest.mark.asyncio()
async def test_cancel_without_registrations_flag_keeps_active(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_invoice_with_registrations: Invoice,
    billing_profile_with_registrations: tuple[BillingProfile, list[Registration]],
    admin_token_invoices: str,
) -> None:
    """Test cancel_registrations=false leaves registrations active."""
    _, registrations = billing_profile_with_registrations

    # Verify registrations are initially confirmed
    for reg in registrations:
        await db_session.refresh(reg)
        assert reg.status == RegistrationStatus.PAID

    # Cancel invoice WITHOUT registration cancellation
    response = await client.post(
        _invoices_url(conference.id, paid_invoice_with_registrations.id, "cancel"),
        json={
            "reason": "Invoice correction needed",
            "cancel_registrations": False,  # Keep registrations active
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify no registrations cancelled
    assert data["registrations_cancelled"] == 0
    assert data["access_removed_count"] == 0

    # Verify registrations still active
    for reg in registrations:
        await db_session.refresh(reg)
        assert reg.status == RegistrationStatus.PAID


@pytest.mark.asyncio()
async def test_cancel_no_registrations_error(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test error when cancel_registrations=true but no registrations exist."""
    # Create invoice WITHOUT registrations
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-NO-REG-001",
        template_type="bank_transfer",
        status="sent",
        recipient_name="Sponsor Corp",
        recipient_email="sponsor@example.com",
        subtotal=Decimal("5000.00"),
        total=Decimal("5000.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Try to cancel with registration cancellation flag
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Test",
            "cancel_registrations": True,
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 400
    assert "not linked to any registrations" in response.json()["detail"].lower()
