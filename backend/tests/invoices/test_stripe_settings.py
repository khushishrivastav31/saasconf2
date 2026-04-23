"""Tests for Stripe settings endpoints and invoice template variables."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.conference import Conference
from app.models.fiscal_representative import FiscalRepresentative
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# -- Helpers ----------------------------------------------------------------


def _make_token(
    user: User,
    modules: list[str] | None = None,
    is_tenant_super_user: bool = False,
    tenant_roles: list[dict[str, str]] | None = None,
) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
        is_tenant_super_user=is_tenant_super_user,
        tenant_roles=tenant_roles,
    )


def _stripe_settings_url(conference_id: uuid.UUID) -> str:
    """Build the Stripe settings endpoint URL."""
    return f"/api/v1/conferences/{conference_id}/settings/stripe-settings"


def _invoice_settings_url(conference_id: uuid.UUID) -> str:
    """Build the invoice settings endpoint URL."""
    return f"/api/v1/conferences/{conference_id}/settings/invoice-settings"


# -- Fixtures ---------------------------------------------------------------


@pytest_asyncio.fixture()
async def tenant_super_user(db_session: AsyncSession, tenant: Tenant) -> User:
    """Create a tenant super user by setting tenant.super_user_id."""
    from app.core.security import hash_password

    # Create the user first
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"superuser-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Tenant",
        last_name="SuperUser",
        role="tenant_admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    # Set as tenant super user
    tenant.super_user_id = user.id
    await db_session.commit()
    await db_session.refresh(user)
    await db_session.refresh(tenant)

    return user


@pytest.fixture()
def super_user_token(tenant_super_user: User) -> str:
    """Return a valid access token for the tenant super user."""
    return _make_token(
        tenant_super_user,
        modules=["conferences"],
        is_tenant_super_user=True,
        tenant_roles=[{"scope": "all", "level": "super_user"}],
    )


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin (non-super)."""
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest_asyncio.fixture()
async def conference_with_settings(
    db_session: AsyncSession,
    tenant: Tenant,
) -> Conference:
    """Create a conference with some invoice settings."""
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="TestConf 2026",
        abbreviation="TC26",
        is_active=True,
        currency="EUR",
        settings={
            "invoice_company_info": {
                "name": "Test Corp GmbH",
                "address": "Hauptstrasse 1, Suite 100",  # Single address field
                "city": "Berlin",
                "postal_code": "10115",
                "country": "Germany",
                "tax_id": "DE123456789",
                "vat_source": "company",
                "bank_accounts": [
                    {
                        "bank_name": "Deutsche Bank",
                        "iban": "DE89370400440532013000",
                        "bic": "COBADEFFXXX",
                        "is_default": True,
                    }
                ],
            },
            "invoice_template_html": "<html><body>[COMPANY_NAME]</body></html>",
        },
    )
    db_session.add(conf)
    await db_session.commit()
    return conf


@pytest_asyncio.fixture()
async def fiscal_rep(
    db_session: AsyncSession,
    tenant: Tenant,
    conference_with_settings: Conference,
) -> FiscalRepresentative:
    """Create a fiscal representative for template variable tests."""
    rep = FiscalRepresentative(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference_with_settings.id,
        company_name="Tax Rep GmbH",
        address_line1="Steuerstrasse 10",
        address_line2="Suite 5",
        city="Munich",
        postal_code="80331",
        country="Germany",
        email="info@taxrep.de",
        vat_number="DE987654321",
        conference_vat_number="DE111222333",
        is_active=True,
    )
    db_session.add(rep)
    await db_session.commit()
    return rep


# -- Stripe Settings Tests --------------------------------------------------


@pytest.mark.asyncio()
async def test_get_stripe_settings_empty(
    client: AsyncClient,
    conference: Conference,
    admin_token: str,
) -> None:
    """Test GET Stripe settings when none configured."""
    url = _stripe_settings_url(conference.id)
    response = await client.get(url, headers=auth_headers(admin_token))

    assert response.status_code == 200
    data = response.json()
    assert data["publishable_key"] is None
    assert data["secret_key"] is None
    assert data["is_enabled"] is False


@pytest.mark.asyncio()
async def test_update_stripe_settings_non_super_user_forbidden(
    client: AsyncClient,
    conference: Conference,
    admin_token: str,  # Regular admin, NOT super user
) -> None:
    """Test non-super-user cannot update Stripe settings (403)."""
    url = _stripe_settings_url(conference.id)
    payload = {
        "publishable_key": "pk_test_123",
        "secret_key": "sk_test_456",
        "is_enabled": True,
    }

    response = await client.put(url, json=payload, headers=auth_headers(admin_token))

    assert response.status_code == 403
    assert "Only tenant super users can update Stripe settings" in response.json()["detail"]


@pytest.mark.asyncio()
async def test_update_stripe_settings_super_user_success(
    client: AsyncClient,
    conference: Conference,
    super_user_token: str,
) -> None:
    """Test tenant super user can successfully update Stripe settings."""
    url = _stripe_settings_url(conference.id)
    payload = {
        "publishable_key": "pk_test_abcdef123456",
        "secret_key": "sk_test_secret789xyz",
        "is_enabled": True,
    }

    response = await client.put(url, json=payload, headers=auth_headers(super_user_token))

    assert response.status_code == 200
    data = response.json()
    assert data["publishable_key"] == "pk_test_abcdef123456"
    assert data["secret_key"] == "sk_test_secret789xyz"  # Full key for super user
    assert data["is_enabled"] is True

    # Verify persistence
    get_response = await client.get(url, headers=auth_headers(super_user_token))
    assert get_response.status_code == 200
    get_data = get_response.json()
    assert get_data["publishable_key"] == "pk_test_abcdef123456"
    assert get_data["secret_key"] == "sk_test_secret789xyz"


@pytest.mark.asyncio()
async def test_get_stripe_settings_masking_for_non_super_user(
    client: AsyncClient,
    conference: Conference,
    super_user_token: str,
    admin_token: str,
) -> None:
    """Test secret key is masked for non-super-users."""
    url = _stripe_settings_url(conference.id)

    # Super user sets keys
    payload = {
        "publishable_key": "pk_test_abcdef123456",
        "secret_key": "sk_test_secret789xyz",
        "is_enabled": True,
    }
    await client.put(url, json=payload, headers=auth_headers(super_user_token))

    # Regular admin sees masked key
    response = await client.get(url, headers=auth_headers(admin_token))
    assert response.status_code == 200
    data = response.json()
    assert data["publishable_key"] == "pk_test_abcdef123456"  # Publishable key visible
    assert data["secret_key"] == "sk_**************xyz"  # Secret key masked (20 chars total)
    assert data["is_enabled"] is True


@pytest.mark.asyncio()
async def test_partial_stripe_settings_update(
    client: AsyncClient,
    conference: Conference,
    super_user_token: str,
) -> None:
    """Test partial update preserves existing fields."""
    url = _stripe_settings_url(conference.id)

    # Initial full settings
    payload1 = {
        "publishable_key": "pk_test_111",
        "secret_key": "sk_test_222",
        "is_enabled": True,
    }
    await client.put(url, json=payload1, headers=auth_headers(super_user_token))

    # Partial update (only toggle enabled)
    payload2 = {"is_enabled": False}
    response = await client.put(url, json=payload2, headers=auth_headers(super_user_token))

    assert response.status_code == 200
    data = response.json()
    assert data["publishable_key"] == "pk_test_111"  # Preserved
    assert data["secret_key"] == "sk_test_222"  # Preserved
    assert data["is_enabled"] is False  # Updated


# -- Address Field Migration Tests -----------------------------------------


@pytest.mark.asyncio()
async def test_address_field_single_format(
    client: AsyncClient,
    conference_with_settings: Conference,
    admin_token: str,
) -> None:
    """Test invoice settings with new single address field."""
    url = _invoice_settings_url(conference_with_settings.id)
    response = await client.get(url, headers=auth_headers(admin_token))

    assert response.status_code == 200
    data = response.json()
    company_info = data["invoice_company_info"]

    # Verify single address field
    assert company_info["address"] == "Hauptstrasse 1, Suite 100"
    assert company_info["city"] == "Berlin"
    assert company_info["postal_code"] == "10115"


@pytest.mark.asyncio()
async def test_address_field_legacy_format(
    db_session: AsyncSession,
    client: AsyncClient,
    tenant: Tenant,
    admin_token: str,
) -> None:
    """Test invoice settings with legacy two-field address (backward compatibility)."""
    # Create conference with legacy address format
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Legacy Conf",
        abbreviation="LC26",
        is_active=True,
        settings={
            "invoice_company_info": {
                "name": "Legacy Corp",
                "address_line1": "Old Street 1",  # Legacy format
                "address_line2": "Building A",
                "city": "Hamburg",
                "postal_code": "20095",
                "country": "Germany",
            }
        },
    )
    db_session.add(conf)
    await db_session.commit()

    url = _invoice_settings_url(conf.id)
    response = await client.get(url, headers=auth_headers(admin_token))

    assert response.status_code == 200
    data = response.json()
    company_info = data["invoice_company_info"]

    # Should still return legacy fields if present
    assert "address_line1" in company_info or "address" in company_info
    assert company_info["city"] == "Hamburg"


# -- Template Variables Tests -----------------------------------------------


@pytest.mark.asyncio()
async def test_comprehensive_template_variables(
    db_session: AsyncSession,
    client: AsyncClient,
    conference_with_settings: Conference,
    fiscal_rep: FiscalRepresentative,
    super_user_token: str,
) -> None:
    """Test all new template variables in invoice settings."""
    # Update conference settings to use comprehensive template
    # Note: Must reassign entire settings dict for SQLAlchemy to detect JSONB change
    settings = conference_with_settings.settings or {}
    settings["invoice_template_html"] = """
    <html>
    <body>
        <h1>[COMPANY_NAME]</h1>
        <p>[COMPANY_ADDRESS]</p>
        <p>[COMPANY_CITY], [COMPANY_POSTAL_CODE]</p>
        <p>[COMPANY_COUNTRY]</p>
        <p>VAT: [COMPANY_VAT]</p>
        <p>Tax ID: [COMPANY_TAX_ID]</p>

        <h2>Fiscal Rep</h2>
        <p>[FISCAL_REP_NAME]</p>
        <p>[FISCAL_REP_ADDRESS]</p>
        <p>[FISCAL_REP_CITY], [FISCAL_REP_POSTAL_CODE]</p>
        <p>[FISCAL_REP_COUNTRY]</p>
        <p>FR VAT: [FISCAL_REP_VAT]</p>
        <p>FR Tax ID: [FISCAL_REP_TAX_ID]</p>

        <h2>Banking</h2>
        <p>[BANK_NAME]</p>
        <p>[IBAN]</p>
        <p>[BIC]</p>

        <h2>Invoice Details</h2>
        <p>[INVOICE_NUMBER]</p>
        <p>[ISSUE_DATE]</p>
        <p>[DUE_DATE]</p>
        <p>Currency: [CURRENCY_1]</p>
        <p>Alt Currency: [CURRENCY_2]</p>

        <h2>Items</h2>
        [ITEMS_TABLE]

        <h2>Totals</h2>
        <p>Subtotal: [SUBTOTAL]</p>
        <p>Tax ([TAX_RATE]%): [TAX_AMOUNT]</p>
        <p>Total: [TOTAL]</p>
    </body>
    </html>
    """
    conference_with_settings.settings = settings
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(conference_with_settings, "settings")
    await db_session.flush()
    await db_session.commit()
    await db_session.refresh(conference_with_settings)

    url = _invoice_settings_url(conference_with_settings.id)
    response = await client.get(url, headers=auth_headers(super_user_token))

    assert response.status_code == 200
    data = response.json()
    template = data["invoice_template_html"]

    # Verify all placeholders present
    assert "[COMPANY_NAME]" in template
    assert "[COMPANY_ADDRESS]" in template
    assert "[COMPANY_CITY]" in template
    assert "[COMPANY_POSTAL_CODE]" in template
    assert "[COMPANY_COUNTRY]" in template
    assert "[COMPANY_VAT]" in template
    assert "[COMPANY_TAX_ID]" in template

    assert "[FISCAL_REP_NAME]" in template
    assert "[FISCAL_REP_ADDRESS]" in template
    assert "[FISCAL_REP_CITY]" in template
    assert "[FISCAL_REP_POSTAL_CODE]" in template
    assert "[FISCAL_REP_COUNTRY]" in template
    assert "[FISCAL_REP_VAT]" in template
    assert "[FISCAL_REP_TAX_ID]" in template

    assert "[BANK_NAME]" in template
    assert "[IBAN]" in template
    assert "[BIC]" in template

    assert "[INVOICE_NUMBER]" in template
    assert "[ISSUE_DATE]" in template
    assert "[DUE_DATE]" in template
    assert "[CURRENCY_1]" in template
    assert "[CURRENCY_2]" in template

    assert "[ITEMS_TABLE]" in template
    assert "[SUBTOTAL]" in template
    assert "[TAX_RATE]" in template
    assert "[TAX_AMOUNT]" in template
    assert "[TOTAL]" in template


@pytest.mark.asyncio()
async def test_vat_source_selector(
    db_session: AsyncSession,
    client: AsyncClient,
    conference_with_settings: Conference,
    fiscal_rep: FiscalRepresentative,
    admin_token: str,
) -> None:
    """Test VAT source selector (company vs fiscal_rep)."""
    url = _invoice_settings_url(conference_with_settings.id)

    # Initially set to company
    response = await client.get(url, headers=auth_headers(admin_token))
    assert response.status_code == 200
    data = response.json()
    assert data["invoice_company_info"]["vat_source"] == "company"

    # Update to fiscal_rep
    payload = {
        "invoice_company_info": {
            "vat_source": "fiscal_rep",
        }
    }
    update_response = await client.put(url, json=payload, headers=auth_headers(admin_token))
    assert update_response.status_code == 200
    updated_data = update_response.json()
    assert updated_data["invoice_company_info"]["vat_source"] == "fiscal_rep"


@pytest.mark.asyncio()
async def test_bank_accounts_array(
    db_session: AsyncSession,
    client: AsyncClient,
    conference_with_settings: Conference,
    admin_token: str,
) -> None:
    """Test bank accounts array with default selection."""
    url = _invoice_settings_url(conference_with_settings.id)

    # Add second bank account
    payload = {
        "invoice_company_info": {
            "bank_accounts": [
                {
                    "bank_name": "Deutsche Bank",
                    "iban": "DE89370400440532013000",
                    "bic": "COBADEFFXXX",
                    "is_default": False,
                },
                {
                    "bank_name": "Commerzbank",
                    "iban": "DE12500105170648489890",
                    "bic": "COBADEFFYYY",
                    "is_default": True,  # New default
                },
            ]
        }
    }

    response = await client.put(url, json=payload, headers=auth_headers(admin_token))
    assert response.status_code == 200
    data = response.json()
    accounts = data["invoice_company_info"]["bank_accounts"]

    assert len(accounts) == 2
    assert accounts[0]["is_default"] is False
    assert accounts[1]["is_default"] is True
    assert accounts[1]["bank_name"] == "Commerzbank"
