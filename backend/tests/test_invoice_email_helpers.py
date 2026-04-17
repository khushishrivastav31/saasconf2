"""Tests for invoice email helper functions in app/core/invoice_email.py."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _make_invoice(
    *,
    invoice_number: str = "INV-2026-001",
    template_type: str = "invoice",
    recipient_email: str | None = "billing@example.com",
    zugferd_enabled: bool = False,
) -> MagicMock:
    """Create a mock Invoice with sensible defaults."""
    invoice = MagicMock()
    invoice.id = "fake-invoice-id"
    invoice.invoice_number = invoice_number
    invoice.template_type = template_type
    invoice.recipient_email = recipient_email

    # conference.settings is a plain dict (JSONB column)
    conference = MagicMock()
    conference.settings = {
        "zugferd_settings": {"enabled": zugferd_enabled},
    }
    invoice.conference = conference
    return invoice


# ---------------------------------------------------------------------------
# build_pdf_attachment
# ---------------------------------------------------------------------------

class TestBuildPdfAttachment:
    """Tests for build_pdf_attachment()."""

    def test_invoice_filename(self) -> None:
        from app.core.invoice_email import build_pdf_attachment

        invoice = _make_invoice(invoice_number="INV-2026-042")
        result = build_pdf_attachment(b"pdf-bytes", invoice)

        assert result["filename"] == "invoice_INV-2026-042.pdf"

    def test_credit_note_filename(self) -> None:
        from app.core.invoice_email import build_pdf_attachment

        invoice = _make_invoice(
            invoice_number="CN-2026-007",
            template_type="credit_note",
        )
        result = build_pdf_attachment(b"pdf-bytes", invoice)

        assert result["filename"] == "credit_note_CN-2026-007.pdf"

    def test_zugferd_prefix(self) -> None:
        from app.core.invoice_email import build_pdf_attachment

        invoice = _make_invoice(
            invoice_number="INV-2026-001",
            zugferd_enabled=True,
        )
        result = build_pdf_attachment(b"pdf-bytes", invoice)

        assert result["filename"].startswith("zugferd_invoice_")
        assert result["filename"] == "zugferd_invoice_INV-2026-001.pdf"

    def test_zugferd_credit_note_prefix(self) -> None:
        from app.core.invoice_email import build_pdf_attachment

        invoice = _make_invoice(
            invoice_number="CN-001",
            template_type="credit_note",
            zugferd_enabled=True,
        )
        result = build_pdf_attachment(b"pdf-bytes", invoice)

        assert result["filename"] == "zugferd_credit_note_CN-001.pdf"

    def test_base64_content(self) -> None:
        from app.core.invoice_email import build_pdf_attachment

        raw = b"Hello, this is a fake PDF"
        invoice = _make_invoice()
        result = build_pdf_attachment(raw, invoice)

        decoded = base64.b64decode(result["content"])
        assert decoded == raw


# ---------------------------------------------------------------------------
# build_invoice_email_html
# ---------------------------------------------------------------------------

class TestBuildInvoiceEmailHtml:
    """Tests for build_invoice_email_html()."""

    def test_default_message(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        invoice = _make_invoice(invoice_number="INV-100")
        html = build_invoice_email_html(invoice)

        assert "Please find attached invoice INV-100." in html
        assert html.startswith("<p>")

    def test_credit_note_message(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        invoice = _make_invoice(
            invoice_number="CN-100",
            template_type="credit_note",
        )
        html = build_invoice_email_html(invoice)

        assert "credit note" in html
        assert "CN-100" in html

    def test_custom_message(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        invoice = _make_invoice()
        html = build_invoice_email_html(invoice, custom_message="Thanks for registering!")

        assert "<p>Thanks for registering!</p>" in html
        # Default message should NOT appear
        assert "Please find attached" not in html

    def test_with_payment_link(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        invoice = _make_invoice()
        html = build_invoice_email_html(
            invoice,
            payment_link_url="https://pay.stripe.com/abc123",
        )

        assert "Pay Online" in html
        assert "https://pay.stripe.com/abc123" in html

    def test_payment_link_contains_url(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        url = "https://checkout.stripe.com/c/pay_xyz"
        invoice = _make_invoice()
        html = build_invoice_email_html(invoice, payment_link_url=url)

        assert f'href="{url}"' in html

    def test_no_payment_link_by_default(self) -> None:
        from app.core.invoice_email import build_invoice_email_html

        invoice = _make_invoice()
        html = build_invoice_email_html(invoice)

        assert "Pay Online" not in html


# ---------------------------------------------------------------------------
# send_invoice_email — guard clause only
# ---------------------------------------------------------------------------

class TestSendInvoiceEmail:
    """Test the guard clause in send_invoice_email (no recipient)."""

    @pytest.mark.asyncio
    async def test_skips_no_recipient(self) -> None:
        from app.core.invoice_email import send_invoice_email

        invoice = _make_invoice(recipient_email=None)
        conference = MagicMock()
        db = AsyncMock()

        with (
            patch("app.core.invoice.email.generate_invoice_pdf") as mock_pdf,
            patch("app.core.invoice.email.send_email") as mock_send,
        ):
            result = await send_invoice_email(db, invoice, conference)

        assert result is False
        mock_pdf.assert_not_called()
        mock_send.assert_not_called()
