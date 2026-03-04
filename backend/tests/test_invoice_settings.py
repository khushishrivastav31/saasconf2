"""Tests for invoice settings endpoints."""

import pytest
from httpx import AsyncClient

from app.core.invoice_pdf import DEFAULT_INVOICE_TEMPLATE_HTML
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_invoice_settings_defaults(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test GET invoice settings returns defaults when not configured."""
    headers = auth_headers(tenant_admin_token)

    response = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()

    assert data["invoice_number_template"] == "[ConferenceSlug]_[YYYY]_[Count]"
    assert data["invoice_counter_reset"] == "yearly"
    assert data["invoice_counter_value"] == 1
    assert data["invoice_template_html"] == DEFAULT_INVOICE_TEMPLATE_HTML
    assert data["invoice_company_info"]["name"] == ""
    assert data["invoice_company_info"]["tax_id"] == ""


@pytest.mark.asyncio
async def test_update_invoice_settings_template(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test updating invoice number template."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_number_template": "ATD_[YYYY]_[Count]",
            "invoice_counter_reset": "daily",
            "invoice_counter_value": 42,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["invoice_number_template"] == "ATD_[YYYY]_[Count]"
    assert data["invoice_counter_reset"] == "daily"
    assert data["invoice_counter_value"] == 42


@pytest.mark.asyncio
async def test_update_invoice_settings_company_info(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test updating company information."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "name": "My Company Ltd",
                "address_line1": "123 Main St",
                "city": "Berlin",
                "postal_code": "10115",
                "country": "Germany",
                "tax_id": "DE123456789",
                "bank_name": "Example Bank",
                "iban": "DE89370400440532013000",
                "bic": "COBADEFFXXX",
            }
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["invoice_company_info"]["name"] == "My Company Ltd"
    assert data["invoice_company_info"]["address_line1"] == "123 Main St"
    assert data["invoice_company_info"]["tax_id"] == "DE123456789"
    assert data["invoice_company_info"]["iban"] == "DE89370400440532013000"


@pytest.mark.asyncio
async def test_update_invoice_settings_partial_company_info(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test partial update of company information merges with existing."""
    headers = auth_headers(tenant_admin_token)

    # First update
    await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "name": "My Company",
                "tax_id": "DE123456789",
            }
        },
    )

    # Partial update
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "iban": "DE89370400440532013000",
            }
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Should merge: keep old values and add new ones
    assert data["invoice_company_info"]["name"] == "My Company"
    assert data["invoice_company_info"]["tax_id"] == "DE123456789"
    assert data["invoice_company_info"]["iban"] == "DE89370400440532013000"


@pytest.mark.asyncio
async def test_update_invoice_settings_invalid_template(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test validation of invoice number template."""
    headers = auth_headers(tenant_admin_token)

    # Invalid template (uses unknown variable)
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_number_template": "[InvalidVar]_[Count]",
        },
    )

    assert response.status_code == 400
    assert "Invalid variables" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_invoice_settings_missing_uniqueness_var(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test template must contain [Count] or [YYYY] for uniqueness."""
    headers = auth_headers(tenant_admin_token)

    # Template without [Count] or [YYYY]
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_number_template": "[ConferenceSlug]_[MM]_[DD]",
        },
    )

    assert response.status_code == 400
    assert "must contain [Count] or [YYYY]" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_invoice_settings_invalid_counter_reset(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test validation of invoice_counter_reset field."""
    headers = auth_headers(tenant_admin_token)

    # Invalid counter reset mode
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_counter_reset": "invalid",
        },
    )

    assert response.status_code == 422
    assert "daily" in response.text.lower() or "yearly" in response.text.lower()


@pytest.mark.asyncio
async def test_get_invoice_settings_non_admin(
    client: AsyncClient,
    regular_user_token,
    conference,
    tenant_with_modules,
):
    """Test non-admin users can view settings (needed for PDF generation)."""
    headers = auth_headers(regular_user_token)

    response = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
    )

    # GET should work for non-admin users
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_invoice_settings_non_admin(
    client: AsyncClient,
    regular_user_token,
    conference,
    tenant_with_modules,
):
    """Test non-admin users cannot update settings."""
    headers = auth_headers(regular_user_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_number_template": "HACK_[Count]",
        },
    )

    # PUT should fail for non-admin users
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_invoice_template_html(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test updating invoice PDF template HTML."""
    headers = auth_headers(tenant_admin_token)

    custom_html = "<html><body><h1>Custom Invoice</h1>[INVOICE_NUMBER]</body></html>"

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_template_html": custom_html,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["invoice_template_html"] == custom_html


@pytest.mark.asyncio
async def test_update_invoice_settings_with_bank_accounts(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test multiple bank accounts with default selection."""
    headers = auth_headers(tenant_admin_token)

    bank_accounts = [
        {
            "bank_name": "Deutsche Bank",
            "iban": "DE89370400440532013000",
            "bic": "COBADEFFXXX",
            "is_default": True,
        },
        {
            "bank_name": "Sparkasse",
            "iban": "FR1420041010050500013M02606",  # Valid French IBAN
            "bic": None,
            "is_default": False,
        },
    ]

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "name": "Test Company",
                "bank_accounts": bank_accounts,
            }
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Verify bank_accounts array persisted
    assert "bank_accounts" in data["invoice_company_info"]
    assert len(data["invoice_company_info"]["bank_accounts"]) == 2

    # Verify default flag persists
    default_account = next(
        (acc for acc in data["invoice_company_info"]["bank_accounts"] if acc["is_default"]), None
    )
    assert default_account is not None
    assert default_account["bank_name"] == "Deutsche Bank"

    # Verify non-default account saved
    non_default = next(
        (acc for acc in data["invoice_company_info"]["bank_accounts"] if not acc["is_default"]), None
    )
    assert non_default is not None
    assert non_default["bank_name"] == "Sparkasse"


@pytest.mark.asyncio
async def test_update_invoice_settings_with_vat_source(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test VAT source selection."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "vat_source": "fiscal_rep",
            }
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["invoice_company_info"]["vat_source"] == "fiscal_rep"


@pytest.mark.asyncio
async def test_preview_invoice_pdf(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test PDF preview with unsaved settings."""
    headers = auth_headers(tenant_admin_token)

    # Preview with bank_accounts and vat_source
    response = await client.post(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings/preview",
        headers=headers,
        json={
            "invoice_company_info": {
                "name": "Preview Company",
                "bank_accounts": [
                    {
                        "bank_name": "Test Bank",
                        "iban": "DE89370400440532013000",
                        "bic": "COBADEFFXXX",
                        "is_default": True,
                    }
                ],
                "vat_source": "company",
            }
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    # Verify PDF blob was returned
    assert len(response.content) > 0


@pytest.mark.asyncio
async def test_bank_account_iban_validation_valid(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test IBAN validation with valid IBAN."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Valid Bank",
                        "iban": "DE89370400440532013000",  # Valid German IBAN
                        "bic": "COBADEFFXXX",
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["invoice_company_info"]["bank_accounts"][0]["iban"] == "DE89370400440532013000"


@pytest.mark.asyncio
async def test_bank_account_iban_validation_invalid_checksum(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test IBAN validation rejects invalid checksum."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Invalid Bank",
                        "iban": "DE89370400440532013099",  # Wrong checksum
                        "bic": None,
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 422
    assert "Invalid IBAN" in response.text


@pytest.mark.asyncio
async def test_bank_account_iban_validation_too_short(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test IBAN validation rejects too short IBAN."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Short Bank",
                        "iban": "DE8937",  # Too short
                        "bic": None,
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 422
    # Pydantic field validation catches this before custom validator
    assert "at least 15 characters" in response.text or "Invalid IBAN" in response.text


@pytest.mark.asyncio
async def test_bank_account_iban_normalization(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test IBAN is normalized (spaces removed, uppercase)."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Normalized Bank",
                        "iban": "de89 3704 0044 0532 0130 00",  # Lowercase with spaces
                        "bic": None,
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 200
    data = response.json()
    # Should be normalized to uppercase without spaces
    assert data["invoice_company_info"]["bank_accounts"][0]["iban"] == "DE89370400440532013000"


@pytest.mark.asyncio
async def test_bank_account_bic_validation_valid(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test BIC validation with valid BIC."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Valid BIC Bank",
                        "iban": "DE89370400440532013000",
                        "bic": "COBADEFFXXX",  # Valid BIC
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["invoice_company_info"]["bank_accounts"][0]["bic"] == "COBADEFFXXX"


@pytest.mark.asyncio
async def test_bank_account_bic_validation_invalid(
    client: AsyncClient,
    tenant_admin_token,
    conference,
    tenant_with_modules,
):
    """Test BIC validation rejects invalid format."""
    headers = auth_headers(tenant_admin_token)

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/invoice-settings",
        headers=headers,
        json={
            "invoice_company_info": {
                "bank_accounts": [
                    {
                        "bank_name": "Invalid BIC Bank",
                        "iban": "DE89370400440532013000",
                        "bic": "INVALID",  # Too short
                        "is_default": True,
                    }
                ],
            }
        },
    )

    assert response.status_code == 422
    assert "Invalid BIC" in response.text
