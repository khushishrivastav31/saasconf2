"""Unit tests for VAT calculation engine."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.core.vat_calculation import (
    calculate_vat_for_invoice,
    classify_customer_location,
    classify_customer_type,
    infer_attendance_type_from_registration,
)
from app.models.booking import BookingOption
from app.models.invoice import Invoice
from app.models.registration import BillingProfile, Registration
from app.models.vat_rate_by_country import VatRateByCountry


def test_classify_customer_type_b2b():
    """B2B if VAT number exists."""
    assert classify_customer_type("DE123456789") == "b2b"
    assert classify_customer_type("FR12345678901") == "b2b"
    assert classify_customer_type("  AT123  ") == "b2b"  # trimmed


def test_classify_customer_type_b2c():
    """B2C if VAT number is None or empty."""
    assert classify_customer_type(None) == "b2c"
    assert classify_customer_type("") == "b2c"
    assert classify_customer_type("   ") == "b2c"  # whitespace only


def test_classify_customer_location_domestic():
    """Domestic if recipient country matches conference country."""
    eu_countries = ["DE", "FR", "IT"]
    assert classify_customer_location("DE", "DE", eu_countries) == "domestic"
    assert classify_customer_location("de", "DE", eu_countries) == "domestic"  # case insensitive
    assert classify_customer_location(" DE ", " de ", eu_countries) == "domestic"  # trim + case


def test_classify_customer_location_eu():
    """EU if recipient is in different EU country."""
    eu_countries = ["DE", "FR", "IT"]
    assert classify_customer_location("FR", "DE", eu_countries) == "eu"
    assert classify_customer_location("IT", "DE", eu_countries) == "eu"
    assert classify_customer_location("de", "FR", eu_countries) == "eu"  # case insensitive


def test_classify_customer_location_non_eu():
    """Non-EU if recipient is outside EU."""
    eu_countries = ["DE", "FR", "IT"]
    assert classify_customer_location("US", "DE", eu_countries) == "non_eu"
    assert classify_customer_location("GB", "DE", eu_countries) == "non_eu"
    assert classify_customer_location("CH", "FR", eu_countries) == "non_eu"


@pytest.mark.asyncio
async def test_infer_attendance_type_from_registration(db_session, conference, tenant):
    """Infer attendance type from Registration → BookingOption."""
    # Create booking option with attendance_type="virtual"
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Virtual Pass",
        sort_order=0,
        attendance_type="virtual",
    )
    db_session.add(booking_option)

    # Create billing profile for registration
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main St",
        postal_code="75001",
        city="Paris",
        country="FR",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_phone="+33123456789",
        contact_email="john@example.com",
    )
    db_session.add(billing_profile)

    # Create registration linked to booking option
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="John",
        last_name="Doe",
        email="john@example.com",
    )
    db_session.add(registration)
    await db_session.commit()

    # Create invoice linked to registration
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="John Doe",
        recipient_email="john@example.com",
        recipient_country="FR",
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )

    result = await infer_attendance_type_from_registration(invoice, db_session)
    assert result == "virtual"


@pytest.mark.asyncio
async def test_infer_attendance_type_from_registration_none(db_session):
    """Return None if invoice is not linked to registration."""
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        recipient_source_type=None,  # no linkage
        recipient_name="Manual Entry",
        recipient_email="manual@example.com",
        recipient_country="US",
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="USD",
    )

    result = await infer_attendance_type_from_registration(invoice, db_session)
    assert result is None


@pytest.mark.asyncio
async def test_calculate_vat_virtual_b2b_eu_reverse_charge(db_session, conference, tenant):
    """Virtual B2B EU → Reverse Charge (0% VAT, notes text)."""
    # Setup: DE conference, FR customer, B2B (has VAT number), virtual
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR", "IT"]}  # use default vat_rules

    # Create booking option with virtual attendance
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Virtual Pass",
        sort_order=0,
        attendance_type="virtual",
    )
    db_session.add(booking_option)

    # Create billing profile for registration
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Rue de la Paix",
        postal_code="75001",
        city="Paris",
        country="FR",
        contact_first_name="Jean",
        contact_last_name="Dupont",
        contact_phone="+33123456789",
        contact_email="jean@example.fr",
    )
    db_session.add(billing_profile)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Jean",
        last_name="Dupont",
        email="jean@example.fr",
    )
    db_session.add(registration)

    # Create invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="ACME SAS",
        recipient_email="jean@example.fr",
        recipient_country="FR",
        recipient_vat_number="FR12345678901",  # B2B
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions
    assert rate == Decimal("0.00")
    assert tax_amount == Decimal("0.00")
    assert notes_text is not None
    assert "VAT Reverse Charge" in notes_text
    assert "Article 196" in notes_text


@pytest.mark.asyncio
async def test_calculate_vat_virtual_b2c_eu_oss(db_session, conference, tenant):
    """Virtual B2C EU → OSS (customer country rate, notes text)."""
    # Setup: DE conference, FR customer, B2C (no VAT number), virtual
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR", "IT"]}  # use default vat_rules

    # Seed FR VAT rate
    fr_vat_rate = VatRateByCountry(
        id=uuid.uuid4(),
        country_code="FR",
        country_name="France",
        standard_rate=Decimal("20.00"),
        updated_at=datetime.now(UTC),
    )
    db_session.add(fr_vat_rate)

    # Create booking option with virtual attendance
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Virtual Pass",
        sort_order=0,
        attendance_type="virtual",
    )
    db_session.add(booking_option)

    # Create billing profile for registration
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="5 Rue de la Sorbonne",
        postal_code="75005",
        city="Paris",
        country="FR",
        contact_first_name="Marie",
        contact_last_name="Curie",
        contact_phone="+33123456789",
        contact_email="marie@example.fr",
    )
    db_session.add(billing_profile)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Marie",
        last_name="Curie",
        email="marie@example.fr",
    )
    db_session.add(registration)

    # Create invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="Marie Curie",
        recipient_email="marie@example.fr",
        recipient_country="FR",
        recipient_vat_number=None,  # B2C
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions
    assert rate == Decimal("20.00")
    assert tax_amount == Decimal("200.00")
    assert notes_text is not None
    assert "One-Stop Shop" in notes_text
    assert "OSS" in notes_text


@pytest.mark.skip(reason="ConferenceVatRate model deleted - uses old conference-based VAT system")
@pytest.mark.asyncio
async def test_calculate_vat_in_person_domestic(db_session, conference, tenant):
    """In-person domestic → Conference rate."""
    # Setup: DE conference, DE customer, B2C, in_person
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR", "IT"], "vat_rules": None}

    # Seed conference VAT rate
    conf_vat_rate = ConferenceVatRate(  # noqa: F821
        id=uuid.uuid4(),
        conference_id=conference.id,
        rate=Decimal("19.00"),
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db_session.add(conf_vat_rate)

    # Create booking option with in_person attendance
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        sort_order=0,
        attendance_type="in_person",
    )
    db_session.add(booking_option)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        booking_option_id=booking_option.id,
        first_name="Hans",
        last_name="Schmidt",
        email="hans@example.de",
    )
    db_session.add(registration)

    # Create invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="Hans Schmidt",
        recipient_email="hans@example.de",
        recipient_country="DE",
        recipient_vat_number=None,  # B2C
        template_type="bank_transfer",
        issue_date=date(2026, 3, 6),
        due_date=date(2026, 3, 20),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions
    assert rate == Decimal("19.00")
    assert tax_amount == Decimal("190.00")
    assert notes_text is None  # no reverse charge or OSS


@pytest.mark.skip(reason="ConferenceVatRate model deleted - uses old conference-based VAT system")
@pytest.mark.asyncio
async def test_calculate_vat_missing_conference_rate(db_session, conference, tenant):
    """Missing conference VAT rate → 0% with warning."""
    # Setup: DE conference, DE customer, in_person, no ConferenceVatRate
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR"]}  # use default vat_rules

    # Create booking option with in_person attendance
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        sort_order=0,
        attendance_type="in_person",
    )
    db_session.add(booking_option)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        booking_option_id=booking_option.id,
        first_name="Hans",
        last_name="Schmidt",
        email="hans@example.de",
    )
    db_session.add(registration)

    # Create invoice (issue_date with no matching ConferenceVatRate)
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="Hans Schmidt",
        recipient_email="hans@example.de",
        recipient_country="DE",
        template_type="bank_transfer",
        issue_date=date(2099, 12, 31),  # far future, no rate
        due_date=date(2099, 12, 31),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions
    assert rate == Decimal("0.00")
    assert tax_amount == Decimal("0.00")
    assert notes_text is None


@pytest.mark.asyncio
async def test_calculate_vat_missing_customer_country_rate(db_session, conference, tenant):
    """Missing customer country VAT rate → 0% with warning."""
    # Setup: DE conference, FR customer, B2C, virtual, but FR not in vat_rates_by_country
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR"]}  # use default vat_rules

    # Create booking option with virtual attendance
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Virtual Pass",
        sort_order=0,
        attendance_type="virtual",
    )
    db_session.add(booking_option)

    # Create billing profile for registration
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="10 Rue Pierre Curie",
        postal_code="75005",
        city="Paris",
        country="FR",
        contact_first_name="Marie",
        contact_last_name="Curie",
        contact_phone="+33123456789",
        contact_email="marie@example.fr",
    )
    db_session.add(billing_profile)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Marie",
        last_name="Curie",
        email="marie@example.fr",
    )
    db_session.add(registration)

    # Create invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="Marie Curie",
        recipient_email="marie@example.fr",
        recipient_country="FR",  # FR not in vat_rates_by_country
        recipient_vat_number=None,  # B2C
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions
    assert rate == Decimal("0.00")
    assert tax_amount == Decimal("0.00")
    # OSS text should still be appended even with 0% rate
    assert notes_text is not None
    assert "OSS" in notes_text


@pytest.mark.asyncio
async def test_calculate_vat_no_attendance_type_defaults_to_in_person(db_session, conference, tenant):
    """No attendance type → defaults to in_person."""
    # Setup: DE conference, US customer, no registration linkage
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE", "FR"]}  # use default vat_rules

    # Create invoice without registration linkage
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type=None,  # manual entry
        recipient_name="John Doe",
        recipient_email="john@example.com",
        recipient_country="US",
        template_type="bank_transfer",
        issue_date=date.today(),
        due_date=date.today(),
        subtotal=Decimal("1000.00"),
        currency="USD",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT (should default to in_person → non_eu → 0%)
    rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions: in_person + non_eu = no VAT
    assert rate == Decimal("0.00")
    assert tax_amount == Decimal("0.00")
    assert notes_text is None


@pytest.mark.skip(reason="ConferenceVatRate model deleted - uses old conference-based VAT system")
@pytest.mark.asyncio
async def test_calculate_vat_rounding(db_session, conference, tenant):
    """Tax amount is correctly rounded to 2 decimals."""
    # Setup: 19% VAT on 1000.33 EUR = 190.0627 → rounds to 190.06
    conference.country = "DE"
    conference.settings = {"eu_countries": ["DE"], "vat_rules": None}

    # Seed conference VAT rate
    conf_vat_rate = ConferenceVatRate(  # noqa: F821
        id=uuid.uuid4(),
        conference_id=conference.id,
        rate=Decimal("19.00"),
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db_session.add(conf_vat_rate)

    # Create booking option
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        sort_order=0,
        attendance_type="in_person",
    )
    db_session.add(booking_option)

    # Create registration
    registration = Registration(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        booking_option_id=booking_option.id,
        first_name="Test",
        last_name="User",
        email="test@example.de",
    )
    db_session.add(registration)

    # Create invoice with subtotal that causes rounding
    invoice = Invoice(
        id=uuid.uuid4(),
        conference_id=conference.id,
        tenant_id=tenant.id,
        recipient_source_type="registration",
        recipient_source_id=registration.id,
        recipient_name="Test User",
        recipient_email="test@example.de",
        recipient_country="DE",
        template_type="bank_transfer",
        issue_date=date(2026, 3, 6),
        due_date=date(2026, 3, 20),
        subtotal=Decimal("1000.33"),
        currency="EUR",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    rate, tax_amount, _ = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Assertions: 1000.33 * 0.19 = 190.0627 → 190.06
    assert rate == Decimal("19.00")
    assert tax_amount == Decimal("190.06")


@pytest.mark.asyncio
async def test_vat_calculated_on_discounted_subtotal(db_session, tenant, conference):
    """Test that VAT is calculated on subtotal AFTER discount, not before.

    Regression test for bug where VAT was calculated on subtotal before discounts.

    Scenario from real invoice:
    - Tutorial Day: 900.00 EUR - 0 discount = 900.00 EUR
    - Day 1: 900.00 EUR - 180.00 EUR = 720.00 EUR
    - Day 2: 900.00 EUR - 180.00 EUR = 720.00 EUR
    - Day 3: 900.00 EUR - 180.00 EUR = 720.00 EUR

    Correct calculation:
    - Subtotal (before discount): 3,600.00 EUR
    - Total discount: 540.00 EUR
    - Subtotal (after discount): 3,060.00 EUR
    - VAT (19% of 3,060): 581.40 EUR
    - Total: 3,641.40 EUR

    Bug was calculating VAT as 19% of 3,600 = 684.00 EUR (incorrect).
    """
    # Update conference country to Germany
    conference.country = "DE"
    db_session.add(conference)

    # Create VAT rate for Germany (19%)
    vat_rate = VatRateByCountry(
        country_code="DE",
        country_name="Germany",
        standard_rate=Decimal("19.00"),
        tenant_id=None,  # Global rate
    )
    db_session.add(vat_rate)
    await db_session.commit()

    # Create invoice with discount scenario
    # Note: In actual invoice generation, line items have discounts applied individually:
    # - Day 1: 900 - 180 = 720
    # - Day 2: 900 - 180 = 720
    # - Day 3: 900 - 180 = 720
    # - Subtotal: 720 + 720 + 720 = 2160 (sum of discounted line item totals)
    # Actually, let's use the correct values from test description:
    # - Day 1: 900 - 180 = 720
    # - Day 2: 900 - 180 = 720
    # - Day 3: 1800 - 180 = 1620
    # - Subtotal: 720 + 720 + 1620 = 3060
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        template_type="bank_transfer",
        status="draft",
        recipient_source_type="registration",
        recipient_source_id=uuid.uuid4(),
        recipient_name="Test Company GmbH",
        recipient_email="test@example.de",
        recipient_country="DE",  # Domestic B2C (will charge conference VAT)
        recipient_vat_number=None,  # B2C customer
        issue_date=date(2026, 3, 15),
        due_date=date(2026, 4, 15),
        subtotal=Decimal("3060.00"),  # Sum of line item totals AFTER discount (720+720+1620)
        discount_amount=Decimal("540.00"),  # Total discount (informational only - 180*3)
        currency="EUR",
        attendance_type="in_person",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    tax_rate, tax_amount, notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # Verify VAT is calculated on subtotal (which already includes discounts)
    # Expected VAT: 3060 * 0.19 = 581.40
    assert tax_rate == Decimal("19.00")
    assert tax_amount == Decimal("581.40")
    assert notes_text is None  # Domestic B2C, no special notes

    # Verify total would be correct
    # Note: discount_amount is informational - discount already applied in subtotal
    discounted_subtotal = invoice.subtotal  # Already discounted!
    total = discounted_subtotal + tax_amount
    assert total == Decimal("3641.40")  # NOT 3744.00


@pytest.mark.asyncio
async def test_vat_with_no_discount(db_session, tenant, conference):
    """Test that VAT calculation still works correctly when there's no discount."""
    # Update conference country to Germany
    conference.country = "DE"
    db_session.add(conference)

    # Create VAT rate for Germany
    vat_rate = VatRateByCountry(
        country_code="DE",
        country_name="Germany",
        standard_rate=Decimal("19.00"),
        tenant_id=None,
    )
    db_session.add(vat_rate)
    await db_session.commit()

    # Create invoice WITHOUT discount
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        template_type="bank_transfer",
        status="draft",
        recipient_source_type="registration",
        recipient_source_id=uuid.uuid4(),
        recipient_name="Test Company",
        recipient_email="test@example.de",
        recipient_country="DE",
        recipient_vat_number=None,
        issue_date=date(2026, 3, 15),
        due_date=date(2026, 4, 15),
        subtotal=Decimal("1000.00"),
        discount_amount=None,  # No discount
        currency="EUR",
        attendance_type="in_person",
    )
    db_session.add(invoice)
    await db_session.commit()

    # Calculate VAT
    tax_rate, tax_amount, _notes_text = await calculate_vat_for_invoice(invoice, conference, db_session)

    # VAT should be 19% of 1000 = 190
    assert tax_rate == Decimal("19.00")
    assert tax_amount == Decimal("190.00")
