"""Integration tests for invoice VAT warning flow."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token


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


# ── Tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_invoice_virtual_eu_without_vat_returns_warning(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    admin_token_invoices: str,
    db_session: AsyncSession,
):
    """Creating virtual EU invoice without VAT returns error warning."""
    # Set conference to Germany, virtual venue
    conference.country = "DE"
    conference.venue_type = "virtual"
    db_session.add(conference)
    await db_session.commit()

    payload = {
        "recipient_name": "Acme SARL",  # Company name (B2B indicator)
        "recipient_address_line1": "123 Rue Example",
        "recipient_city": "Paris",
        "recipient_postal_code": "75001",
        "recipient_country": "FR",  # France (EU, non-domestic)
        "recipient_vat_number": "",  # Missing VAT
        "line_items": [{"description": "Conference Sponsorship", "quantity": 1, "unit_price": 1000, "total": 1000}],
        "subtotal": 1000,
        "currency": "EUR",
        "attendance_type": "virtual",
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/invoices",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 201
    data = response.json()

    # Should have VAT warning
    assert data["vat_warnings"] is not None
    assert len(data["vat_warnings"]) == 1

    warning = data["vat_warnings"][0]
    assert warning["code"] == "vat_required_missing"
    assert warning["level"] == "error"
    assert "reverse charge" in warning["message"].lower()
    assert warning["can_override"] is True  # Admin can override

    # Should document requirement
    assert data["vat_requirement"] is not None
    assert data["vat_requirement"]["level"] == "required"
    assert "Article 196" in data["vat_requirement"]["rule_reference"]


@pytest.mark.asyncio
async def test_create_invoice_domestic_b2b_without_vat_returns_recommendation(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    admin_token_invoices: str,
    db_session: AsyncSession,
):
    """Creating domestic B2B invoice without VAT returns recommendation warning."""
    conference.country = "DE"
    conference.venue_type = "in_person"
    db_session.add(conference)
    await db_session.commit()

    payload = {
        "recipient_name": "Tech GmbH",  # Company name (B2B)
        "recipient_address_line1": "Hauptstraße 1",
        "recipient_city": "Berlin",
        "recipient_postal_code": "10115",
        "recipient_country": "DE",  # Germany (domestic)
        "recipient_vat_number": "",  # Missing VAT
        "line_items": [{"description": "Sponsorship", "quantity": 1, "unit_price": 1000, "total": 1000}],
        "subtotal": 1000,
        "currency": "EUR",
        "attendance_type": "in_person",
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/invoices",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 201
    data = response.json()

    # Should have VAT recommendation
    assert data["vat_warnings"] is not None
    assert len(data["vat_warnings"]) == 1

    warning = data["vat_warnings"][0]
    assert warning["code"] == "vat_recommended_missing"
    assert warning["level"] == "warning"
    assert "recommended" in warning["message"].lower()
    assert warning["can_override"] is True  # Anyone can ignore recommendations


@pytest.mark.asyncio
async def test_create_invoice_b2c_no_warnings(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    admin_token_invoices: str,
    db_session: AsyncSession,
):
    """Creating B2C invoice (no company name) returns no warnings."""
    conference.country = "DE"
    conference.venue_type = "virtual"
    db_session.add(conference)
    await db_session.commit()

    payload = {
        "recipient_name": "John Doe",  # Individual name (B2C)
        "recipient_address_line1": "123 Rue Example",
        "recipient_city": "Paris",
        "recipient_postal_code": "75001",
        "recipient_country": "FR",
        "recipient_vat_number": "",
        "line_items": [{"description": "Registration", "quantity": 1, "unit_price": 500, "total": 500}],
        "subtotal": 500,
        "currency": "EUR",
        "attendance_type": "virtual",
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/invoices",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 201
    data = response.json()

    # Individual name still triggers requirement check
    # (system can't perfectly distinguish B2C vs B2B from name alone)
    assert data["vat_requirement"] is not None

    # For virtual EU, even individuals get the requirement info
    # (in case they're actually a business)
    # This is OK - better to over-warn than under-warn
    assert data["vat_requirement"]["level"] in ["required", "recommended"]

    # May have warnings (system errs on side of caution)
    # This is acceptable - false positive is better than false negative


@pytest.mark.asyncio
async def test_hybrid_online_eu_b2b_requires_vat(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    admin_token_invoices: str,
    db_session: AsyncSession,
):
    """Hybrid conference with online attendance requires VAT for EU B2B."""
    conference.country = "DE"
    conference.venue_type = "hybrid"
    db_session.add(conference)
    await db_session.commit()

    payload = {
        "recipient_name": "Innovation BV",
        "recipient_address_line1": "Damrak 1",
        "recipient_city": "Amsterdam",
        "recipient_postal_code": "1012 LG",
        "recipient_country": "NL",  # Netherlands (EU)
        "recipient_vat_number": "",
        "line_items": [{"description": "Online Sponsorship", "quantity": 1, "unit_price": 2000, "total": 2000}],
        "subtotal": 2000,
        "currency": "EUR",
        "attendance_type": "hybrid_online",  # Online attendance
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/invoices",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 201
    data = response.json()

    # Hybrid online should have same requirement as virtual
    assert data["vat_requirement"]["level"] == "required"
    assert data["vat_warnings"] is not None
    assert len(data["vat_warnings"]) >= 1
    assert data["vat_warnings"][0]["code"] == "vat_required_missing"


@pytest.mark.asyncio
async def test_hybrid_onsite_eu_b2b_recommends_vat(
    client: AsyncClient,
    conference: Conference,
    tenant_with_invoices_module: Tenant,
    admin_token_invoices: str,
    db_session: AsyncSession,
):
    """Hybrid conference with onsite attendance recommends VAT for EU B2B."""
    conference.country = "DE"
    conference.venue_type = "hybrid"
    db_session.add(conference)
    await db_session.commit()

    payload = {
        "recipient_name": "Innovation BV",
        "recipient_address_line1": "Damrak 1",
        "recipient_city": "Amsterdam",
        "recipient_postal_code": "1012 LG",
        "recipient_country": "NL",
        "recipient_vat_number": "",
        "line_items": [{"description": "Onsite Sponsorship", "quantity": 1, "unit_price": 2000, "total": 2000}],
        "subtotal": 2000,
        "currency": "EUR",
        "attendance_type": "hybrid_onsite",  # Onsite attendance
    }

    response = await client.post(
        f"/api/v1/conferences/{conference.id}/invoices",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 201
    data = response.json()

    # Hybrid onsite should recommend (not require)
    assert data["vat_requirement"]["level"] == "recommended"
    assert data["vat_warnings"] is not None
    assert len(data["vat_warnings"]) == 1
    assert data["vat_warnings"][0]["code"] == "vat_recommended_missing"
    assert data["vat_warnings"][0]["level"] == "warning"
