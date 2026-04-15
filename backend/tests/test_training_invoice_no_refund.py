"""Tests: Replace Invoice and Parking Lot reassignment must NOT trigger Stripe refunds.

When a paid credit card invoice is replaced (billing correction) or the attendee
is reassigned via the parking lot, the payment is transferred to the new invoice.
No Stripe refund should occur — the money stays with us.

Direct cancel endpoint DOES trigger a refund (tested separately).
"""

import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from tests.conftest import _make_token, auth_headers

BASE = "/api/v1/trainings"


# ── Fixtures ──────────────────────────────────────────────────────────────────


async def _enable_trainings(db: AsyncSession, tenant: Tenant) -> None:
    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.commit()


async def _create_training_data(db: AsyncSession, tenant: Tenant) -> dict:
    """Create a training + placement + registration + paid credit card invoice."""
    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Test Training",
        slug="test-training",
        regular_price=Decimal("1000.00"),
    )
    db.add(training)
    await db.flush()

    # Program year
    year = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        year=2026,
    )
    db.add(year)
    await db.flush()

    # Placement
    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 9, 1),
        placement_type="open",
    )
    db.add(placement)
    await db.flush()

    # Second placement (for reassignment target)
    placement2 = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=date(2026, 11, 1),
        placement_type="open",
    )
    db.add(placement2)
    await db.flush()

    # Registration
    registration = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        placement_id=placement.id,
        status="paid",
        contact_first_name="John",
        contact_last_name="Doe",
        contact_email="john@test.com",
        company_name="Doe Corp",
        street="Test Street 1",
        postal_code="12345",
        city="Berlin",
        country="DE",
        payment_method="credit card",
        subtotal=Decimal("1000.00"),
        vat_amount=Decimal("190.00"),
        total=Decimal("1190.00"),
        currency="EUR",
    )
    db.add(registration)
    await db.flush()

    # Registration attendee
    reg_att = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        registration_id=registration.id,
        first_name="John",
        last_name="Doe",
        email="john@test.com",
    )
    db.add(reg_att)
    await db.flush()

    # Paid credit card invoice with Stripe payment intent
    invoice = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        training_registration_id=registration.id,
        invoice_number="TR-TEST-001",
        template_type="credit_card",
        status="paid",
        issue_date=date(2026, 4, 1),
        due_date=date(2026, 5, 1),
        recipient_name="John Doe",
        recipient_email="john@test.com",
        payment_method="credit card",
        stripe_payment_intent_id="pi_test_123456",
        stripe_payment_link_id="plink_test_123",
        line_items=[
            {"description": "Test Training (1 attendee)", "quantity": 1, "unit_price": "1000.00", "total": "1000.00"}
        ],
        subtotal=Decimal("1000.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("190.00"),
        total=Decimal("1190.00"),
        currency="EUR",
    )
    db.add(invoice)
    await db.commit()

    return {
        "training": training,
        "placement": placement,
        "placement2": placement2,
        "registration": registration,
        "reg_att": reg_att,
        "invoice": invoice,
    }


# ── Tests: Replace Invoice does NOT refund Stripe ─────────────────────────────


@pytest.mark.asyncio
async def test_replace_paid_cc_invoice_no_stripe_refund(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
):
    """Replacing a paid credit card invoice must NOT trigger a Stripe refund."""
    await _enable_trainings(db_session, tenant)
    data = await _create_training_data(db_session, tenant)

    token = _make_token(tenant_admin_user, modules=["trainings"])

    with (
        patch("app.core.training_stripe_helper.refund_training_payment", new_callable=AsyncMock) as mock_refund,
        patch(
            "app.api.v1.trainings.invoice_replace.deactivate_training_payment_link", new_callable=AsyncMock
        ) as mock_deactivate,
        patch(
            "app.api.v1.trainings.invoice_replace.create_training_payment_link", new_callable=AsyncMock
        ) as mock_create_link,
    ):
        response = await client.post(
            f"{BASE}/invoices/{data['invoice'].id}/replace",
            json={
                "reason": "Wrong company name",
                "recipient_name": "Corrected Name GmbH",
            },
            headers=auth_headers(token),
        )

        assert response.status_code == 200, response.text
        result = response.json()

        # Old invoice cancelled
        assert result["cancelled_invoice"]["status"] == "cancelled"

        # New invoice inherits paid status
        assert result["new_invoice"]["status"] == "paid"
        assert result["new_invoice"]["invoice_number"] is not None

        # CRITICAL: Stripe refund must NOT have been called
        mock_refund.assert_not_called()

        # Stripe payment link deactivation should NOT happen for paid invoices
        # (deactivate is only for sent/overdue)
        mock_deactivate.assert_not_called()

        # No new payment link needed (already paid)
        mock_create_link.assert_not_called()


@pytest.mark.asyncio
async def test_replace_sent_cc_invoice_no_stripe_refund(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
):
    """Replacing a sent credit card invoice must NOT trigger a Stripe refund."""
    await _enable_trainings(db_session, tenant)
    data = await _create_training_data(db_session, tenant)

    # Change invoice to "sent" (not paid)
    data["invoice"].status = "sent"
    await db_session.commit()

    token = _make_token(tenant_admin_user, modules=["trainings"])

    with (
        patch("app.core.training_stripe_helper.refund_training_payment", new_callable=AsyncMock) as mock_refund,
        patch(
            "app.api.v1.trainings.invoice_replace.deactivate_training_payment_link", new_callable=AsyncMock
        ) as mock_deactivate,
        patch(
            "app.api.v1.trainings.invoice_replace.create_training_payment_link",
            new_callable=AsyncMock,
            return_value=("plink_new", "https://pay.stripe.com/new"),
        ) as mock_create_link,
    ):
        response = await client.post(
            f"{BASE}/invoices/{data['invoice'].id}/replace",
            json={
                "reason": "Wrong VAT number",
                "recipient_vat_number": "DE123456789",
            },
            headers=auth_headers(token),
        )

        assert response.status_code == 200, response.text
        result = response.json()

        # New invoice is sent (not paid)
        assert result["new_invoice"]["status"] == "sent"

        # CRITICAL: No Stripe refund
        mock_refund.assert_not_called()

        # Old payment link should be deactivated (it's sent, not paid)
        mock_deactivate.assert_called_once()

        # New payment link should be created (sent + credit_card)
        mock_create_link.assert_called_once()


# ── Tests: Parking Lot reassignment does NOT refund Stripe ────────────────────


@pytest.mark.asyncio
async def test_reassign_from_parking_lot_no_stripe_refund(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
):
    """Reassigning a parked attendee must NOT trigger a Stripe refund on the old paid invoice."""
    await _enable_trainings(db_session, tenant)
    data = await _create_training_data(db_session, tenant)

    # Create central attendee + park them
    central_att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="John",
        last_name="Doe",
        email="john@test.com",
        status="parked",
    )
    db_session.add(central_att)
    await db_session.flush()

    # Link reg attendee to central
    data["reg_att"].attendee_id = central_att.id
    await db_session.flush()

    # Create park history event (stores registration_id as source_id)
    park_event = TrainingAttendeeHistory(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        attendee_id=central_att.id,
        event_type="parked",
        placement_id=data["placement"].id,
        source_type="registration",
        source_id=data["registration"].id,
    )
    db_session.add(park_event)

    # Delete the reg attendee (simulating the park action)
    await db_session.delete(data["reg_att"])
    await db_session.commit()

    token = _make_token(tenant_admin_user, modules=["trainings"])

    with (
        patch("app.api.v1.trainings.invoice_operations.refund_training_payment", new_callable=AsyncMock) as mock_refund,
        patch(
            "app.api.v1.trainings.invoice_operations.deactivate_training_payment_link", new_callable=AsyncMock
        ) as mock_deactivate,
        patch("app.core.training_registration_emails.send_training_invoice_email", new_callable=AsyncMock),
    ):
        response = await client.post(
            f"{BASE}/attendees/{central_att.id}/reassign",
            json={"placement_id": str(data["placement2"].id)},
            headers=auth_headers(token),
        )

        assert response.status_code == 200, response.text
        result = response.json()

        # Attendee is now active
        assert result["status"] == "active"

        # CRITICAL: Stripe refund must NOT have been called
        mock_refund.assert_not_called()

        # No payment link deactivation (payment already collected)
        mock_deactivate.assert_not_called()


# ── Test: Direct cancel DOES refund Stripe ────────────────────────────────────


@pytest.mark.asyncio
async def test_direct_cancel_paid_cc_invoice_does_refund(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
):
    """Directly cancelling a paid credit card invoice DOES trigger a Stripe refund."""
    await _enable_trainings(db_session, tenant)
    data = await _create_training_data(db_session, tenant)

    token = _make_token(tenant_admin_user, modules=["trainings"])

    with (
        patch("app.api.v1.trainings.invoice_operations.refund_training_payment", new_callable=AsyncMock) as mock_refund,
        patch(
            "app.api.v1.trainings.invoice_operations.deactivate_training_payment_link", new_callable=AsyncMock
        ) as mock_deactivate,
    ):
        response = await client.post(
            f"{BASE}/invoices/{data['invoice'].id}/cancel",
            headers=auth_headers(token),
        )

        assert response.status_code == 200, response.text
        result = response.json()

        # Invoice cancelled
        assert result["cancelled_invoice"]["status"] == "cancelled"

        # Credit note created
        assert result["credit_note"]["template_type"] == "credit_note"

        # CRITICAL: Stripe refund WAS called (direct cancel of paid CC invoice)
        mock_refund.assert_called_once()

        # Payment link deactivation also called
        mock_deactivate.assert_called_once()


# ── Test: Replace preserves payment intent on new invoice ─────────────────────


@pytest.mark.asyncio
async def test_replace_paid_invoice_transfers_payment_intent(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
):
    """When replacing a paid CC invoice, the Stripe payment_intent_id is copied to the new invoice."""
    await _enable_trainings(db_session, tenant)
    data = await _create_training_data(db_session, tenant)

    token = _make_token(tenant_admin_user, modules=["trainings"])

    with (
        patch("app.core.training_stripe_helper.refund_training_payment", new_callable=AsyncMock),
        patch("app.api.v1.trainings.invoice_replace.deactivate_training_payment_link", new_callable=AsyncMock),
        patch("app.api.v1.trainings.invoice_replace.send_training_invoice_email", new_callable=AsyncMock),
    ):
        response = await client.post(
            f"{BASE}/invoices/{data['invoice'].id}/replace",
            json={"reason": "Billing correction", "recipient_name": "New Name"},
            headers=auth_headers(token),
        )

        assert response.status_code == 200
        new_inv_id = response.json()["new_invoice"]["id"]

        # Verify new invoice has the payment intent copied
        from sqlalchemy import select

        inv_result = await db_session.execute(
            select(TrainingInvoice).where(TrainingInvoice.id == uuid.UUID(new_inv_id))
        )
        new_inv = inv_result.scalar_one()
        assert new_inv.stripe_payment_intent_id == "pi_test_123456"
        assert new_inv.status == "paid"
