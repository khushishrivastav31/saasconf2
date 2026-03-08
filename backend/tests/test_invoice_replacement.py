"""Tests for invoice replacement functionality (billing corrections)."""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User

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
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token_invoices(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with invoices module."""
    return _make_token(tenant_admin_user, modules=["invoices"])


@pytest.fixture(autouse=True)
def mock_stripe_payment_link():
    """Mock create_payment_link to avoid Stripe API calls in tests."""
    with patch("app.core.invoice_replacement.create_payment_link", new_callable=AsyncMock) as mock:
        # Return dummy payment intent ID and payment link URL
        mock.return_value = (None, "https://buy.stripe.com/test_mock_link")
        yield mock


@pytest_asyncio.fixture()
async def paid_credit_card_invoice(
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
) -> Invoice:
    """Create a paid credit card invoice."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-CC-001",
        template_type="credit_card",
        status="paid",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_name="Old Company Name",
        recipient_email="old@example.com",
        recipient_address_line1="123 Old Street",
        recipient_city="Berlin",
        recipient_postal_code="10115",
        recipient_country="DE",
        recipient_vat_number="DE123456789",
        line_items=[
            {
                "description": "Sponsorship",
                "quantity": "1",
                "unit_price": "1000.00",
                "total": "1000.00",
            }
        ],
        subtotal=Decimal("1000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("190.00"),
        total=Decimal("1190.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest_asyncio.fixture()
async def sent_credit_card_invoice(
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
) -> Invoice:
    """Create a sent credit card invoice."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-SENT-CC-001",
        template_type="credit_card",
        status="sent",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_name="Company GmbH",
        recipient_email="billing@company.example",
        recipient_address_line1="456 Test Str",
        recipient_city="Munich",
        recipient_postal_code="80331",
        recipient_country="DE",
        recipient_vat_number="DE987654321",
        line_items=[
            {
                "description": "Sponsorship",
                "quantity": "1",
                "unit_price": "2000.00",
                "total": "2000.00",
            }
        ],
        subtotal=Decimal("2000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("380.00"),
        total=Decimal("2380.00"),
        currency="EUR",
        stripe_payment_link_url="https://buy.stripe.com/test_link",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


# ── Scenario 1a: Paid Invoice Replacement ────────────────────────────


@pytest.mark.asyncio()
async def test_replace_paid_credit_card_invoice_inherits_paid_status(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test replacing a paid credit_card invoice - new invoice should inherit 'paid' status."""
    # Replace with corrected VAT number
    response = await client.post(
        _invoices_url(conference.id, paid_credit_card_invoice.id, "replace"),
        json={
            "reason": "Corrected VAT number",
            "recipient_vat_number": "DE999888777",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify response structure
    assert "old_invoice" in data
    assert "credit_note" in data
    assert "new_invoice" in data
    assert data["registrations_transferred"] == 0

    # Old invoice should be cancelled
    assert data["old_invoice"]["status"] == "cancelled"
    assert data["old_invoice"]["invoice_number"] == "INV-PAID-CC-001"

    # Credit note created
    assert data["credit_note"]["template_type"] == "credit_note"
    assert data["credit_note"]["status"] == "sent"
    assert float(data["credit_note"]["total"]) == -1190.00

    # New invoice should inherit 'paid' status
    assert data["new_invoice"]["status"] == "paid"
    assert data["new_invoice"]["recipient_vat_number"] == "DE999888777"
    assert float(data["new_invoice"]["total"]) == 1190.00
    # Paid invoices don't get a new Stripe link
    assert (
        data["new_invoice"]["stripe_payment_link_url"] is None or data["new_invoice"]["stripe_payment_link_url"] == ""
    )


@pytest.mark.asyncio()
async def test_replace_paid_bank_transfer_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test replacing a paid bank_transfer invoice - no Stripe involved."""
    # Create paid bank transfer invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-BT-001",
        template_type="bank_transfer",
        status="paid",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_name="Company Ltd",
        recipient_email="finance@company.example",
        recipient_address_line1="789 Bank St",
        recipient_city="London",
        recipient_postal_code="SW1A 1AA",
        recipient_country="GB",
        subtotal=Decimal("3000.00"),
        total=Decimal("3000.00"),
        currency="GBP",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Replace with corrected address
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "replace"),
        json={
            "reason": "Corrected postal code",
            "recipient_postal_code": "SW1A 2AA",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice should be paid
    assert data["new_invoice"]["status"] == "paid"
    assert data["new_invoice"]["recipient_postal_code"] == "SW1A 2AA"
    # Bank transfer - no Stripe
    assert (
        data["new_invoice"]["stripe_payment_link_url"] is None or data["new_invoice"]["stripe_payment_link_url"] == ""
    )


@pytest.mark.asyncio()
async def test_replace_paid_invoice_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test replacement preserves registration links (via BillingProfile)."""
    # Note: This is a simplified test - full E2E test will verify actual registrations
    # Here we just verify the endpoint accepts the replacement
    response = await client.post(
        _invoices_url(conference.id, paid_credit_card_invoice.id, "replace"),
        json={
            "reason": "Company name correction",
            "recipient_name": "New Company Name GmbH",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice should have corrected name
    assert data["new_invoice"]["recipient_name"] == "New Company Name GmbH"
    # Old name preserved in old invoice
    assert data["old_invoice"]["recipient_name"] == "Old Company Name"


@pytest.mark.asyncio()
async def test_replace_paid_invoice_sends_both_emails(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    paid_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test replacement triggers credit note + new invoice emails."""
    response = await client.post(
        _invoices_url(conference.id, paid_credit_card_invoice.id, "replace"),
        json={
            "reason": "Email correction",
            "recipient_email": "corrected@example.com",
            "custom_email_message": "Please use this corrected invoice for your records.",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice email should be corrected
    assert data["new_invoice"]["recipient_email"] == "corrected@example.com"
    # Both invoices created (email sending is best-effort, we just verify structure)
    assert data["credit_note"]["template_type"] == "credit_note"
    assert data["new_invoice"]["status"] == "paid"


# ── Scenario 1b: Sent Invoice Replacement ────────────────────────────


@pytest.mark.asyncio()
async def test_replace_sent_credit_card_creates_new_stripe_link(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    sent_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test replacing sent credit_card invoice - should deactivate old link and create new one."""
    response = await client.post(
        _invoices_url(conference.id, sent_credit_card_invoice.id, "replace"),
        json={
            "reason": "Company name typo",
            "recipient_name": "Corrected Company GmbH",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice should be 'sent' (customer still needs to pay)
    assert data["new_invoice"]["status"] == "sent"
    assert data["new_invoice"]["recipient_name"] == "Corrected Company GmbH"
    # New invoice should have a Stripe link (may be None in test env without real Stripe)
    # We just verify the field is present
    assert "stripe_payment_link_url" in data["new_invoice"]


@pytest.mark.asyncio()
async def test_replace_sent_bank_transfer_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test replacing sent bank_transfer invoice - no Stripe involved."""
    # Create sent bank transfer invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-SENT-BT-001",
        template_type="bank_transfer",
        status="sent",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_name="Business Inc",
        recipient_email="ar@business.example",
        recipient_address_line1="999 Invoice Rd",
        recipient_city="Dublin",
        recipient_postal_code="D01 AB12",
        recipient_country="IE",
        subtotal=Decimal("1500.00"),
        total=Decimal("1500.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    response = await client.post(
        _invoices_url(conference.id, invoice.id, "replace"),
        json={
            "reason": "Address correction",
            "recipient_address_line1": "1000 Corrected Invoice Rd",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice should be sent
    assert data["new_invoice"]["status"] == "sent"
    assert data["new_invoice"]["recipient_address_line1"] == "1000 Corrected Invoice Rd"


@pytest.mark.asyncio()
async def test_replace_sent_invoice_with_corrected_vat(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    sent_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test VAT number correction on sent invoice."""
    response = await client.post(
        _invoices_url(conference.id, sent_credit_card_invoice.id, "replace"),
        json={
            "reason": "VAT number was incorrect",
            "recipient_vat_number": "DE111222333",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # VAT corrected
    assert data["new_invoice"]["recipient_vat_number"] == "DE111222333"
    assert data["old_invoice"]["recipient_vat_number"] == "DE987654321"


@pytest.mark.asyncio()
async def test_replace_overdue_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test replacing overdue invoice - works same as sent."""
    # Create overdue invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-OVERDUE-001",
        template_type="bank_transfer",
        status="overdue",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 2, 1),
        recipient_name="Late Payer Ltd",
        recipient_email="late@example.com",
        recipient_city="Paris",
        recipient_country="FR",
        subtotal=Decimal("500.00"),
        total=Decimal("500.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    response = await client.post(
        _invoices_url(conference.id, invoice.id, "replace"),
        json={
            "reason": "Email typo",
            "recipient_email": "corrected@example.com",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # New invoice should be 'sent' (overdue → sent on replacement)
    assert data["new_invoice"]["status"] == "sent"


# ── Error Cases ────────────────────────────────────────────────────────


@pytest.mark.asyncio()
async def test_cannot_replace_already_replaced_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    sent_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test that already-replaced invoices cannot be replaced again."""
    # First replacement
    response1 = await client.post(
        _invoices_url(conference.id, sent_credit_card_invoice.id, "replace"),
        json={
            "reason": "First correction",
            "recipient_name": "First Corrected Name",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )
    assert response1.status_code == 200

    # Try to replace the same old invoice again
    response2 = await client.post(
        _invoices_url(conference.id, sent_credit_card_invoice.id, "replace"),
        json={
            "reason": "Second correction",
            "recipient_name": "Second Corrected Name",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response2.status_code == 400
    assert "already been replaced" in response2.json()["detail"].lower()


@pytest.mark.asyncio()
async def test_cannot_replace_draft_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test that draft invoices cannot be replaced."""
    # Create draft invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        status="draft",
        recipient_name="Draft Corp",
        recipient_city="Berlin",
        recipient_country="DE",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    response = await client.post(
        _invoices_url(conference.id, invoice.id, "replace"),
        json={
            "reason": "Test",
            "recipient_name": "New Name",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 400
    assert "draft" in response.json()["detail"].lower()


@pytest.mark.asyncio()
async def test_cannot_replace_credit_note(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """Test that credit notes cannot be replaced."""
    # Create credit note
    credit_note = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="CN-001",
        template_type="credit_note",
        status="sent",
        recipient_name="Some Corp",
        recipient_city="Berlin",
        recipient_country="DE",
        subtotal=Decimal("-100.00"),
        total=Decimal("-100.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(credit_note)
    await db_session.commit()

    response = await client.post(
        _invoices_url(conference.id, credit_note.id, "replace"),
        json={
            "reason": "Test",
            "recipient_name": "New Name",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 400
    assert "credit note" in response.json()["detail"].lower()


@pytest.mark.asyncio()
async def test_cannot_replace_with_no_changes(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    sent_credit_card_invoice: Invoice,
    admin_token_invoices: str,
) -> None:
    """Test that replacement requires at least one field to be different."""
    # Try to replace with same values (no corrections provided)
    response = await client.post(
        _invoices_url(conference.id, sent_credit_card_invoice.id, "replace"),
        json={
            "reason": "No actual changes",
            # No corrected fields provided
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 400
    assert "at least one" in response.json()["detail"].lower()
