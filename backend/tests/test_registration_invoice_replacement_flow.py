"""End-to-end tests for registration → invoice → replacement/cancellation flow."""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess

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


@pytest.fixture(autouse=True)
def mock_stripe_operations():
    """Mock Stripe operations for all E2E tests."""
    # Mock Stripe refund
    mock_refund_obj = type(
        "Refund",
        (object,),
        {
            "id": "re_test_e2e",
            "status": "succeeded",
            "amount": 200000,  # cents
            "currency": "eur",
            "charge": "ch_test_e2e",
        },
    )()

    with (
        patch("stripe.Refund.create") as mock_refund_create,
        patch("app.core.stripe_helper.get_stripe_client") as mock_get_client,
        patch("app.core.invoice_replacement.create_payment_link", new_callable=AsyncMock) as mock_payment_link,
    ):
        # Configure mocks
        mock_refund_create.return_value = mock_refund_obj
        mock_get_client.return_value = True  # Truthy to indicate Stripe enabled
        mock_payment_link.return_value = (None, "https://buy.stripe.com/test_e2e_link")

        yield {
            "refund": mock_refund_create,
            "get_client": mock_get_client,
            "payment_link": mock_payment_link,
        }


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


# ── End-to-End Tests ───────────────────────────────────────────────────


@pytest.mark.asyncio()
async def test_full_replacement_flow_paid_invoice(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """
    End-to-end test: Register → Invoice → Pay → Replace → Verify.

    Flow:
    1. Create billing profile + registrations
    2. Create paid invoice linked to registrations
    3. Replace invoice with corrected billing info
    4. Verify: old cancelled, new paid, registrations still active
    """
    # Step 0: Create booking option (required FK)
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        name="Conference Pass",
        is_active=True,
    )
    db_session.add(booking_option)
    await db_session.flush()

    # Step 1: Create billing profile with 2 registrations
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        company_name="Original Company Name Ltd",
        street="123 Original Street",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="Jane",
        contact_last_name="Smith",
        contact_phone="+49987654321",
        contact_email="jane@original.example",
        vat_number="DE111222333",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    registrations = []
    for i in range(2):
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=tenant_with_invoices_module.id,
            conference_id=conference.id,
            billing_profile_id=billing_profile.id,
            first_name=f"Person{i + 1}",
            last_name="Attendee",
            email=f"person{i + 1}@example.com",
            booking_option_id=booking_option.id,
            status=RegistrationStatus.PAID,
        )
        db_session.add(reg)
        registrations.append(reg)

    await db_session.commit()

    # Step 2: Create paid invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-E2E-PAID-001",
        template_type="bank_transfer",
        status="paid",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name=billing_profile.company_name or "N/A",
        recipient_email=billing_profile.contact_email,
        recipient_address_line1=billing_profile.street,
        recipient_city=billing_profile.city,
        recipient_postal_code=billing_profile.postal_code,
        recipient_country=billing_profile.country,
        recipient_vat_number=billing_profile.vat_number,
        subtotal=Decimal("3000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("570.00"),
        total=Decimal("3570.00"),
        currency="EUR",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)

    # Step 3: Replace invoice with corrected company name and VAT
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "replace"),
        json={
            "reason": "Company name and VAT number were incorrect",
            "recipient_name": "Corrected Company Name GmbH",
            "recipient_vat_number": "DE999888777",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Step 4: Verify replacement structure
    assert data["old_invoice"]["status"] == "cancelled"
    assert data["old_invoice"]["invoice_number"] == "INV-E2E-PAID-001"
    assert data["old_invoice"]["recipient_name"] == "Original Company Name Ltd"
    assert data["old_invoice"]["recipient_vat_number"] == "DE111222333"

    assert data["credit_note"]["template_type"] == "credit_note"
    assert float(data["credit_note"]["total"]) == -3570.00

    assert data["new_invoice"]["status"] == "paid"  # Inherits paid status
    assert data["new_invoice"]["recipient_name"] == "Corrected Company Name GmbH"
    assert data["new_invoice"]["recipient_vat_number"] == "DE999888777"
    assert float(data["new_invoice"]["total"]) == 3570.00

    # Verify registrations transferred
    assert data["registrations_transferred"] == 2

    # Step 5: Verify registrations still active and linked
    # Use populate_existing to bypass cache and get fresh data from DB
    result_regs = await db_session.execute(
        select(Registration)
        .where(Registration.billing_profile_id == billing_profile.id)
        .execution_options(populate_existing=True)
    )
    fresh_registrations = result_regs.scalars().all()
    assert len(fresh_registrations) == 2
    for reg in fresh_registrations:
        assert reg.status == RegistrationStatus.PAID
        assert reg.billing_profile_id == billing_profile.id

    # Step 6: Verify all 3 invoices exist in DB
    # Use populate_existing to bypass cache and get fresh data from DB
    result = await db_session.execute(
        select(Invoice)
        .where(
            Invoice.conference_id == conference.id,
            Invoice.invoice_number.in_(
                ["INV-E2E-PAID-001", data["credit_note"]["invoice_number"], data["new_invoice"]["invoice_number"]]
            ),  # type: ignore[attr-defined]
        )
        .execution_options(populate_existing=True)
    )
    all_invoices = result.scalars().all()
    assert len(all_invoices) == 3

    # Verify replacement links
    old_invoice_db = next(inv for inv in all_invoices if inv.invoice_number == "INV-E2E-PAID-001")
    new_invoice_db = next(inv for inv in all_invoices if inv.invoice_number == data["new_invoice"]["invoice_number"])

    assert old_invoice_db.replaced_by_invoice_id == new_invoice_db.id
    assert new_invoice_db.replaces_invoice_id == old_invoice_db.id


@pytest.mark.asyncio()
async def test_full_cancellation_flow_with_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_invoices_module: Tenant,
    conference: Conference,
    admin_token_invoices: str,
) -> None:
    """
    End-to-end test: Register → Invoice → Pay → Cancel → Verify no access.

    Flow:
    1. Create billing profile + registrations
    2. Create portal users with conference access
    3. Create paid invoice linked to registrations
    4. Cancel invoice with registration cancellation
    5. Verify: registrations cancelled, conference access removed, user accounts active
    """
    # Step 0: Create booking option (required FK)
    booking_option = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        name="Conference Pass",
        is_active=True,
    )
    db_session.add(booking_option)
    await db_session.flush()

    # Step 1: Create billing profile with 2 registrations
    billing_profile = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        company_name="Test Cancellation Corp",
        street="456 Cancel Street",
        postal_code="80331",
        city="Munich",
        country="DE",
        contact_first_name="Bob",
        contact_last_name="Johnson",
        contact_phone="+49111222333",
        contact_email="bob@cancel.example",
        vat_number="DE555666777",
    )
    db_session.add(billing_profile)
    await db_session.flush()

    registrations = []
    for i in range(2):
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=tenant_with_invoices_module.id,
            conference_id=conference.id,
            billing_profile_id=billing_profile.id,
            first_name=f"Attendee{i + 1}",
            last_name="Cancel",
            email=f"cancel{i + 1}@example.com",
            booking_option_id=booking_option.id,
            status=RegistrationStatus.PAID,
        )
        db_session.add(reg)
        registrations.append(reg)

    await db_session.commit()

    # Step 2: Create portal users with conference access
    portal_users = []
    for reg in registrations:
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant_with_invoices_module.id,
            email=reg.email,
            password_hash=hash_password("testpassword"),
            first_name=reg.first_name,
            last_name=reg.last_name,
            role="user",
            is_active=True,
        )
        db_session.add(user)
        await db_session.flush()

        access = UserConferenceAccess(
            id=uuid.uuid4(),
            user_id=user.id,
            conference_id=conference.id,
            access_level="read_only",
        )
        db_session.add(access)
        portal_users.append(user)

    await db_session.commit()

    # Verify access exists
    result = await db_session.execute(
        select(UserConferenceAccess).where(
            UserConferenceAccess.conference_id == conference.id,
        )
    )
    access_before = result.scalars().all()
    assert len(access_before) == 2

    # Step 3: Create paid invoice
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant_with_invoices_module.id,
        conference_id=conference.id,
        invoice_number="INV-E2E-CANCEL-001",
        template_type="credit_card",
        status="paid",
        issue_date=date(2026, 3, 1),
        due_date=date(2026, 3, 31),
        recipient_source_type="registration",
        recipient_source_id=billing_profile.id,
        recipient_name=billing_profile.company_name or "N/A",
        recipient_email=billing_profile.contact_email,
        recipient_address_line1=billing_profile.street,
        recipient_city=billing_profile.city,
        recipient_postal_code=billing_profile.postal_code,
        recipient_country=billing_profile.country,
        subtotal=Decimal("2500.00"),
        total=Decimal("2500.00"),
        currency="EUR",
        stripe_payment_intent_id="pi_e2e_test",
        is_active=True,
    )
    db_session.add(invoice)
    await db_session.commit()

    # Step 4: Cancel invoice with registration cancellation
    response = await client.post(
        _invoices_url(conference.id, invoice.id, "cancel"),
        json={
            "reason": "Event cancelled - refund issued",
            "cancel_registrations": True,
            "cancellation_email_message": "Unfortunately the event has been cancelled. Full refund processed.",
        },
        headers={"Authorization": f"Bearer {admin_token_invoices}"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify cancellation
    assert data["cancelled_invoice"]["status"] == "cancelled"
    assert data["registrations_cancelled"] == 2
    assert data["access_removed_count"] == 2

    # Step 5: Verify registrations are cancelled
    # Use populate_existing to bypass cache and get fresh data from DB
    result_regs = await db_session.execute(
        select(Registration)
        .where(Registration.billing_profile_id == billing_profile.id)
        .execution_options(populate_existing=True)
    )
    fresh_registrations = result_regs.scalars().all()
    for reg in fresh_registrations:
        assert reg.status == RegistrationStatus.CANCELLED

    # Step 6: Verify conference access removed
    result = await db_session.execute(
        select(UserConferenceAccess)
        .where(UserConferenceAccess.conference_id == conference.id)
        .execution_options(populate_existing=True)
    )
    access_after = result.scalars().all()
    assert len(access_after) == 0

    # Step 7: Verify user accounts still active
    result_users = await db_session.execute(
        select(User).where(User.id.in_([u.id for u in portal_users])).execution_options(populate_existing=True)
    )
    fresh_users = result_users.scalars().all()
    for user in fresh_users:
        assert user.is_active is True

    # Step 8: Verify credit note created
    assert data["credit_note"]["template_type"] == "credit_note"
    assert float(data["credit_note"]["total"]) == -2500.00
