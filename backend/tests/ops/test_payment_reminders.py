"""Tests for the automated payment reminder service (generate_and_send_reminders).

Covers:
- Opt-out conferences are skipped
- Invoices past the first-reminder threshold trigger a reminder
- Existing reminder record prevents a duplicate (unique-constraint guard)
- Paid/cancelled invoices are not reminded
- The HTTP endpoint rejects unauthenticated requests
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.payment_reminder_service import generate_and_send_reminders
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.payment_reminder import PaymentReminder
from app.models.tenant import Tenant


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def conf_reminders_on(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Conference with payment reminders enabled (first_reminder_days=2)."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="ReminderConf",
        abbreviation="RC",
        is_active=True,
        settings={
            "payment_reminders": {
                "payment_reminders_enabled": True,
                "first_reminder_days": 2,
                "second_reminder_days": 17,
                "notify_admin_after_second": False,
            },
            "email_sending_enabled": True,
        },
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


@pytest_asyncio.fixture()
async def conf_reminders_off(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Conference with payment reminders explicitly disabled."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="QuietConf",
        abbreviation="QC",
        is_active=True,
        settings={
            "payment_reminders": {
                "payment_reminders_enabled": False,
                "first_reminder_days": 2,
                "second_reminder_days": 17,
                "notify_admin_after_second": False,
            },
            "email_sending_enabled": True,
        },
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


def _make_invoice(conference: Conference, *, days_ago: int, status: str = "sent") -> Invoice:
    """Return an unsaved Invoice overdue by *days_ago* days."""
    today = date.today()
    return Invoice(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        template_type="bank_transfer",
        status=status,
        issue_date=today - timedelta(days=days_ago + 30),
        due_date=today - timedelta(days=days_ago),
        recipient_name="ACME Corp",
        recipient_email="billing@acme.example.com",
        recipient_address_line1="1 Main St",
        recipient_city="Berlin",
        recipient_postal_code="10115",
        recipient_country="DE",
        subtotal=500.0,
        tax_rate=0.0,
        tax_amount=0.0,
        total=500.0,
        currency="EUR",
        is_active=True,
    )


# ── Unit tests for generate_and_send_reminders ────────────────────────────


@pytest.mark.asyncio
async def test_opt_out_conference_skipped(
    db_session: AsyncSession,
    conf_reminders_off: Conference,
) -> None:
    """generate_and_send_reminders returns zero sent when reminders are disabled."""
    invoice = _make_invoice(conf_reminders_off, days_ago=5)
    db_session.add(invoice)
    await db_session.commit()

    with patch("app.core.payment_reminder_service.send_email", new_callable=AsyncMock) as mock_send:
        result = await generate_and_send_reminders(db_session, conf_reminders_off)

    assert result["sent"] == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_overdue_invoice_gets_first_reminder(
    db_session: AsyncSession,
    conf_reminders_on: Conference,
) -> None:
    """An invoice 2+ days past due triggers a first reminder."""
    invoice = _make_invoice(conf_reminders_on, days_ago=2)
    db_session.add(invoice)
    await db_session.commit()

    with patch("app.core.payment_reminder_service.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        result = await generate_and_send_reminders(db_session, conf_reminders_on)

    assert result["sent"] == 1
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_existing_reminder_prevents_duplicate(
    db_session: AsyncSession,
    conf_reminders_on: Conference,
) -> None:
    """An invoice that already has reminder_number=1 does not get a second one."""
    invoice = _make_invoice(conf_reminders_on, days_ago=3)
    db_session.add(invoice)
    await db_session.flush()

    existing = PaymentReminder(
        id=uuid.uuid4(),
        tenant_id=conf_reminders_on.tenant_id,
        conference_id=conf_reminders_on.id,
        invoice_id=invoice.id,
        reminder_number=1,
        status="sent",
        scheduled_date=invoice.due_date,
        sent_at=datetime.now(UTC),
        recipient_name=invoice.recipient_name,
        recipient_email="billing@acme.example.com",
        invoice_number=invoice.invoice_number,
        invoice_amount="500.00",
        currency="EUR",
    )
    db_session.add(existing)
    await db_session.commit()

    with patch("app.core.payment_reminder_service.send_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = True
        result = await generate_and_send_reminders(db_session, conf_reminders_on)

    assert result["sent"] == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_paid_invoice_not_reminded(
    db_session: AsyncSession,
    conf_reminders_on: Conference,
) -> None:
    """Invoices with status 'paid' are excluded from reminder processing."""
    invoice = _make_invoice(conf_reminders_on, days_ago=5, status="paid")
    db_session.add(invoice)
    await db_session.commit()

    with patch("app.core.payment_reminder_service.send_email", new_callable=AsyncMock) as mock_send:
        result = await generate_and_send_reminders(db_session, conf_reminders_on)

    assert result["sent"] == 0
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_not_yet_due_invoice_not_reminded(
    db_session: AsyncSession,
    conf_reminders_on: Conference,
) -> None:
    """Invoices not yet at their first-reminder threshold are skipped."""
    invoice = _make_invoice(conf_reminders_on, days_ago=0)  # due today
    invoice.due_date = date.today() + timedelta(days=5)  # actually future
    db_session.add(invoice)
    await db_session.commit()

    with patch("app.core.payment_reminder_service.send_email", new_callable=AsyncMock) as mock_send:
        result = await generate_and_send_reminders(db_session, conf_reminders_on)

    assert result["sent"] == 0
    mock_send.assert_not_called()


# ── HTTP endpoint auth ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_payment_reminders_endpoint_requires_auth(client: AsyncClient) -> None:
    """POST /ops/send-payment-reminders rejects unauthenticated requests."""
    response = await client.post("/ops/send-payment-reminders")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_payment_reminders_endpoint_rejects_wrong_key(client: AsyncClient) -> None:
    """POST /ops/send-payment-reminders rejects wrong bearer token."""
    response = await client.post(
        "/ops/send-payment-reminders",
        headers={"Authorization": "Bearer not-the-right-key"},
    )
    assert response.status_code == 401
