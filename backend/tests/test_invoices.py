"""Tests for invoice CRUD endpoints (conference-scoped)."""

import uuid

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
from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _invoices_url(conference_id: uuid.UUID, path: str = "") -> str:
    """Build the invoices endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/invoices"
    if path:
        return f"{base}/{path}"
    return base


INVOICE_PAYLOAD = {
    "invoice_number": "INV-2026-001",
    "status": "draft",
    "recipient_name": "Acme Corp",
    "recipient_email": "billing@acme.example.com",
    "recipient_address_line1": "123 Main St",
    "recipient_city": "Berlin",
    "recipient_country": "Germany",
    "subtotal": "1000.00",
    "tax_rate": "19.00",
    "tax_amount": "190.00",
    "total": "1190.00",
    "currency": "EUR",
    "notes": "Payment due within 30 days",
    "line_items": [
        {
            "description": "Conference sponsorship - Gold",
            "quantity": "1",
            "unit_price": "1000.00",
            "total": "1000.00",
        }
    ],
}


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


@pytest.fixture()
def user_token_invoices(regular_user: User) -> str:
    """Return a valid access token for the regular user with invoices module."""
    return _make_token(regular_user, modules=["invoices"])


@pytest_asyncio.fixture()
async def sample_invoice(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Invoice:
    """Create a sample invoice directly in the database."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="INV-SEED-001",
        status="draft",
        recipient_name="Seed Recipient",
        recipient_email="seed@example.com",
        recipient_city="Munich",
        recipient_country="Germany",
        line_items=[
            {
                "description": "Test item",
                "quantity": "2",
                "unit_price": "50.00",
                "total": "100.00",
            }
        ],
        subtotal=100.00,
        tax_rate=19.00,
        tax_amount=19.00,
        total=119.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST INVOICES
# ═══════════════════════════════════════════════════════════════════════


async def test_list_invoices_empty(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Listing invoices returns an empty list when none exist."""
    url = _invoices_url(conference.id)
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["pages"] == 0


async def test_list_invoices_with_data(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Listing invoices returns existing invoices."""
    url = _invoices_url(conference.id)
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["invoice_number"] == "INV-SEED-001"
    assert data["items"][0]["id"] == str(sample_invoice.id)
    assert data["items"][0]["recipient_name"] == "Seed Recipient"


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE INVOICE
# ═══════════════════════════════════════════════════════════════════════


async def test_create_invoice_success(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Tenant admin can create an invoice and receives 201."""
    url = _invoices_url(conference.id)
    response = await client.post(
        url, json=INVOICE_PAYLOAD, headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["invoice_number"] == INVOICE_PAYLOAD["invoice_number"]
    assert data["status"] == "draft"
    assert data["recipient_name"] == INVOICE_PAYLOAD["recipient_name"]
    assert data["recipient_email"] == INVOICE_PAYLOAD["recipient_email"]
    assert data["recipient_city"] == INVOICE_PAYLOAD["recipient_city"]
    assert data["recipient_country"] == INVOICE_PAYLOAD["recipient_country"]
    assert data["currency"] == "EUR"
    assert data["is_active"] is True
    assert data["conference_id"] == str(conference.id)
    assert "id" in data
    assert "tenant_id" in data
    assert "created_at" in data
    assert "updated_at" in data
    # Check line items
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["description"] == "Conference sponsorship - Gold"


async def test_create_invoice_minimal(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Create an invoice with only required fields."""
    url = _invoices_url(conference.id)
    payload = {
        "invoice_number": "INV-MIN-001",
        "recipient_name": "Minimal Recipient",
    }
    response = await client.post(
        url, json=payload, headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["invoice_number"] == "INV-MIN-001"
    assert data["recipient_name"] == "Minimal Recipient"
    assert data["status"] == "draft"
    assert data["is_active"] is True
    assert data["line_items"] == []
    assert data["contact_persons"] == []


async def test_create_invoice_forbidden_for_regular_user(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    regular_user: User,
    user_token_invoices: str,
) -> None:
    """Regular user (non-admin) cannot create an invoice and gets 403."""
    url = _invoices_url(conference.id)
    response = await client.post(
        url, json=INVOICE_PAYLOAD, headers=auth_headers(user_token_invoices),
    )

    assert response.status_code == 403


async def test_create_invoice_no_auth_401(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
) -> None:
    """Creating an invoice without authentication returns 401."""
    url = _invoices_url(conference.id)
    response = await client.post(url, json=INVOICE_PAYLOAD)

    assert response.status_code == 401


# ═══════════════════════════════════════════════════════════════════════
# 3. GET INVOICE
# ═══════════════════════════════════════════════════════════════════════


async def test_get_invoice_by_id(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Get an invoice by ID returns all expected fields."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(sample_invoice.id)
    assert data["invoice_number"] == "INV-SEED-001"
    assert data["recipient_name"] == "Seed Recipient"
    assert data["recipient_email"] == "seed@example.com"
    assert data["recipient_city"] == "Munich"
    assert data["recipient_country"] == "Germany"
    assert data["currency"] == "EUR"
    assert data["is_active"] is True
    assert data["conference_id"] == str(conference.id)
    assert "created_at" in data
    assert "updated_at" in data


async def test_invoice_not_found(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Getting a non-existent invoice returns 404."""
    fake_id = uuid.uuid4()
    url = _invoices_url(conference.id, str(fake_id))
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. UPDATE INVOICE
# ═══════════════════════════════════════════════════════════════════════


async def test_update_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Tenant admin can update an invoice."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    payload = {
        "recipient_name": "Updated Recipient",
        "status": "sent",
        "notes": "Updated notes",
    }
    response = await client.put(
        url, json=payload, headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["recipient_name"] == "Updated Recipient"
    assert data["status"] == "sent"
    assert data["notes"] == "Updated notes"
    # Unchanged fields
    assert data["invoice_number"] == "INV-SEED-001"
    assert data["currency"] == "EUR"
    assert data["id"] == str(sample_invoice.id)


async def test_update_invoice_not_found(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Updating a non-existent invoice returns 404."""
    fake_id = uuid.uuid4()
    url = _invoices_url(conference.id, str(fake_id))
    payload = {"recipient_name": "Ghost Recipient"}
    response = await client.put(
        url, json=payload, headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 404


async def test_update_invoice_forbidden_for_regular_user(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    regular_user: User,
    user_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Regular user cannot update an invoice and gets 403."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    payload = {"recipient_name": "Forbidden Update"}
    response = await client.put(
        url, json=payload, headers=auth_headers(user_token_invoices),
    )

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 5. DELETE INVOICE
# ═══════════════════════════════════════════════════════════════════════


async def test_delete_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Tenant admin can delete an invoice."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    response = await client.delete(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "deleted" in data["message"].lower()


async def test_delete_invoice_verify_gone(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """After deleting an invoice, GET returns 404."""
    url = _invoices_url(conference.id, str(sample_invoice.id))

    # Delete
    delete_response = await client.delete(
        url, headers=auth_headers(admin_token_invoices),
    )
    assert delete_response.status_code == 200

    # Verify GET returns 404
    get_response = await client.get(
        url, headers=auth_headers(admin_token_invoices),
    )
    assert get_response.status_code == 404


async def test_delete_invoice_not_found(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Deleting a non-existent invoice returns 404."""
    fake_id = uuid.uuid4()
    url = _invoices_url(conference.id, str(fake_id))
    response = await client.delete(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 404


async def test_delete_invoice_forbidden_for_regular_user(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    regular_user: User,
    user_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Regular user cannot delete an invoice and gets 403."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    response = await client.delete(
        url, headers=auth_headers(user_token_invoices),
    )

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 6. WRONG CONFERENCE
# ═══════════════════════════════════════════════════════════════════════


async def test_list_invoices_wrong_conference_404(
    client: AsyncClient,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Listing invoices for a non-existent conference returns 404."""
    fake_conference_id = uuid.uuid4()
    url = _invoices_url(fake_conference_id)
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 7. FILTER BY STATUS
# ═══════════════════════════════════════════════════════════════════════


async def test_list_invoices_filter_by_status(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Filtering invoices by status returns only matching invoices."""
    # Create a draft and a sent invoice
    for i, status in enumerate(("draft", "sent")):
        inv = Invoice(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            invoice_number=f"INV-FILTER-{i:03d}",
            status=status,
            recipient_name=f"Recipient {status}",
            is_active=True,
        )
        db_session.add(inv)
    await db_session.commit()

    url = _invoices_url(conference.id)

    # Filter by draft
    response = await client.get(
        url, params={"status": "draft"},
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "draft"

    # Filter by sent
    response = await client.get(
        url, params={"status": "sent"},
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "sent"
