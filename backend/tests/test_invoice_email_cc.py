"""Tests for the invoice/credit-note CC wiring introduced alongside
``tenants.accounting_email``.

These tests mock Resend + the PDF renderer + template rendering so they
exercise only the CC list construction and the ``InvoiceSendConfigurationError``
guard in ``send_invoice_email``. PDF content + template rendering are
covered in ``test_invoice_email_helpers.py`` / template tests.
"""

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvoiceSendConfigurationError
from app.core.invoice.email import send_invoice_email, send_replacement_invoice_emails
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.tenant import Tenant

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _RenderedStub:
    """Stand-in for ``render_email``'s return shape."""

    subject = "Test Subject"
    body_html = "<p>Body</p>"
    body_text = "Body"


def _patch_email_internals() -> list:
    """Patches that silence the heavy work done inside ``send_invoice_email``.

    Returns the entered patchers so callers can stack them into an
    ``ExitStack`` if they prefer; callers in this file just use them as
    context managers individually.
    """
    return [
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
    ]


@pytest_asyncio.fixture
async def tenant_with_accounting_email(db_session: AsyncSession, tenant: Tenant) -> Tenant:
    tenant.accounting_email = "finance@example.com"
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


# ---------------------------------------------------------------------------
# CC construction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_conference_invoice_cc_includes_accounting_and_contact(
    db_session: AsyncSession,
    tenant_with_accounting_email: Tenant,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """CC list contains both tenant accounting_email and conference contact_email."""
    conference.contact_email = "conference-ops@example.com"
    await db_session.commit()
    await db_session.refresh(conference)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        captured["to"] = kwargs.get("to")
        return True

    with (
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
        patch("app.core.invoice.email.send_email", side_effect=fake_send_email),
    ):
        result = await send_invoice_email(db=db_session, invoice=invoice, conference=conference)

    assert result is True
    assert captured["to"] == "billing@testcompany.com"
    assert captured["cc"] == ["finance@example.com", "conference-ops@example.com"]


@pytest.mark.asyncio
async def test_conference_invoice_cc_only_accounting_when_contact_missing(
    db_session: AsyncSession,
    tenant_with_accounting_email: Tenant,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """With ``contact_email`` unset, CC contains only the accounting address."""
    conference.contact_email = None
    await db_session.commit()
    await db_session.refresh(conference)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        return True

    with (
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
        patch("app.core.invoice.email.send_email", side_effect=fake_send_email),
    ):
        await send_invoice_email(db=db_session, invoice=invoice, conference=conference)

    assert captured["cc"] == ["finance@example.com"]


@pytest.mark.asyncio
async def test_conference_invoice_cc_dedupes_contact_equal_to_accounting(
    db_session: AsyncSession,
    tenant_with_accounting_email: Tenant,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """If conference.contact_email == tenant.accounting_email, CC holds one entry."""
    conference.contact_email = "finance@example.com"  # same as accounting
    await db_session.commit()
    await db_session.refresh(conference)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        return True

    with (
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
        patch("app.core.invoice.email.send_email", side_effect=fake_send_email),
    ):
        await send_invoice_email(db=db_session, invoice=invoice, conference=conference)

    assert captured["cc"] == ["finance@example.com"]


@pytest.mark.asyncio
async def test_conference_invoice_cc_excludes_contact_equal_to_recipient(
    db_session: AsyncSession,
    tenant_with_accounting_email: Tenant,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """Don't CC the same address we are sending TO — it creates duplicate inbox entries."""
    conference.contact_email = "billing@testcompany.com"  # same as invoice.recipient_email
    await db_session.commit()
    await db_session.refresh(conference)

    captured: dict = {}

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured["cc"] = kwargs.get("cc")
        return True

    with (
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
        patch("app.core.invoice.email.send_email", side_effect=fake_send_email),
    ):
        await send_invoice_email(db=db_session, invoice=invoice, conference=conference)

    assert captured["cc"] == ["finance@example.com"]


@pytest.mark.asyncio
async def test_conference_invoice_missing_accounting_email_raises(
    db_session: AsyncSession,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """Without ``accounting_email`` configured, the send raises 422-mapped error."""
    # No tenant_with_accounting_email fixture -> tenant.accounting_email is None
    with pytest.raises(InvoiceSendConfigurationError):
        await send_invoice_email(db=db_session, invoice=invoice, conference=conference)


@pytest.mark.asyncio
async def test_credit_note_replacement_sends_both_with_cc(
    db_session: AsyncSession,
    tenant_with_accounting_email: Tenant,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """``send_replacement_invoice_emails`` CCs both the credit note and the new invoice."""
    from datetime import date, timedelta

    today = date.today()
    credit_note = Invoice(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number="CN-TEST-001",
        template_type="credit_note",
        status="sent",
        issue_date=today,
        due_date=today + timedelta(days=30),
        recipient_name="Test Company",
        recipient_email="billing@testcompany.com",
        recipient_address_line1="123 Test Street",
        recipient_city="Test City",
        recipient_postal_code="12345",
        recipient_country="DE",
        total=-119.0,
        currency="EUR",
        is_active=True,
        related_invoice_id=invoice.id,
    )
    db_session.add(credit_note)
    await db_session.commit()

    conference.contact_email = "conference-ops@example.com"
    await db_session.commit()

    captured_ccs: list = []

    async def fake_send_email(*args: object, **kwargs: object) -> bool:
        captured_ccs.append(kwargs.get("cc"))
        return True

    with (
        patch("app.core.invoice.email.generate_invoice_pdf", AsyncMock(return_value=b"pdf")),
        patch("app.core.invoice.email.render_email", AsyncMock(return_value=_RenderedStub())),
        patch("app.core.invoice.email.send_email", side_effect=fake_send_email),
    ):
        await send_replacement_invoice_emails(
            db=db_session,
            credit_note=credit_note,
            new_invoice=invoice,
            conference=conference,
        )

    assert len(captured_ccs) == 2
    expected = ["finance@example.com", "conference-ops@example.com"]
    assert captured_ccs[0] == expected
    assert captured_ccs[1] == expected


@pytest.mark.asyncio
async def test_credit_note_replacement_missing_accounting_raises(
    db_session: AsyncSession,
    conference: Conference,
    invoice: Invoice,
) -> None:
    """Missing accounting_email short-circuits the whole replacement flow with 422."""
    credit_note = Invoice(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number="CN-TEST-002",
        template_type="credit_note",
        status="sent",
        recipient_name="Test Company",
        recipient_email="billing@testcompany.com",
        recipient_address_line1="123 Test Street",
        recipient_city="Test City",
        recipient_postal_code="12345",
        recipient_country="DE",
        total=-119.0,
        currency="EUR",
        is_active=True,
        related_invoice_id=invoice.id,
    )
    db_session.add(credit_note)
    await db_session.commit()

    with pytest.raises(InvoiceSendConfigurationError):
        await send_replacement_invoice_emails(
            db=db_session,
            credit_note=credit_note,
            new_invoice=invoice,
            conference=conference,
        )
