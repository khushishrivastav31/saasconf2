"""Tests for registration email helper guard clauses in app/core/email/registrations.py."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# send_registration_invoice_email — guard clause
# ---------------------------------------------------------------------------


class TestSendRegistrationInvoiceEmail:
    """Test that send_registration_invoice_email returns False when no recipient."""

    @pytest.mark.asyncio
    async def test_returns_false_no_recipient(self) -> None:
        from app.core.registration_emails import send_registration_invoice_email

        invoice = MagicMock()
        invoice.id = "fake-id"
        invoice.recipient_email = None
        # read_pii() prefers *_encrypted; force plaintext fallback for mocks.
        invoice.recipient_email_encrypted = None

        conference = MagicMock()
        db = AsyncMock()

        with (
            patch("app.core.email.registrations.generate_invoice_pdf") as mock_pdf,
            patch("app.core.email.registrations.send_email") as mock_send,
        ):
            result = await send_registration_invoice_email(db, invoice, conference)

        assert result is False
        mock_pdf.assert_not_called()
        mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# send_attendee_welcome_email — guard clause
# ---------------------------------------------------------------------------


class TestSendAttendeeWelcomeEmail:
    """Test that send_attendee_welcome_email returns False when no email."""

    @pytest.mark.asyncio
    async def test_returns_false_no_email(self) -> None:
        from app.core.registration_emails import send_attendee_welcome_email

        registration = MagicMock()
        registration.id = "fake-reg-id"
        registration.email = None

        conference = MagicMock()
        db = AsyncMock()

        with (
            patch("app.core.email.registrations.send_email") as mock_send,
            patch("app.core.email.registrations.render_email") as mock_render,
        ):
            result = await send_attendee_welcome_email(db, registration, conference, password_setup_token="tok123")

        assert result is False
        mock_send.assert_not_called()
        mock_render.assert_not_called()
