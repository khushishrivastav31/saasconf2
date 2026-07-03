"""Tests for percentage-based line-item discounts (MAIN-13427).

Covers the additive ``discount_percentage`` field on ``InvoiceLineItem``,
its mutual-exclusivity with the existing amount-based ``discount`` field,
the conference and training invoice create paths, and ZUGFeRD serialization
of the derived absolute discount amount.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.trainings.invoice_operations import CreateTrainingInvoiceRequest
from app.core.zugferd_xml import generate_zugferd_xml
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.invoice import InvoiceLineItem
from tests.conftest import auth_headers
from tests.invoices.test_invoices import (  # noqa: F401 — reused fixtures
    _invoices_url,
    admin_token_invoices,
    invoices_module,
    tenant_with_invoices_module,
)

# ── Schema-level unit tests ────────────────────────────────────────────


def test_line_item_accepts_percentage_discount() -> None:
    """A line item may carry a percentage discount instead of a fixed amount."""
    item = InvoiceLineItem(
        description="Ticket",
        quantity=2,
        unit_price=100.0,
        discount_percentage=10.0,
        total=180.0,
    )
    assert item.discount_percentage == 10.0
    assert item.discount == 0.0


def test_line_item_rejects_both_discount_kinds() -> None:
    """Setting both discount and discount_percentage is rejected."""
    with pytest.raises(ValidationError, match="not both"):
        InvoiceLineItem(
            description="Ticket",
            quantity=1,
            unit_price=100.0,
            discount=10.0,
            discount_percentage=10.0,
            total=80.0,
        )


@pytest.mark.parametrize("bad_pct", [-1.0, 100.01, 150.0])
def test_line_item_rejects_out_of_range_percentage(bad_pct: float) -> None:
    """discount_percentage must lie within [0, 100]."""
    with pytest.raises(ValidationError):
        InvoiceLineItem(
            description="Ticket",
            quantity=1,
            unit_price=100.0,
            discount_percentage=bad_pct,
            total=100.0,
        )


# ── Conference invoice create path ─────────────────────────────────────


async def test_create_invoice_with_percentage_discount(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,  # noqa: F811
    tenant_admin_user: User,
    admin_token_invoices: str,  # noqa: F811
) -> None:
    """Creating an invoice with a percentage-discounted line item succeeds."""
    payload = {
        "status": "draft",
        "recipient_name": "Acme Corp",
        "recipient_address_line1": "123 Main St",
        "recipient_city": "Berlin",
        "recipient_postal_code": "10115",
        "recipient_country": "DE",
        "subtotal": "180.00",
        "currency": "EUR",
        "line_items": [
            {
                "description": "Sponsorship",
                "quantity": "2",
                "unit_price": "100.00",
                "discount_percentage": "10",
                "total": "180.00",
            }
        ],
    }
    response = await client.post(
        _invoices_url(conference.id),
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["discount_percentage"] == 10.0
    assert data["line_items"][0]["total"] == 180.0


async def test_create_invoice_rejects_both_discount_kinds(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,  # noqa: F811
    tenant_admin_user: User,
    admin_token_invoices: str,  # noqa: F811
) -> None:
    """A line item with both discount and discount_percentage is a 422."""
    payload = {
        "status": "draft",
        "recipient_name": "Acme Corp",
        "recipient_address_line1": "123 Main St",
        "recipient_city": "Berlin",
        "recipient_postal_code": "10115",
        "recipient_country": "DE",
        "subtotal": "80.00",
        "currency": "EUR",
        "line_items": [
            {
                "description": "Sponsorship",
                "quantity": "1",
                "unit_price": "100.00",
                "discount": "10",
                "discount_percentage": "10",
                "total": "80.00",
            }
        ],
    }
    response = await client.post(
        _invoices_url(conference.id),
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 422


# ── Training invoice create path (shared line-item shape) ───────────────


def test_training_create_request_accepts_percentage_discount() -> None:
    """The training create request validates line items via the shared shape."""
    req = CreateTrainingInvoiceRequest(
        recipient_name="Trainee Ltd",
        line_items=[
            {
                "description": "Course seat",
                "quantity": 1,
                "unit_price": 200.0,
                "discount_percentage": 25.0,
                "total": 150.0,
            }
        ],
    )
    assert req.line_items[0].discount_percentage == 25.0


def test_training_create_request_rejects_both_discount_kinds() -> None:
    """Training line items also reject both discount kinds set at once."""
    with pytest.raises(ValidationError, match="not both"):
        CreateTrainingInvoiceRequest(
            recipient_name="Trainee Ltd",
            line_items=[
                {
                    "description": "Course seat",
                    "quantity": 1,
                    "unit_price": 200.0,
                    "discount": 10.0,
                    "discount_percentage": 25.0,
                    "total": 150.0,
                }
            ],
        )


# ── PDF rendering ──────────────────────────────────────────────────────


def test_pdf_items_table_shows_derived_percentage_discount() -> None:
    """The PDF discount column shows the derived amount for percentage lines."""
    from app.core.invoice.pdf import _render_items_table

    html = _render_items_table(
        [
            {
                "description": "Discounted seat",
                "quantity": 2,
                "unit_price": 100.0,
                "discount_percentage": 10.0,
                "total": 180.0,
            }
        ],
        currency="EUR",
    )
    # Derived line discount = 2 * 100 * 10% = 20.00, labelled with the percentage.
    assert "20.00 EUR (10%)" in html


# ── ZUGFeRD serialization ──────────────────────────────────────────────


@pytest.fixture
def sample_tenant(db_session: AsyncSession):
    tenant = Tenant(id=uuid.uuid4(), name="Test Tenant", slug="test-tenant-pct")
    db_session.add(tenant)
    return tenant


@pytest.fixture
def sample_conference(db_session: AsyncSession, sample_tenant):
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=sample_tenant.id,
        name="Test Conference 2026",
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        contact_email="conference@test.com",
        phone="+49301234567",
        country="DE",
        settings={
            "invoice_company_info": {
                "name": "Test GmbH",
                "address": "Teststraße 123",
                "postal_code": "10115",
                "city": "Berlin",
                "country": "DE",
                "tax_id": "DE123456789",
                "phone": "+49301234567",
                "bank_accounts": [{"bank_name": "Deutsche Bank", "iban": "DE89370400440532013000", "bic": "DEUTDEFF"}],
            },
            "zugferd_settings": {"enabled": True},
        },
    )
    db_session.add(conference)
    return conference


@pytest.mark.asyncio
async def test_zugferd_serializes_derived_percentage_discount(
    db_session: AsyncSession, sample_conference, sample_tenant
) -> None:
    """A percentage-discounted line item serializes the derived absolute amount."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=sample_tenant.id,
        conference_id=sample_conference.id,
        invoice_number="2026-00099",
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        currency="EUR",
        subtotal=Decimal("180.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("34.20"),
        total=Decimal("214.20"),
        recipient_name="Test Customer GmbH",
        recipient_address_line1="Kundenstraße 456",
        recipient_postal_code="80331",
        recipient_city="München",
        recipient_country="DE",
        recipient_vat_number="DE987654321",
        line_items=[
            {
                "description": "Discounted seat",
                "quantity": 2,
                "unit_price": 100.00,
                "discount_percentage": 10.0,
                "total": 180.00,
            }
        ],
    )
    invoice.conference = sample_conference
    db_session.add(invoice)

    xml_bytes = await generate_zugferd_xml(invoice, sample_conference, db_session)

    # Derived per-line discount amount = 2 * 100 * 10% = 20.00
    assert b"<ram:ActualAmount>20.00</ram:ActualAmount>" in xml_bytes
