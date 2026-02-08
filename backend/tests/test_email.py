"""Unit tests for the email module."""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault(
    "JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars"
)
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from unittest.mock import MagicMock, patch

import pytest

from app.core import email as email_module
from app.core.email import (
    _get_resend,
    _log_email,
    send_cospeaker_invitation_email,
    send_email,
    send_password_reset_email,
    send_verification_email,
)


# ---------------------------------------------------------------------------
# _get_resend tests
# ---------------------------------------------------------------------------


class TestGetResend:
    """Tests for the _get_resend helper function."""

    def test_get_resend_returns_none_when_no_api_key(self):
        """Returns None when RESEND_API_KEY is not set."""
        # Reset the global client
        email_module._resend_client = None

        with patch("app.core.email.get_settings") as mock_settings:
            mock_settings.return_value.RESEND_API_KEY = None
            result = _get_resend()
            assert result is None

    def test_get_resend_initializes_client_with_api_key(self):
        """Initializes and returns resend client when API key is set."""
        # Reset the global client
        email_module._resend_client = None

        with patch("app.core.email.get_settings") as mock_settings:
            mock_settings.return_value.RESEND_API_KEY = "test-api-key"

            with patch.dict("sys.modules", {"resend": MagicMock()}):
                import sys
                mock_resend = sys.modules["resend"]

                with patch("app.core.email._resend_client", None):
                    # This will import resend and set the api_key
                    result = _get_resend()
                    # Result should be the resend module (mocked)
                    assert result is not None

    def test_get_resend_returns_cached_client(self):
        """Returns the cached client on subsequent calls."""
        mock_client = MagicMock()
        email_module._resend_client = mock_client

        with patch("app.core.email.get_settings") as mock_settings:
            mock_settings.return_value.RESEND_API_KEY = "test-api-key"
            result = _get_resend()
            assert result is mock_client

        # Clean up
        email_module._resend_client = None


# ---------------------------------------------------------------------------
# _log_email tests
# ---------------------------------------------------------------------------


class TestLogEmail:
    """Tests for the _log_email helper function."""

    def test_log_email_logs_to_logger(self, caplog):
        """Logs email details to the logger."""
        import logging

        with caplog.at_level(logging.INFO):
            _log_email("test@example.com", "Test Subject", "Test body content")

        assert "To: test@example.com" in caplog.text
        assert "Subject: Test Subject" in caplog.text
        assert "Test body content" in caplog.text

    def test_log_email_prints_to_console(self, capsys):
        """Prints email details to stdout."""
        _log_email("user@test.com", "My Subject", "Email body here")

        captured = capsys.readouterr()
        assert "EMAIL (development mode)" in captured.out
        assert "To: user@test.com" in captured.out
        assert "Subject: My Subject" in captured.out


# ---------------------------------------------------------------------------
# send_email tests
# ---------------------------------------------------------------------------


class TestSendEmail:
    """Tests for the send_email function."""

    @pytest.mark.asyncio
    async def test_send_email_falls_back_to_logging_when_no_resend(self, capsys):
        """Falls back to console logging when Resend is not configured."""
        email_module._resend_client = None

        with patch("app.core.email._get_resend", return_value=None):
            result = await send_email(
                to="test@example.com",
                subject="Test Email",
                html="<p>Hello</p>",
                text="Hello",
            )

        assert result is True
        captured = capsys.readouterr()
        assert "To: test@example.com" in captured.out

    @pytest.mark.asyncio
    async def test_send_email_uses_text_when_no_html_fallback(self, capsys):
        """Uses text body for logging when text is provided."""
        with patch("app.core.email._get_resend", return_value=None):
            result = await send_email(
                to="user@example.com",
                subject="Plain Text",
                html="<p>HTML content</p>",
                text="Plain text content",
            )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_email_uses_html_when_no_text(self, capsys):
        """Uses html body for logging when text is None."""
        with patch("app.core.email._get_resend", return_value=None):
            result = await send_email(
                to="user@example.com",
                subject="HTML Only",
                html="<p>HTML content</p>",
                text=None,
            )

        assert result is True

    @pytest.mark.asyncio
    async def test_send_email_success_with_resend(self):
        """Successfully sends email via Resend."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": "email-123"}

        with patch("app.core.email._get_resend", return_value=mock_resend):
            with patch("app.core.email.get_settings") as mock_settings:
                mock_settings.return_value.RESEND_FROM_NAME = "SaaSConf"
                mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@saasconf.com"

                result = await send_email(
                    to="recipient@example.com",
                    subject="Test Subject",
                    html="<p>Test HTML</p>",
                    text="Test text",
                )

        assert result is True
        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        assert call_args["to"] == ["recipient@example.com"]
        assert call_args["subject"] == "Test Subject"

    @pytest.mark.asyncio
    async def test_send_email_returns_false_on_resend_error(self):
        """Returns False when Resend raises an exception."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("API error")

        with patch("app.core.email._get_resend", return_value=mock_resend):
            with patch("app.core.email.get_settings") as mock_settings:
                mock_settings.return_value.RESEND_FROM_NAME = "SaaSConf"
                mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@saasconf.com"

                result = await send_email(
                    to="recipient@example.com",
                    subject="Test",
                    html="<p>Test</p>",
                )

        assert result is False


# ---------------------------------------------------------------------------
# send_verification_email tests
# ---------------------------------------------------------------------------


class TestSendVerificationEmail:
    """Tests for the send_verification_email function."""

    @pytest.mark.asyncio
    async def test_send_verification_email_constructs_correct_url(self):
        """Constructs the verification URL correctly."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_verification_email(
                email="user@example.com",
                token="verification-token-123",
                tenant_slug="acme-corp",
                base_url="https://app.example.com",
            )

        mock_send.assert_called_once()
        # send_email is called with positional args: (to, subject, html, text)
        args = mock_send.call_args[0]
        assert args[0] == "user@example.com"  # to
        assert "Verify your email" in args[1]  # subject
        assert "https://app.example.com/acme-corp/portal/user/verify-email?token=verification-token-123" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_verification_email_uses_default_base_url(self):
        """Uses default base URL when not provided."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_verification_email(
                email="user@example.com",
                token="token-abc",
                tenant_slug="test-tenant",
            )

        args = mock_send.call_args[0]
        assert "http://localhost:3002/test-tenant/portal/user/verify-email?token=token-abc" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_verification_email_includes_text_version(self):
        """Includes a plain text version of the email."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_verification_email(
                email="user@example.com",
                token="token-xyz",
                tenant_slug="my-tenant",
            )

        args = mock_send.call_args[0]
        assert args[3] is not None  # text
        assert "verify your email" in args[3].lower()


# ---------------------------------------------------------------------------
# send_cospeaker_invitation_email tests
# ---------------------------------------------------------------------------


class TestSendCospeakerInvitationEmail:
    """Tests for the send_cospeaker_invitation_email function."""

    @pytest.mark.asyncio
    async def test_send_cospeaker_invitation_includes_all_details(self):
        """Includes paper title, conference name, and speaker name."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_cospeaker_invitation_email(
                email="cospeaker@example.com",
                paper_title="Machine Learning in Healthcare",
                conference_name="TechConf 2026",
                main_speaker_name="Dr. Jane Smith",
                tenant_slug="techconf",
                base_url="https://techconf.example.com",
            )

        mock_send.assert_called_once()
        # send_email is called with positional args: (to, subject, html, text)
        args = mock_send.call_args[0]

        assert args[0] == "cospeaker@example.com"  # to
        assert "Machine Learning in Healthcare" in args[1]  # subject
        assert "Machine Learning in Healthcare" in args[2]  # html
        assert "TechConf 2026" in args[2]  # html
        assert "Dr. Jane Smith" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_cospeaker_invitation_constructs_portal_url(self):
        """Constructs the portal invitations URL correctly."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_cospeaker_invitation_email(
                email="cospeaker@example.com",
                paper_title="Test Paper",
                conference_name="Test Conf",
                main_speaker_name="John Doe",
                tenant_slug="my-tenant",
                base_url="https://app.test.com",
            )

        args = mock_send.call_args[0]
        assert "https://app.test.com/my-tenant/portal/invitations" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_cospeaker_invitation_includes_text_version(self):
        """Includes a plain text version of the email."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_cospeaker_invitation_email(
                email="cospeaker@example.com",
                paper_title="Test Paper",
                conference_name="Test Conf",
                main_speaker_name="John Doe",
                tenant_slug="test-tenant",
            )

        args = mock_send.call_args[0]
        assert args[3] is not None  # text
        assert "John Doe" in args[3]
        assert "Test Paper" in args[3]


# ---------------------------------------------------------------------------
# send_password_reset_email tests
# ---------------------------------------------------------------------------


class TestSendPasswordResetEmail:
    """Tests for the send_password_reset_email function."""

    @pytest.mark.asyncio
    async def test_send_password_reset_email_constructs_correct_url(self):
        """Constructs the reset URL correctly."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_password_reset_email(
                email="user@example.com",
                token="reset-token-456",
                tenant_slug="corp-tenant",
                base_url="https://corp.example.com",
            )

        mock_send.assert_called_once()
        # send_email is called with positional args: (to, subject, html, text)
        args = mock_send.call_args[0]

        assert args[0] == "user@example.com"  # to
        assert "Reset your password" in args[1]  # subject
        assert "https://corp.example.com/corp-tenant/portal/user/reset-password?token=reset-token-456" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_password_reset_email_uses_default_base_url(self):
        """Uses default base URL when not provided."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_password_reset_email(
                email="user@example.com",
                token="token-abc",
                tenant_slug="default-tenant",
            )

        args = mock_send.call_args[0]
        assert "http://localhost:3002/default-tenant/portal/user/reset-password?token=token-abc" in args[2]  # html

    @pytest.mark.asyncio
    async def test_send_password_reset_email_includes_expiry_notice(self):
        """Includes notice about link expiry."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_password_reset_email(
                email="user@example.com",
                token="token-xyz",
                tenant_slug="my-tenant",
            )

        args = mock_send.call_args[0]
        assert "1 hour" in args[2]  # html
        assert "1 hour" in args[3]  # text

    @pytest.mark.asyncio
    async def test_send_password_reset_email_includes_ignore_notice(self):
        """Includes notice for users who didn't request reset."""
        with patch("app.core.email.send_email") as mock_send:
            mock_send.return_value = True

            await send_password_reset_email(
                email="user@example.com",
                token="token",
                tenant_slug="tenant",
            )

        args = mock_send.call_args[0]
        assert "safely ignore" in args[2].lower()  # html
        assert "safely ignore" in args[3].lower()  # text
