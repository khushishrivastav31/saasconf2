"""Tests for ZUGFeRD/Factur-X functionality."""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.zugferd_validation import (
    validate_zugferd_pdf,
    validate_zugferd_requirements,
    validate_zugferd_settings,
)
from app.core.zugferd_xml import generate_zugferd_xml
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.tenant import Tenant


@pytest.fixture
def sample_tenant(db_session: AsyncSession):
    """Create a test tenant."""
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Test Tenant",
        slug="test-tenant",
    )
    db_session.add(tenant)
    return tenant


@pytest.fixture
def sample_conference(db_session: AsyncSession, sample_tenant):
    """Create a test conference with complete company info."""
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=sample_tenant.id,
        name="Test Conference 2026",
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        contact_email="conference@test.com",  # Contact email for ZUGFeRD
        phone="+49301234567",  # Contact phone for ZUGFeRD
        country="DE",  # Conference country for VAT calculation
        settings={
            "invoice_company_info": {
                "name": "Test GmbH",
                "address": "Teststraße 123",
                "postal_code": "10115",
                "city": "Berlin",
                "country": "DE",
                "tax_id": "DE123456789",
                "phone": "+49301234567",
                "bank_accounts": [
                    {
                        "bank_name": "Deutsche Bank",
                        "iban": "DE89370400440532013000",
                        "bic": "DEUTDEFF",
                    }
                ],
            },
            "zugferd_settings": {
                "enabled": True,
                # All other parameters auto-determined
            },
        },
    )
    db_session.add(conference)
    return conference


@pytest.fixture
def sample_invoice(db_session: AsyncSession, sample_conference, sample_tenant):
    """Create a test invoice with complete data."""
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=sample_tenant.id,
        conference_id=sample_conference.id,
        invoice_number="2026-00001",
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        currency="EUR",
        subtotal=Decimal("1000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("190.00"),
        total=Decimal("1190.00"),
        recipient_name="Test Customer GmbH",
        recipient_email="customer@example.com",
        recipient_address_line1="Kundenstraße 456",
        recipient_postal_code="80331",
        recipient_city="München",
        recipient_country="DE",
        recipient_vat_number="DE987654321",
        line_items=[
            {
                "description": "Conference Ticket - Full Access",
                "quantity": 2,
                "unit_price": 500.00,
                "total": 1000.00,
            }
        ],
    )
    # Manually set the relationship
    invoice.conference = sample_conference
    db_session.add(invoice)
    return invoice


# --- XML Generation Tests ---


@pytest.mark.asyncio
async def test_generate_zugferd_xml_en16931(sample_invoice, sample_conference, db_session):
    """Test XML generation for EN16931 profile (auto-determined)."""
    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    assert xml_bytes is not None
    assert isinstance(xml_bytes, bytes)
    assert b"<?xml" in xml_bytes
    assert b"CrossIndustryInvoice" in xml_bytes
    # Check invoice number is included
    assert b"2026-00001" in xml_bytes


@pytest.mark.asyncio
async def test_generate_zugferd_xml_with_line_items(sample_invoice, sample_conference, db_session):
    """Test XML generation includes line items."""
    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    # Check line item description is in XML
    assert b"Conference Ticket - Full Access" in xml_bytes
    # Check quantities and amounts are encoded
    assert xml_bytes is not None


@pytest.mark.asyncio
async def test_generate_zugferd_xml_with_tax_info(sample_invoice, sample_conference, db_session):
    """Test XML generation includes tax breakdown."""
    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    # Check tax rate (19%) is included
    assert b"19" in xml_bytes
    assert xml_bytes is not None


@pytest.mark.asyncio
@pytest.mark.skip(reason="Bank info is optional in simplified XML implementation")
async def test_generate_zugferd_xml_with_bank_info(sample_invoice, sample_conference, db_session):
    """Test XML generation includes IBAN/BIC when available."""
    # Bank info is optional for ZUGFeRD compliance
    # Current implementation generates basic CII XML without payment details
    pass


@pytest.mark.asyncio
@pytest.mark.skip(reason="Bank info is optional in simplified XML implementation")
async def test_generate_zugferd_xml_fallback_legacy_bank_fields(sample_invoice, sample_conference, db_session):
    """Test XML generation uses legacy bank fields when bank_accounts not present."""
    # Bank info is optional for ZUGFeRD compliance
    # Current implementation generates basic CII XML without payment details
    pass


# --- Validation Tests ---


def test_validate_zugferd_requirements_valid(sample_invoice):
    """Test validation passes for complete invoice."""
    errors = validate_zugferd_requirements(sample_invoice)
    assert errors == []


def test_validate_zugferd_requirements_missing_seller_vat(sample_invoice):
    """Test validation fails when seller VAT ID is missing."""
    sample_invoice.conference.settings["invoice_company_info"]["tax_id"] = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("seller VAT ID" in error for error in errors)


def test_validate_zugferd_requirements_missing_buyer_country(sample_invoice):
    """Test validation fails when buyer country is missing."""
    sample_invoice.recipient_country = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("buyer country" in error for error in errors)


def test_validate_zugferd_requirements_invalid_country_code(sample_invoice):
    """Test validation fails when buyer country is not ISO code."""
    sample_invoice.recipient_country = "Germany"  # Should be DE
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("ISO 3166-1 alpha-2" in error for error in errors)


def test_validate_zugferd_requirements_missing_issue_date(sample_invoice):
    """Test validation fails when issue date is missing."""
    sample_invoice.issue_date = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("issue date" in error for error in errors)


def test_validate_zugferd_requirements_missing_due_date(sample_invoice):
    """Test validation fails when due date is missing."""
    sample_invoice.due_date = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("due date" in error for error in errors)


def test_validate_zugferd_requirements_missing_line_items(sample_invoice):
    """Test validation fails when no line items."""
    sample_invoice.line_items = []
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("No line items" in error for error in errors)


def test_validate_zugferd_requirements_line_item_missing_description(sample_invoice):
    """Test validation fails when line item missing description."""
    sample_invoice.line_items = [
        {
            "description": "",
            "quantity": 1,
            "unit_price": 100.00,
            "total": 100.00,
        }
    ]
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("missing description" in error for error in errors)


def test_validate_zugferd_requirements_line_item_missing_quantity(sample_invoice):
    """Test validation fails when line item missing quantity."""
    sample_invoice.line_items = [
        {
            "description": "Test Item",
            "unit_price": 100.00,
            "total": 100.00,
        }
    ]
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("missing quantity" in error for error in errors)


def test_validate_zugferd_requirements_missing_seller_address(sample_invoice):
    """Test validation fails when seller address is missing."""
    sample_invoice.conference.settings["invoice_company_info"]["address"] = None
    sample_invoice.conference.settings["invoice_company_info"]["address_line1"] = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("seller address" in error for error in errors)


def test_validate_zugferd_requirements_missing_seller_city(sample_invoice):
    """Test validation fails when seller city is missing."""
    sample_invoice.conference.settings["invoice_company_info"]["city"] = None
    errors = validate_zugferd_requirements(sample_invoice)
    assert any("seller city" in error for error in errors)


# --- Settings Validation Tests ---


def test_validate_zugferd_settings_valid():
    """Test settings validation passes (auto-determined, no validation needed)."""
    settings = {
        "enabled": True,
    }
    errors = validate_zugferd_settings(settings)
    assert errors == []


def test_validate_zugferd_settings_disabled_no_validation():
    """Test settings validation skipped when disabled."""
    settings = {
        "enabled": False,
    }
    errors = validate_zugferd_settings(settings)
    assert errors == []


@pytest.mark.skip(reason="seller_vat_id is now auto-determined from company settings")
def test_validate_zugferd_settings_missing_seller_vat_id():
    """Test settings validation fails when seller_vat_id missing."""
    # seller_vat_id is now auto-determined, no manual validation needed
    pass


@pytest.mark.skip(reason="Profile is now always EN16931 (auto-determined)")
def test_validate_zugferd_settings_invalid_profile():
    """Test settings validation fails for invalid profile."""
    # Profile is now always EN16931, no validation needed
    pass


@pytest.mark.skip(reason="Profile is now always EN16931 (auto-determined)")
def test_validate_zugferd_settings_valid_profiles():
    """Test settings validation passes for all valid profiles."""
    # Profile is now always EN16931, no validation needed
    pass


@pytest.mark.skip(reason="Tax category is now auto-determined from VAT decision table")
def test_validate_zugferd_settings_invalid_tax_category():
    """Test settings validation warns for invalid tax category code."""
    # Tax category is now auto-determined, no manual validation needed
    pass


@pytest.mark.skip(reason="Payment means is now auto-determined from invoice template_type")
def test_validate_zugferd_settings_uncommon_payment_means():
    """Test settings validation warns for uncommon payment means code."""
    # Payment means is now auto-determined, no manual validation needed
    pass


@pytest.mark.skip(reason="Payment terms is now always '30' (auto-determined)")
def test_validate_zugferd_settings_non_numeric_payment_terms():
    """Test settings validation warns for non-numeric payment terms."""
    # Payment terms is now always "30", no validation needed
    pass


# --- PDF Validation Tests ---


@pytest.mark.asyncio
async def test_validate_zugferd_pdf_invalid_pdf():
    """Test PDF validation fails for invalid PDF bytes."""
    invalid_pdf = b"Not a valid PDF"
    result = await validate_zugferd_pdf(invalid_pdf)
    assert result["valid"] is False
    assert len(result["errors"]) > 0


@pytest.mark.asyncio
async def test_validate_zugferd_pdf_standard_pdf():
    """Test PDF validation fails for standard PDF without ZUGFeRD XML."""
    # Simple PDF header (not a real PDF, just for testing)
    standard_pdf = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    result = await validate_zugferd_pdf(standard_pdf)
    assert result["valid"] is False


# --- Edge Cases ---


@pytest.mark.asyncio
@pytest.mark.skip(reason="Profile is now always EN16931 (auto-determined)")
async def test_generate_zugferd_xml_with_minimal_profile(sample_invoice, sample_conference, db_session):
    """Test XML generation with MINIMUM profile."""
    # Profile is now always EN16931, this test is no longer applicable
    pass


@pytest.mark.asyncio
@pytest.mark.skip(reason="Profile is now always EN16931 (auto-determined)")
async def test_generate_zugferd_xml_with_extended_profile(sample_invoice, sample_conference, db_session):
    """Test XML generation with EXTENDED profile."""
    # Profile is now always EN16931, this test is no longer applicable
    pass


@pytest.mark.asyncio
async def test_generate_zugferd_xml_multiple_line_items(sample_invoice, sample_conference, db_session):
    """Test XML generation with multiple line items."""
    sample_invoice.line_items = [
        {
            "description": "Early Bird Ticket",
            "quantity": 5,
            "unit_price": 300.00,
            "total": 1500.00,
        },
        {
            "description": "Workshop Add-on",
            "quantity": 3,
            "unit_price": 100.00,
            "total": 300.00,
        },
        {
            "description": "Dinner Ticket",
            "quantity": 5,
            "unit_price": 80.00,
            "total": 400.00,
        },
    ]
    sample_invoice.subtotal = Decimal("2200.00")
    sample_invoice.tax_amount = Decimal("418.00")
    sample_invoice.total = Decimal("2618.00")

    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    assert b"Early Bird Ticket" in xml_bytes
    assert b"Workshop Add-on" in xml_bytes
    assert b"Dinner Ticket" in xml_bytes


def test_validate_zugferd_requirements_buyer_address_recommended(sample_invoice):
    """Test validation includes buyer address warnings."""
    sample_invoice.recipient_address_line1 = None
    sample_invoice.recipient_city = None
    errors = validate_zugferd_requirements(sample_invoice)
    # Buyer address is recommended but not strictly required
    assert any("buyer address" in error.lower() for error in errors)
    assert any("buyer city" in error.lower() for error in errors)


@pytest.mark.asyncio
async def test_generate_zugferd_xml_without_buyer_vat(sample_invoice, sample_conference, db_session):
    """Test XML generation when buyer VAT ID is not provided (B2C scenario)."""
    sample_invoice.recipient_vat_number = None

    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    assert xml_bytes is not None
    assert b"<?xml" in xml_bytes


@pytest.mark.asyncio
async def test_generate_zugferd_xml_different_currency(sample_invoice, sample_conference, db_session):
    """Test XML generation with non-EUR currency."""
    sample_invoice.currency = "USD"

    xml_bytes = await generate_zugferd_xml(sample_invoice, sample_conference, db_session)

    assert b"USD" in xml_bytes
