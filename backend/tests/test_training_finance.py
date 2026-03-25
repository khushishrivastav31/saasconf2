"""Tests for training finance settings API."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified


@pytest_asyncio.fixture
async def finance_tenant(db_session: AsyncSession, tenant):
    """Tenant with training finance pre-configured."""
    tenant.settings = {
        **(tenant.settings or {}),
        "training_finance": {
            "currency": "USD",
            "invoice_currency": "USD",
            "number_format": "us_uk",
            "company_info": {"name": "Test Corp", "city": "Berlin", "country": "DE"},
            "bank_accounts": [
                {"bank_name": "Deutsche Bank", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX", "is_default": True}
            ],
            "payment_reminders": {"enabled": True, "first_reminder_days": 5, "second_reminder_days": 14, "notify_admin_after_second": False},
        },
    }
    flag_modified(tenant, "settings")
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


AUTH = "Authorization"


# ── Currency & Tax ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_currency_tax_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/currency-tax", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["currency"] == "EUR"
    assert data["number_format"] == "european"


@pytest.mark.asyncio
async def test_currency_tax_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/currency-tax",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"currency": "USD", "number_format": "us_uk"},
    )
    assert resp.status_code == 200
    assert resp.json()["currency"] == "USD"
    assert resp.json()["number_format"] == "us_uk"


# ── Numbering ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_numbering_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/numbering", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "TR-" in data["invoice_number_template"]
    assert data["invoice_counter_reset"] == "yearly"


@pytest.mark.asyncio
async def test_numbering_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/numbering",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"invoice_number_template": "INV-[YYYY]-[Count]", "invoice_counter_value": 100},
    )
    assert resp.status_code == 200
    assert resp.json()["invoice_number_template"] == "INV-[YYYY]-[Count]"
    assert resp.json()["invoice_counter_value"] == 100


# ── Company Data ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_company_data_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/company-data", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["company_info"]["name"] == ""


@pytest.mark.asyncio
async def test_company_data_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/company-data",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"company_info": {"name": "ACME GmbH", "city": "Munich", "country": "DE"}},
    )
    assert resp.status_code == 200
    assert resp.json()["company_info"]["name"] == "ACME GmbH"


# ── Bank Accounts ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bank_accounts_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/bank-accounts", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["bank_accounts"] == []


@pytest.mark.asyncio
async def test_bank_accounts_update(client: AsyncClient, tenant_admin_token):
    accounts = [
        {"bank_name": "Sparkasse", "iban": "DE89370400440532013000", "bic": "COBADEFFXXX", "is_default": True},
    ]
    resp = await client.put(
        "/api/v1/trainings/finance/bank-accounts",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"bank_accounts": accounts},
    )
    assert resp.status_code == 200
    assert len(resp.json()["bank_accounts"]) == 1


@pytest.mark.asyncio
async def test_bank_accounts_multiple_defaults_rejected(client: AsyncClient, tenant_admin_token):
    accounts = [
        {"bank_name": "Bank A", "iban": "DE1234", "bic": "BIC1", "is_default": True},
        {"bank_name": "Bank B", "iban": "DE5678", "bic": "BIC2", "is_default": True},
    ]
    resp = await client.put(
        "/api/v1/trainings/finance/bank-accounts",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"bank_accounts": accounts},
    )
    assert resp.status_code == 400


# ── Invoice Templates ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invoice_templates_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/invoice-templates", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["invoice_page_format"] == "A4"


@pytest.mark.asyncio
async def test_invoice_templates_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/invoice-templates",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"invoice_page_format": "Letter", "invoice_header_html": "<p>Header</p>"},
    )
    assert resp.status_code == 200
    assert resp.json()["invoice_page_format"] == "Letter"
    assert "Header" in resp.json()["invoice_header_html"]


@pytest.mark.asyncio
async def test_invoice_templates_invalid_format(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/invoice-templates",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"invoice_page_format": "INVALID"},
    )
    assert resp.status_code == 400


# ── ZUGFeRD ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_zugferd_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/zugferd", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["zugferd_enabled"] is False


@pytest.mark.asyncio
async def test_zugferd_toggle(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/zugferd",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"zugferd_enabled": True},
    )
    assert resp.status_code == 200
    assert resp.json()["zugferd_enabled"] is True


# ── Stripe ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stripe_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/stripe", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["is_enabled"] is False


@pytest.mark.asyncio
async def test_stripe_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/stripe",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"publishable_key": "pk_test_123", "secret_key": "sk_test_secret123", "is_enabled": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_enabled"] is True


# ── Payment Reminders ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_reminders_defaults(client: AsyncClient, tenant_admin_token):
    resp = await client.get("/api/v1/trainings/finance/payment-reminders", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["first_reminder_days"] == 2


@pytest.mark.asyncio
async def test_payment_reminders_update(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/payment-reminders",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"first_reminder_days": 7, "second_reminder_days": 21},
    )
    assert resp.status_code == 200
    assert resp.json()["first_reminder_days"] == 7


@pytest.mark.asyncio
async def test_payment_reminders_invalid_days(client: AsyncClient, tenant_admin_token):
    resp = await client.put(
        "/api/v1/trainings/finance/payment-reminders",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json={"first_reminder_days": 0},
    )
    assert resp.status_code == 400


# ── Auth ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_requires_admin(client: AsyncClient, regular_user_token):
    resp = await client.get("/api/v1/trainings/finance/currency-tax", headers={AUTH: f"Bearer {regular_user_token}"})
    assert resp.status_code == 403


# ── Cross-tab persistence ────────────────────────────────────────


@pytest.mark.asyncio
async def test_configured_tenant_data(client: AsyncClient, finance_tenant, tenant_admin_token):
    """Verify pre-configured finance data is returned correctly."""
    resp = await client.get("/api/v1/trainings/finance/currency-tax", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.json()["currency"] == "USD"

    resp = await client.get("/api/v1/trainings/finance/company-data", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.json()["company_info"]["name"] == "Test Corp"

    resp = await client.get("/api/v1/trainings/finance/bank-accounts", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert len(resp.json()["bank_accounts"]) == 1

    resp = await client.get("/api/v1/trainings/finance/payment-reminders", headers={AUTH: f"Bearer {tenant_admin_token}"})
    assert resp.json()["first_reminder_days"] == 5
