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
    "recipient_postal_code": "10115",
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
        url,
        json=INVOICE_PAYLOAD,
        headers=auth_headers(admin_token_invoices),
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
        "recipient_address_line1": "1 Test St",
        "recipient_city": "Munich",
        "recipient_postal_code": "80331",
        "recipient_country": "Germany",
    }
    response = await client.post(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
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
        url,
        json=INVOICE_PAYLOAD,
        headers=auth_headers(user_token_invoices),
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


async def test_update_draft_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Tenant admin can update a draft invoice's fields."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    payload = {
        "recipient_name": "Updated Recipient",
        "notes": "Updated notes",
    }
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["recipient_name"] == "Updated Recipient"
    assert data["status"] == "draft"
    assert data["notes"] == "Updated notes"
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
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
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
        url,
        json=payload,
        headers=auth_headers(user_token_invoices),
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
        url,
        headers=auth_headers(admin_token_invoices),
    )
    assert delete_response.status_code == 200

    # Verify GET returns 404
    get_response = await client.get(
        url,
        headers=auth_headers(admin_token_invoices),
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
        url,
        headers=auth_headers(user_token_invoices),
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
        url,
        params={"status": "draft"},
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "draft"

    # Filter by sent
    response = await client.get(
        url,
        params={"status": "sent"},
        headers=auth_headers(admin_token_invoices),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "sent"


# ═══════════════════════════════════════════════════════════════════════
# 8. DRAFT INVOICES (no invoice_number)
# ═══════════════════════════════════════════════════════════════════════


async def test_create_invoice_without_number(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Create an invoice without invoice_number — should return null."""
    url = _invoices_url(conference.id)
    payload = {
        "recipient_name": "Draft Recipient",
        "recipient_address_line1": "5 Draft Lane",
        "recipient_city": "Hamburg",
        "recipient_postal_code": "20095",
        "recipient_country": "Germany",
    }
    response = await client.post(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["invoice_number"] is None
    assert data["recipient_name"] == "Draft Recipient"
    assert data["status"] == "draft"


async def test_create_invoice_with_recipient_source(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Create an invoice with recipient source tracking fields."""
    url = _invoices_url(conference.id)
    source_id = str(uuid.uuid4())
    payload = {
        "recipient_name": "Sponsor Corp",
        "recipient_address_line1": "100 Sponsor Blvd",
        "recipient_city": "Frankfurt",
        "recipient_postal_code": "60311",
        "recipient_country": "Germany",
        "recipient_source_type": "sponsor",
        "recipient_source_id": source_id,
        "internal_comment": "This is an internal note",
    }
    response = await client.post(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["recipient_source_type"] == "sponsor"
    assert data["recipient_source_id"] == source_id
    assert data["internal_comment"] == "This is an internal note"


async def test_create_invoice_invalid_source_type(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Create with invalid recipient_source_type should fail."""
    url = _invoices_url(conference.id)
    payload = {
        "recipient_name": "Invalid Source",
        "recipient_source_type": "unknown_entity",
    }
    response = await client.post(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 422


async def test_list_invoices_includes_drafts(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Drafts (null invoice_number) appear in the list."""
    # Create a draft without number
    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number=None,
        status="draft",
        recipient_name="Draft Recipient",
        is_active=True,
    )
    db_session.add(inv)
    await db_session.commit()

    url = _invoices_url(conference.id)
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["invoice_number"] is None
    assert data["items"][0]["recipient_name"] == "Draft Recipient"


# ═══════════════════════════════════════════════════════════════════════
# 9. INVOICE LIFECYCLE (Send, Status Transitions, Field Locking)
# ═══════════════════════════════════════════════════════════════════════


@pytest_asyncio.fixture()
async def draft_invoice(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Invoice:
    """Create a draft invoice without invoice_number."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number=None,
        status="draft",
        recipient_name="Draft Corp",
        recipient_email="draft@example.com",
        recipient_address_line1="123 Draft Street",
        recipient_city="Draft City",
        recipient_postal_code="12345",
        recipient_country="DE",
        line_items=[{"description": "Item 1", "quantity": "1", "unit_price": "500.00", "total": "500.00"}],
        subtotal=500.00,
        total=500.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest_asyncio.fixture()
async def sent_invoice(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Invoice:
    """Create a sent invoice with an assigned number."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="INV-SENT-001",
        status="sent",
        recipient_name="Sent Corp",
        recipient_email="sent@example.com",
        line_items=[{"description": "Sent item", "quantity": "1", "unit_price": "500.00", "total": "500.00"}],
        subtotal=500.00,
        total=500.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


async def test_send_invoice_auto_assigns_number(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    draft_invoice: Invoice,
) -> None:
    """Changing draft → sent auto-assigns an invoice number."""
    url = _invoices_url(conference.id, str(draft_invoice.id))
    payload = {"status": "sent"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "sent"
    assert data["invoice_number"] is not None
    assert len(data["invoice_number"]) > 0


async def test_send_invoice_sets_issue_date(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Sending a draft auto-sets issue_date to today if not already set."""
    from datetime import date

    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number=None,
        status="draft",
        recipient_name="No Date Corp",
        recipient_address_line1="456 Date Street",
        recipient_city="Date City",
        recipient_postal_code="54321",
        recipient_country="DE",
        issue_date=None,
        is_active=True,
    )
    db_session.add(inv)
    await db_session.commit()

    url = _invoices_url(conference.id, str(inv.id))
    payload = {"status": "sent"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["issue_date"] == date.today().isoformat()
    assert data["invoice_number"] is not None


async def test_sent_invoice_only_status_changeable(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Non-draft invoices reject field changes (only status allowed)."""
    url = _invoices_url(conference.id, str(sent_invoice.id))
    payload = {"recipient_name": "Hacked Name"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 400
    assert "Only status changes" in response.json()["detail"]


async def test_valid_status_transition_sent_to_paid(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Sent → paid is a valid status transition."""
    url = _invoices_url(conference.id, str(sent_invoice.id))
    payload = {"status": "paid"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "paid"


async def test_invalid_status_transition_draft_to_paid(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    draft_invoice: Invoice,
) -> None:
    """Draft → paid is an invalid status transition (must go through sent)."""
    url = _invoices_url(conference.id, str(draft_invoice.id))
    payload = {"status": "paid"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 400
    assert "Cannot change status" in response.json()["detail"]


async def test_invalid_status_transition_sent_to_draft(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Sent → draft is an invalid status transition."""
    url = _invoices_url(conference.id, str(sent_invoice.id))
    payload = {"status": "draft"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 400
    assert "Cannot change status" in response.json()["detail"]


async def test_terminal_status_no_transition(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Paid/cancelled invoices cannot change status (terminal states)."""
    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-001",
        status="paid",
        recipient_name="Paid Corp",
        is_active=True,
    )
    db_session.add(inv)
    await db_session.commit()

    url = _invoices_url(conference.id, str(inv.id))
    payload = {"status": "sent"}
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 400
    assert "Cannot change status" in response.json()["detail"]


async def test_update_cannot_change_invoice_number_directly(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Invoice number cannot be changed directly via update (even on drafts)."""
    url = _invoices_url(conference.id, str(sample_invoice.id))
    payload = {
        "invoice_number": "CHANGED-NUMBER",
        "recipient_name": "Updated Name",
    }
    response = await client.put(
        url,
        json=payload,
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    # Number should NOT have changed (stripped by backend)
    assert data["invoice_number"] == "INV-SEED-001"
    # But name should update (it's a draft)
    assert data["recipient_name"] == "Updated Name"


# ═══════════════════════════════════════════════════════════════════════
# 10. RECIPIENT SEARCH
# ═══════════════════════════════════════════════════════════════════════


async def test_recipient_search_sponsors(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Recipient search finds sponsors by company name."""
    from app.models.sponsor import Sponsor

    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Acme Sponsor Corp",
        address_line1="456 Sponsor Ave",
        city="Hamburg",
        country="Germany",
        vat_number="DE123456789",
    )
    db_session.add(sponsor)
    await db_session.commit()

    url = _invoices_url(conference.id, "recipient-search")
    response = await client.get(
        url,
        params={"q": "Acme"},
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) >= 1
    sponsor_result = next(r for r in data["results"] if r["source_type"] == "sponsor")
    assert sponsor_result["display_name"] == "Acme Sponsor Corp"
    assert sponsor_result["address_line1"] == "456 Sponsor Ave"
    assert sponsor_result["vat_number"] == "DE123456789"


async def test_recipient_search_empty(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Recipient search with no matches returns empty results."""
    url = _invoices_url(conference.id, "recipient-search")
    response = await client.get(
        url,
        params={"q": "zzz_nonexistent_xyz"},
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []


async def test_recipient_search_requires_query(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
) -> None:
    """Recipient search requires a query parameter."""
    url = _invoices_url(conference.id, "recipient-search")
    response = await client.get(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════════
# SEND / RESEND
# ═══════════════════════════════════════════════════════════════════════


async def test_send_draft_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    db_session: AsyncSession,
) -> None:
    """POST /send on a draft assigns number, sets status to sent, returns invoice."""
    # Create a draft without invoice_number (will be assigned on send)
    create_url = _invoices_url(conference.id)
    payload = {
        **INVOICE_PAYLOAD,
        "invoice_number": None,
    }
    create_resp = await client.post(create_url, json=payload, headers=auth_headers(admin_token_invoices))
    assert create_resp.status_code == 201
    invoice_id = create_resp.json()["id"]

    # Send the draft
    send_url = _invoices_url(conference.id, f"{invoice_id}/send")
    response = await client.post(send_url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "sent"
    assert data["invoice_number"] is not None
    assert data["issue_date"] is not None


async def test_resend_sent_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """POST /send on a sent invoice returns 200 (resend)."""
    url = _invoices_url(conference.id, f"{sent_invoice.id}/send")
    response = await client.post(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "sent"
    assert data["invoice_number"] == "INV-SENT-001"


async def test_send_rejects_paid_invoice(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """POST /send rejects invoices with paid status."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="INV-PAID-001",
        status="paid",
        recipient_name="Paid Corp",
        recipient_email="paid@example.com",
        recipient_city="Munich",
        recipient_country="Germany",
        line_items=[{"description": "Item", "quantity": "1", "unit_price": "100", "total": "100"}],
        subtotal=100.00,
        total=100.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    url = _invoices_url(conference.id, f"{invoice.id}/send")
    response = await client.post(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 400
    assert "Cannot send" in response.json()["detail"]


async def test_send_rejects_missing_email(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """POST /send rejects invoices without recipient email."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number=None,
        status="draft",
        recipient_name="No Email Corp",
        recipient_email=None,
        recipient_city="Berlin",
        recipient_country="Germany",
        line_items=[{"description": "Item", "quantity": "1", "unit_price": "100", "total": "100"}],
        subtotal=100.00,
        total=100.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    url = _invoices_url(conference.id, f"{invoice.id}/send")
    response = await client.post(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 400
    assert "recipient email" in response.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════
# CANCEL + CREDIT NOTE
# ═══════════════════════════════════════════════════════════════════════


async def test_cancel_invoice_requires_reason(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """POST /cancel without a reason body returns 422."""
    url = _invoices_url(conference.id, f"{sent_invoice.id}/cancel")
    response = await client.post(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 422


async def test_cancel_invoice_creates_credit_note(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """POST /cancel with reason creates credit note and cancels invoice."""
    url = _invoices_url(conference.id, f"{sent_invoice.id}/cancel")
    response = await client.post(
        url,
        json={"reason": "Duplicate invoice"},
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 200
    data = response.json()

    # Original is cancelled
    assert data["cancelled_invoice"]["status"] == "cancelled"
    assert data["cancelled_invoice"]["id"] == str(sent_invoice.id)

    # Credit note is created
    cn = data["credit_note"]
    assert cn["template_type"] == "credit_note"
    assert cn["status"] == "sent"
    assert cn["related_invoice_id"] == str(sent_invoice.id)
    assert cn["invoice_number"] is not None

    # Amounts are negated
    assert float(cn["total"]) == -float(sent_invoice.total)


async def test_cancel_invoice_stores_reason(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Cancellation reason is stored as internal_comment on the invoice."""
    cancel_url = _invoices_url(conference.id, f"{sent_invoice.id}/cancel")
    await client.post(
        cancel_url,
        json={"reason": "Customer requested cancellation"},
        headers=auth_headers(admin_token_invoices),
    )

    # Fetch the cancelled invoice and verify internal comment
    get_url = _invoices_url(conference.id, str(sent_invoice.id))
    response = await client.get(get_url, headers=auth_headers(admin_token_invoices))
    assert response.status_code == 200
    assert response.json()["internal_comment"] == "Customer requested cancellation"


async def test_cancel_draft_rejected(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sample_invoice: Invoice,
) -> None:
    """Draft invoices cannot be cancelled."""
    url = _invoices_url(conference.id, f"{sample_invoice.id}/cancel")
    response = await client.post(
        url,
        json={"reason": "Test"},
        headers=auth_headers(admin_token_invoices),
    )

    assert response.status_code == 400
    assert "draft" in response.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════
# DELETE PROTECTION
# ═══════════════════════════════════════════════════════════════════════


async def test_delete_sent_invoice_rejected(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Sent invoices cannot be deleted — only drafts can."""
    url = _invoices_url(conference.id, str(sent_invoice.id))
    response = await client.delete(url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 400
    assert "draft" in response.json()["detail"].lower()


async def test_delete_credit_note_rejected(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    tenant_admin_user: User,
    admin_token_invoices: str,
    sent_invoice: Invoice,
) -> None:
    """Credit notes cannot be deleted."""
    # First cancel to create a credit note
    cancel_url = _invoices_url(conference.id, f"{sent_invoice.id}/cancel")
    cancel_resp = await client.post(
        cancel_url,
        json={"reason": "Test cancellation"},
        headers=auth_headers(admin_token_invoices),
    )
    assert cancel_resp.status_code == 200
    credit_note_id = cancel_resp.json()["credit_note"]["id"]

    # Try to delete the credit note
    delete_url = _invoices_url(conference.id, credit_note_id)
    response = await client.delete(delete_url, headers=auth_headers(admin_token_invoices))

    assert response.status_code == 400
    assert "credit note" in response.json()["detail"].lower()
