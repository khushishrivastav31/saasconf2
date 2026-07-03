"""Unit tests for the email module."""

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core import email as email_module
from app.core.email import (
    _get_resend,
    _log_email,
    _send_with_retry,
    send_email,
    send_email_background,
)
from app.core.email_templates import (
    RenderedEmail,
    build_cospeaker_context,
    build_password_reset_context,
    build_verification_context,
    replace_placeholders,
)

pytestmark = pytest.mark.no_mock_email

# ---------------------------------------------------------------------------
# _get_resend tests
# ---------------------------------------------------------------------------


class TestGetResend:
    """Tests for the _get_resend helper — tenant-key-only path."""

    def test_get_resend_sets_tenant_key(self):
        """Sets api_key to the tenant key."""
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            result = _get_resend(api_key="tenant-key-123")
            assert result is not None
            assert mock_resend.api_key == "tenant-key-123"

    def test_get_resend_overwrites_previous_key(self):
        """Each call sets the key so a stale key never bleeds into the next send."""
        mock_resend = MagicMock()
        with patch.dict("sys.modules", {"resend": mock_resend}):
            _get_resend(api_key="old-key")
            _get_resend(api_key="new-key")
            assert mock_resend.api_key == "new-key"


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

    def test_log_email_prints_to_console(self, caplog):
        """Logs email details via logger."""
        import logging

        with caplog.at_level(logging.INFO):
            _log_email("user@test.com", "My Subject", "Email body here")

        assert "To: user@test.com" in caplog.text
        assert "Subject: My Subject" in caplog.text


# ---------------------------------------------------------------------------
# send_email tests
# ---------------------------------------------------------------------------


class TestSendEmail:
    """Tests for the send_email function."""

    @pytest.mark.asyncio
    async def test_no_mailgun_config_falls_back_to_logging(self, caplog):
        """Falls back to console logging when Mailgun is not configured."""
        import logging

        from app.config import Settings

        no_mail_settings = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            MAILGUN_API_KEY="",
            MAILGUN_DOMAIN="",
        )
        with (
            caplog.at_level(logging.INFO),
            patch("app.core.email.get_settings", return_value=no_mail_settings),
        ):
            result = await send_email(
                to="test@example.com",
                subject="Test Email",
                html="<p>Hello</p>",
                text="Hello",
            )

        assert result is False
        assert "To: test@example.com" in caplog.text

    @pytest.mark.asyncio
    async def test_smtp_route_refused_in_production(self, caplog):
        """SMTP_HOST is a dev-only escape hatch — production must refuse it."""
        import logging

        from app.config import Settings

        prod_settings = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SENTRY_ENVIRONMENT="production",
            SMTP_HOST="evil.example.com",
            MAILGUN_API_KEY="",
            MAILGUN_DOMAIN="",
        )
        with (
            patch("app.core.email.get_settings", return_value=prod_settings),
            caplog.at_level(logging.ERROR),
        ):
            result = await send_email(
                to="user@example.com",
                subject="Should not be sent via SMTP",
                html="<p>x</p>",
                text="x",
            )
        assert result is False
        assert "SMTP_HOST is set in production" in caplog.text

    @pytest.mark.asyncio
    async def test_smtp_host_in_staging_falls_through_to_mailgun(self, caplog):
        """When SMTP_HOST is set in staging, email falls through to Mailgun."""
        import logging

        from app.config import Settings

        staging_settings = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SENTRY_ENVIRONMENT="staging",
            SMTP_HOST="localhost",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        with (
            patch("app.core.email.get_settings", return_value=staging_settings),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
            caplog.at_level(logging.ERROR),
        ):
            result = await send_email(
                to="user@example.com",
                subject="Staging email",
                html="<p>x</p>",
                text="x",
            )

        assert result is True
        assert "SMTP_HOST is set in staging" in caplog.text
        mock_mailgun.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_email_success_with_tenant_resend_key(self):
        """Sends via tenant Resend key when one is configured."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": "email-123"}

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings") as mock_settings,
        ):
            mock_settings.return_value.SMTP_HOST = ""
            mock_settings.return_value.RESEND_FROM_NAME = "SaaSConf"
            mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@saasconf.com"

            result = await send_email(
                to="recipient@example.com",
                subject="Test Subject",
                html="<p>Test HTML</p>",
                text="Test text",
                tenant_api_key="re_valid_tenant_key",
            )

        assert result is True
        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        assert call_args["to"] == ["recipient@example.com"]
        assert call_args["subject"] == "Test Subject"

    @pytest.mark.asyncio
    async def test_invalid_tenant_key_falls_back_to_mailgun(self, caplog):
        """Invalid tenant Resend key triggers Mailgun fallback."""
        import logging

        from app.config import Settings

        settings_with_mailgun = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("API key is invalid")

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_with_mailgun),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
            caplog.at_level(logging.WARNING),
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_bad_key",
            )

        assert result is True
        assert "falling back to Mailgun" in caplog.text
        mock_mailgun.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_resend_domain_not_verified_falls_back_to_mailgun(self):
        """Resend 'domain is not verified' error falls back to Mailgun and returns True."""
        from app.config import Settings

        settings_with_mailgun = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception(
            "The sender domain agiletestingdays.com is not verified."
        )

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_with_mailgun),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_valid_key",
            )

        assert result is True
        mock_mailgun.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_any_resend_error_falls_back_to_mailgun(self):
        """Any Resend error (rate limit, transient, etc.) falls back to Mailgun."""
        from app.config import Settings

        settings_with_mailgun = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("Rate limit exceeded")

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_with_mailgun),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_valid_key",
            )

        assert result is True
        mock_mailgun.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_sentry_capture_on_resend_failure(self):
        """A Resend failure triggers one Sentry capture_exception with email.provider=resend."""
        from app.config import Settings

        settings_with_sentry = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
            SENTRY_DSN="https://fake@sentry.io/123",
        )
        mock_resend = MagicMock()
        resend_exc = Exception("The sender domain is not verified.")
        mock_resend.Emails.send.side_effect = resend_exc

        mock_sentry = MagicMock()
        mock_scope = MagicMock()
        mock_sentry.push_scope.return_value.__enter__ = MagicMock(return_value=mock_scope)
        mock_sentry.push_scope.return_value.__exit__ = MagicMock(return_value=False)

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_with_sentry),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock),
            patch.dict("sys.modules", {"sentry_sdk": mock_sentry}),
        ):
            result = await send_email(
                to="speaker@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_key",
                email_type="speaker_notification",
            )

        assert result is True
        mock_sentry.capture_exception.assert_called_once_with(resend_exc)
        mock_scope.set_tag.assert_any_call("email.provider", "resend")

    @pytest.mark.asyncio
    async def test_resend_fails_mailgun_fails_both_reported(self):
        """When both Resend and Mailgun fail, returns False with a failed email_logs row."""
        from app.config import Settings
        from unittest.mock import AsyncMock as AM

        settings_v = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
            SENTRY_DSN="https://fake@sentry.io/123",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("Resend error")
        mock_sentry = MagicMock()
        mock_scope = MagicMock()
        mock_sentry.push_scope.return_value.__enter__ = MagicMock(return_value=mock_scope)
        mock_sentry.push_scope.return_value.__exit__ = MagicMock(return_value=False)

        mock_db = AsyncMock()
        mock_db.execute = AM()
        mock_db.add = MagicMock()
        mock_db.flush = AM()

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_v),
            patch(
                "app.core.email._send_via_mailgun",
                new_callable=AsyncMock,
                side_effect=Exception("Mailgun error"),
            ),
            patch("app.core.email._log_email_failure", new_callable=AsyncMock) as mock_log,
            patch.dict("sys.modules", {"sentry_sdk": mock_sentry}),
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_key",
                db=mock_db,
                email_type="speaker_notification",
            )

        assert result is False
        mock_log.assert_awaited_once()
        assert mock_log.call_args[1]["status"] == "failed"
        # Sentry should have been called for at least the Mailgun failure
        assert mock_sentry.capture_exception.call_count >= 1

    @pytest.mark.asyncio
    async def test_resend_fails_mailgun_not_configured(self):
        """Resend fails + no Mailgun config → returns False, not_configured email_logs."""
        from app.config import Settings

        settings_no_mailgun = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="",
            MAILGUN_DOMAIN="",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("Resend error")

        mock_db = AsyncMock()

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_no_mailgun),
            patch("app.core.email._log_email_failure", new_callable=AsyncMock) as mock_log,
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_key",
                db=mock_db,
                email_type="general",
            )

        assert result is False
        mock_log.assert_awaited_once()
        assert mock_log.call_args[1]["status"] == "not_configured"

    @pytest.mark.asyncio
    async def test_no_sentry_dsn_no_capture_fallback_still_works(self):
        """When SENTRY_DSN is unset, _capture_email_error is a no-op and fallback still works."""
        from app.config import Settings

        settings_no_sentry = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@example.com",
            RESEND_FROM_NAME="SaaSConf",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
            SENTRY_DSN="",
        )
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("Resend domain not verified")
        mock_sentry = MagicMock()

        with (
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email.get_settings", return_value=settings_no_sentry),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
            patch.dict("sys.modules", {"sentry_sdk": mock_sentry}),
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
                tenant_api_key="re_key",
            )

        assert result is True
        mock_mailgun.assert_awaited_once()
        mock_sentry.capture_exception.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_tenant_key_sends_via_mailgun_directly(self):
        """When no tenant key is set, Mailgun is used without trying Resend."""
        from app.config import Settings

        settings_with_mailgun = Settings(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@example.com",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )

        with (
            patch("app.core.email.get_settings", return_value=settings_with_mailgun),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
            patch("app.core.email._get_resend") as mock_get_resend,
        ):
            result = await send_email(
                to="recipient@example.com",
                subject="Test",
                html="<p>x</p>",
            )

        assert result is True
        mock_mailgun.assert_awaited_once()
        mock_get_resend.assert_not_called()


class TestPlatformResendFallback:
    """Tests for the platform-level Resend key (MAIN-13423).

    When no per-tenant key is available (e.g. the super-admin tenant-creation
    welcome email, sent before the tenant configures its own key), a configured
    platform ``RESEND_API_KEY`` should send the email from the platform's own
    verified sender before falling back to Mailgun.
    """

    def _settings(self, **overrides):
        from app.config import Settings

        base = dict(
            JWT_SECRET_KEY="test-secret-key-for-unit-tests-minimum-32-chars",
            SUPER_ADMIN_PASSWORD="testpassword123",
            SMTP_HOST="",
            RESEND_FROM_EMAIL="noreply@platform.example",
            RESEND_FROM_NAME="SaaSConf",
        )
        base.update(overrides)
        return Settings(**base)

    @pytest.mark.asyncio
    async def test_platform_resend_used_when_no_tenant_key(self):
        """With RESEND_API_KEY set and no tenant key, send via the platform key."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": "email-1"}

        settings = self._settings(
            RESEND_API_KEY="re_platform_key",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
        )
        with (
            patch("app.core.email.get_settings", return_value=settings),
            patch("app.core.email._get_resend", return_value=mock_resend) as mock_get_resend,
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
        ):
            result = await send_email(
                to="admin@newtenant.example",
                subject="Welcome",
                html="<p>Welcome</p>",
                text="Welcome",
            )

        assert result is True
        mock_get_resend.assert_called_once_with(api_key="re_platform_key")
        mock_resend.Emails.send.assert_called_once()
        mock_mailgun.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_platform_resend_ignores_caller_from_email(self):
        """The platform send must use the platform verified sender, not an
        unverified tenant domain passed by the caller."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": "email-2"}

        settings = self._settings(RESEND_API_KEY="re_platform_key")
        with (
            patch("app.core.email.get_settings", return_value=settings),
            patch("app.core.email._get_resend", return_value=mock_resend),
        ):
            result = await send_email(
                to="admin@newtenant.example",
                subject="Welcome",
                html="<p>Welcome</p>",
                from_email="noreply@newtenant.example",  # unverified tenant domain
            )

        assert result is True
        payload = mock_resend.Emails.send.call_args[0][0]
        assert payload["from"] == "SaaSConf <noreply@platform.example>"
        assert "newtenant.example" not in payload["from"]

    @pytest.mark.asyncio
    async def test_platform_resend_failure_falls_back_to_mailgun(self):
        """When the platform Resend send raises, fall through to Mailgun."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("platform resend down")

        settings = self._settings(
            RESEND_API_KEY="re_platform_key",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@platform.example",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        with (
            patch("app.core.email.get_settings", return_value=settings),
            patch("app.core.email._get_resend", return_value=mock_resend),
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
        ):
            result = await send_email(
                to="admin@newtenant.example",
                subject="Welcome",
                html="<p>Welcome</p>",
            )

        assert result is True
        mock_mailgun.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_platform_resend_unset_skips_to_mailgun(self):
        """With RESEND_API_KEY unset, the platform step is skipped (regression)."""
        settings = self._settings(
            RESEND_API_KEY="",
            MAILGUN_API_KEY="key-test",
            MAILGUN_DOMAIN="mg.example.com",
            MAILGUN_FROM_EMAIL="noreply@platform.example",
            MAILGUN_FROM_NAME="SaaSConf",
            MAILGUN_BASE_URL="https://api.mailgun.net",
        )
        with (
            patch("app.core.email.get_settings", return_value=settings),
            patch("app.core.email._get_resend") as mock_get_resend,
            patch("app.core.email._send_via_mailgun", new_callable=AsyncMock) as mock_mailgun,
        ):
            result = await send_email(
                to="admin@newtenant.example",
                subject="Welcome",
                html="<p>Welcome</p>",
            )

        assert result is True
        mock_get_resend.assert_not_called()
        mock_mailgun.assert_awaited_once()


# ---------------------------------------------------------------------------
# Template placeholder replacement tests
# ---------------------------------------------------------------------------


class TestReplacePlaceholders:
    """Tests for placeholder replacement."""

    def test_replace_single_placeholder(self):
        """Replaces a single placeholder."""
        text = "Hello [First Name], welcome!"
        result = replace_placeholders(text, {"First Name": "John"})
        assert result == "Hello John, welcome!"

    def test_replace_multiple_placeholders(self):
        """Replaces multiple placeholders."""
        text = "[First Name] [Last Name] from [Company Name]"
        result = replace_placeholders(
            text,
            {
                "First Name": "Jane",
                "Last Name": "Doe",
                "Company Name": "Acme Corp",
            },
        )
        assert result == "Jane Doe from Acme Corp"

    def test_replace_same_placeholder_multiple_times(self):
        """Replaces the same placeholder appearing multiple times."""
        text = "[Name] said hello. [Name] waved goodbye."
        result = replace_placeholders(text, {"Name": "Alice"})
        assert result == "Alice said hello. Alice waved goodbye."

    def test_unmatched_placeholders_remain(self):
        """Unmatched placeholders remain in the text."""
        text = "Hello [First Name], your code is [Code]"
        result = replace_placeholders(text, {"First Name": "Bob"})
        assert result == "Hello Bob, your code is [Code]"


# ---------------------------------------------------------------------------
# Context builder tests
# ---------------------------------------------------------------------------


class TestBuildVerificationContext:
    """Tests for build_verification_context."""

    def test_builds_complete_context(self):
        """Builds a complete context with all fields."""
        ctx = build_verification_context(
            first_name="John",
            last_name="Doe",
            email="john@example.com",
            conference_name="TechConf",
            company_name="Acme",
            verify_link="https://example.com/verify",
            support_email="support@example.com",
        )

        assert ctx["First Name"] == "John"
        assert ctx["Last Name"] == "Doe"
        assert ctx["Full Name"] == "John Doe"
        assert ctx["Email"] == "john@example.com"
        assert ctx["Conference Name"] == "TechConf"
        assert ctx["Company Name"] == "Acme"
        assert ctx["Verify Link"] == "https://example.com/verify"
        assert ctx["Support Email"] == "support@example.com"

    def test_falls_back_to_email_prefix_for_name(self):
        """Uses email prefix as name when first/last not provided."""
        ctx = build_verification_context(
            email="john.doe@example.com",
        )

        assert ctx["Full Name"] == "john.doe"
        assert ctx["First Name"] == "john.doe"


class TestBuildCospeakerContext:
    """Tests for build_cospeaker_context."""

    def test_includes_paper_and_speaker_info(self):
        """Includes paper title and main speaker name."""
        ctx = build_cospeaker_context(
            email="cospeaker@example.com",
            paper_title="My Great Paper",
            main_speaker_name="Dr. Jane Smith",
            conference_name="TechConf",
        )

        assert ctx["Paper Title"] == "My Great Paper"
        assert ctx["Main Speaker Name"] == "Dr. Jane Smith"
        assert ctx["Conference Name"] == "TechConf"


class TestBuildPasswordResetContext:
    """Tests for build_password_reset_context."""

    def test_includes_reset_link(self):
        """Includes the reset link."""
        ctx = build_password_reset_context(
            email="user@example.com",
            reset_link="https://example.com/reset?token=abc",
        )

        assert ctx["Reset Link"] == "https://example.com/reset?token=abc"


# ---------------------------------------------------------------------------
# High-level email function tests (with mocked template rendering)
# ---------------------------------------------------------------------------


class TestSendVerificationEmail:
    """Tests for send_verification_email with template rendering."""

    @pytest.mark.asyncio
    async def test_sends_email_with_rendered_template(self):
        """Sends email using rendered template."""
        from app.core.email import send_verification_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="Verify your email for TestConf",
            body_html="<p>Click to verify</p>",
            body_text="Click to verify",
        )

        with (
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
            patch("app.core.email.get_settings") as mock_settings,
        ):
            mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@test.com"

            result = await send_verification_email(
                mock_db,
                email="user@example.com",
                token="token123",
                tenant_slug="testconf",
                first_name="John",
                last_name="Doe",
            )

        assert result is True
        mock_send.assert_called_once()
        args = mock_send.call_args[0]
        assert args[0] == "user@example.com"
        assert args[1] == "Verify your email for TestConf"


# ---------------------------------------------------------------------------
# XSS tests for replace_placeholders (is_html=True)
# ---------------------------------------------------------------------------


class TestReplacePlaceholdersXSS:
    """Tests for XSS prevention in placeholder replacement."""

    def test_script_tag_escaped_when_is_html_true(self):
        """Script tags are HTML-escaped when is_html=True."""
        text = "Hello [First Name], welcome!"
        result = replace_placeholders(
            text,
            {"First Name": '<script>alert("xss")</script>'},
            is_html=True,
        )
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_img_onerror_escaped_when_is_html_true(self):
        """img onerror payloads are escaped when is_html=True."""
        text = "Speaker: [Name]"
        result = replace_placeholders(
            text,
            {"Name": "<img src=x onerror=alert(1)>"},
            is_html=True,
        )
        assert "<img" not in result
        assert "&lt;img" in result

    def test_html_entities_escaped_when_is_html_true(self):
        """Ampersand, quotes, angle brackets are all escaped."""
        text = "Title: [Paper Title]"
        result = replace_placeholders(
            text,
            {"Paper Title": 'A & B <C> "D"'},
            is_html=True,
        )
        assert "&amp;" in result
        assert "&lt;C&gt;" in result
        assert "&quot;D&quot;" in result

    def test_values_not_escaped_when_is_html_false(self):
        """Values are NOT escaped when is_html=False (plain text)."""
        text = "Title: [Paper Title]"
        result = replace_placeholders(
            text,
            {"Paper Title": "<script>alert(1)</script>"},
            is_html=False,
        )
        assert "<script>alert(1)</script>" in result

    def test_multiple_placeholders_all_escaped(self):
        """All placeholders are escaped when is_html=True."""
        text = "[First Name] [Last Name] presents [Paper Title]"
        result = replace_placeholders(
            text,
            {
                "First Name": "<b>Bold</b>",
                "Last Name": "O'Malley",
                "Paper Title": 'XSS" onclick="alert(1)',
            },
            is_html=True,
        )
        assert "<b>" not in result
        assert "&lt;b&gt;" in result
        assert "&#x27;" in result or "'" in result  # html.escape with quote=False
        assert 'onclick="alert(1)' not in result

    def test_raw_html_keys_skip_escape(self):
        """Keys listed in raw_html_keys keep their HTML intact (QA 6.2.1).

        The news direct-message email injects the article body via
        ``Message Content``; that key holds already-sanitized HTML that
        must render as a paragraph, not literal ``<p>...</p>`` text.
        Other keys still get escaped so they can't smuggle XSS.
        """
        text = "[First Name]: [Message Content]"
        result = replace_placeholders(
            text,
            {
                "First Name": "<script>alert(1)</script>",
                "Message Content": "<p>article 1</p>",
            },
            is_html=True,
            raw_html_keys={"Message Content"},
        )
        # Article body kept as HTML
        assert "<p>article 1</p>" in result
        # Other user-supplied key still escaped
        assert "<script>" not in result
        assert "&lt;script&gt;" in result


class TestSendCospeakerInvitationEmail:
    """Tests for send_cospeaker_invitation_email with template rendering."""

    @pytest.mark.asyncio
    async def test_sends_invitation_with_paper_details(self):
        """Sends invitation email with paper and speaker details."""
        from app.core.email import send_cospeaker_invitation_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="You've been invited as a co-speaker",
            body_html="<p>Jane invited you</p>",
            body_text="Jane invited you",
        )

        with (
            patch("app.core.email._is_email_enabled_for_conference", return_value=True),
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
            patch("app.core.email.get_settings") as mock_settings,
        ):
            mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@test.com"

            result = await send_cospeaker_invitation_email(
                mock_db,
                email="cospeaker@example.com",
                paper_title="Machine Learning 101",
                conference_id=uuid4(),
                conference_name="TechConf",
                main_speaker_name="Jane Smith",
                tenant_slug="techconf",
            )

        assert result is True
        mock_send.assert_called_once()


class TestSendPasswordResetEmail:
    """Tests for send_password_reset_email with template rendering."""

    @pytest.mark.asyncio
    async def test_sends_reset_email_with_link(self):
        """Sends password reset email with reset link."""
        from app.core.email import send_password_reset_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="Reset your password",
            body_html="<p>Click to reset</p>",
            body_text="Click to reset",
        )

        with (
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
            patch("app.core.email.get_settings") as mock_settings,
        ):
            mock_settings.return_value.RESEND_FROM_EMAIL = "noreply@test.com"

            result = await send_password_reset_email(
                mock_db,
                email="user@example.com",
                token="reset-token",
                conference_id=uuid4(),
                tenant_slug="testconf",
            )

        assert result is True
        mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# send_direct_message_email tests
# ---------------------------------------------------------------------------


class TestSendDirectMessageEmail:
    """Tests for send_direct_message_email (template-based)."""

    @pytest.mark.asyncio
    async def test_basic_send(self):
        """Sends a direct message email using rendered template."""
        from app.core.email import send_direct_message_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="[PyCon] Call for Papers Update",
            body_html="<p>Hi Alice, Bob Reviewer from PyCon: Your paper was accepted.</p>",
            body_text="Hi Alice, Bob Reviewer from PyCon: Your paper was accepted.",
        )

        with (
            patch("app.core.email.render_email", return_value=mock_rendered) as mock_render,
            patch("app.core.email.send_email", return_value=True) as mock_send,
        ):
            result = await send_direct_message_email(
                mock_db,
                email="recipient@example.com",
                first_name="Alice",
                subject="Call for Papers Update",
                body_html="<p>Your paper was accepted.</p>",
                conference_name="PyCon",
                sender_name="Bob Reviewer",
            )

        assert result is True
        mock_render.assert_called_once()
        mock_send.assert_called_once()
        args = mock_send.call_args[0]
        assert args[0] == "recipient@example.com"
        assert args[1] == "[PyCon] Call for Papers Update"

    @pytest.mark.asyncio
    async def test_reply_to_passed_through(self):
        """Reply-to address is forwarded to send_email."""
        from app.core.email import send_direct_message_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="[Conf] Test",
            body_html="<p>msg</p>",
            body_text="msg",
        )

        with (
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
        ):
            await send_direct_message_email(
                mock_db,
                email="r@example.com",
                subject="Test",
                body_html="<p>msg</p>",
                conference_name="Conf",
                sender_name="Admin",
                reply_to="contact@conf.org",
            )

        assert mock_send.call_args[1]["reply_to"] == "contact@conf.org"

    @pytest.mark.asyncio
    async def test_context_builder_called_with_correct_args(self):
        """Verifies context builder receives the right parameters."""
        from app.core.email import send_direct_message_email

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(subject="Test", body_html="<p>x</p>", body_text="x")

        with (
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True),
            patch("app.core.email.build_direct_message_context", return_value={}) as mock_ctx,
        ):
            await send_direct_message_email(
                mock_db,
                email="r@example.com",
                first_name="Alice",
                subject="Update",
                body_html="<p>content</p>",
                conference_name="PyCon",
                sender_name="Bob",
            )

        mock_ctx.assert_called_once_with(
            first_name="Alice",
            conference_name="PyCon",
            sender_name="Bob",
            message_subject="Update",
            message_content="<p>content</p>",
        )

    @pytest.mark.asyncio
    async def test_passes_conference_and_tenant_ids(self):
        """Conference and tenant IDs are forwarded to render_email."""
        from app.core.email import send_direct_message_email

        mock_db = AsyncMock()
        conf_id = uuid4()
        tenant_id = uuid4()
        mock_rendered = RenderedEmail(subject="Test", body_html="<p>x</p>", body_text="x")

        with (
            patch("app.core.email.render_email", return_value=mock_rendered) as mock_render,
            patch("app.core.email.send_email", return_value=True),
        ):
            await send_direct_message_email(
                mock_db,
                email="r@example.com",
                subject="Test",
                body_html="<p>safe</p>",
                conference_name="Conf",
                sender_name="Admin",
                conference_id=conf_id,
                tenant_id=tenant_id,
            )

        assert mock_render.call_args[1]["conference_id"] == conf_id
        assert mock_render.call_args[1]["tenant_id"] == tenant_id


# ---------------------------------------------------------------------------
# send_new_message_notification tests
# ---------------------------------------------------------------------------


class TestSendNewMessageNotification:
    """Tests for send_new_message_notification."""

    @pytest.mark.asyncio
    async def test_sends_notification_with_template(self):
        """Sends notification using rendered template."""
        from app.core.email import send_new_message_notification

        mock_db = AsyncMock()
        mock_rendered = RenderedEmail(
            subject="New message: Paper Review",
            body_html="<p>You have a new message</p>",
            body_text="You have a new message",
        )

        with (
            patch("app.core.email._is_email_enabled_for_conference", return_value=True),
            patch("app.core.email.render_email", return_value=mock_rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
        ):
            result = await send_new_message_notification(
                mock_db,
                email="applicant@example.com",
                first_name="Alice",
                conference_id=uuid4(),
                conference_name="PyCon",
                message_subject="Paper Review",
                messages_link="https://portal.example.com/messages/123",
            )

        assert result is True
        mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_when_email_disabled(self):
        """Returns False when email sending is disabled for the conference."""
        from app.core.email import send_new_message_notification

        mock_db = AsyncMock()

        with patch("app.core.email._is_email_enabled_for_conference", return_value=False):
            result = await send_new_message_notification(
                mock_db,
                email="applicant@example.com",
                first_name="Alice",
                conference_id=uuid4(),
                conference_name="PyCon",
                message_subject="Test",
                messages_link="https://example.com",
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_passes_correct_context(self):
        """Passes the right context keys to render_email."""
        from app.core.email import send_new_message_notification

        mock_db = AsyncMock()
        conf_id = uuid4()

        with (
            patch("app.core.email._is_email_enabled_for_conference", return_value=True),
            patch("app.core.email.render_email", return_value=RenderedEmail("s", "<p>h</p>", "t")) as mock_render,
            patch("app.core.email.send_email", return_value=True),
        ):
            await send_new_message_notification(
                mock_db,
                email="a@example.com",
                first_name="Bob",
                conference_id=conf_id,
                conference_name="TestConf",
                message_subject="Review Update",
                messages_link="https://example.com/msg",
            )

        context = mock_render.call_args[0][2]
        assert context["First Name"] == "Bob"
        assert context["Conference Name"] == "TestConf"
        assert context["Message Subject"] == "Review Update"
        assert context["Messages Link"] == "https://example.com/msg"

    @pytest.mark.asyncio
    async def test_training_domain_uses_tenant_gate(self):
        """When ``domain='training'``, the email-enabled gate consults
        ``training_email_settings`` on the tenant rather than the
        conference settings — so a training thread reply notifies even
        without a ``conference_id``."""
        from app.core.email import send_new_message_notification

        mock_db = AsyncMock()
        tenant_id = uuid4()
        rendered = RenderedEmail("s", "<p>h</p>", "t")

        with (
            patch("app.core.email._is_email_enabled_for_training", return_value=True) as mock_train_gate,
            patch("app.core.email._is_email_enabled_for_conference") as mock_conf_gate,
            patch("app.core.email.render_email", return_value=rendered),
            patch("app.core.email.send_email", return_value=True) as mock_send,
        ):
            result = await send_new_message_notification(
                mock_db,
                email="attendee@example.com",
                first_name="Carol",
                conference_id=None,
                tenant_id=tenant_id,
                conference_name="PSM I Training",
                message_subject="Pre-class materials",
                messages_link="https://portal.example.com/foo/portal/messages/abc",
                domain="training",
            )

        assert result is True
        mock_train_gate.assert_awaited_once_with(mock_db, tenant_id)
        mock_conf_gate.assert_not_called()
        mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_training_domain_skips_when_tenant_setting_disabled(self):
        """Tenant-wide training-email-disabled setting suppresses the send."""
        from app.core.email import send_new_message_notification

        mock_db = AsyncMock()

        with patch("app.core.email._is_email_enabled_for_training", return_value=False):
            result = await send_new_message_notification(
                mock_db,
                email="attendee@example.com",
                first_name="Carol",
                tenant_id=uuid4(),
                conference_name="PSM I Training",
                message_subject="Pre-class",
                messages_link="https://example.com/m",
                domain="training",
            )

        assert result is False


# ---------------------------------------------------------------------------
# _send_with_retry tests
# ---------------------------------------------------------------------------


class TestSendWithRetry:
    """Tests for the _send_with_retry helper."""

    @pytest.mark.asyncio
    async def test_succeeds_on_first_attempt(self):
        """Calls the function once when it succeeds immediately."""
        mock_fn = AsyncMock(return_value=True)
        await _send_with_retry(mock_fn, "arg1", kw="val")
        mock_fn.assert_awaited_once_with("arg1", kw="val")

    @pytest.mark.asyncio
    async def test_retries_on_failure_then_succeeds(self):
        """Retries after a failure and succeeds on the second attempt."""
        mock_fn = AsyncMock(side_effect=[Exception("transient"), True])
        with patch("app.core.email.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _send_with_retry(mock_fn, max_retries=3)
        assert mock_fn.await_count == 2
        mock_sleep.assert_awaited_once_with(1)  # 2^0 = 1

    @pytest.mark.asyncio
    async def test_exponential_backoff_delays(self):
        """Uses exponential backoff: 1s, 2s, 4s."""
        mock_fn = AsyncMock(side_effect=[Exception("e1"), Exception("e2"), Exception("e3")])
        with patch("app.core.email.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await _send_with_retry(mock_fn, max_retries=3)
        assert mock_fn.await_count == 3
        # Should have slept twice (not after the last attempt)
        assert mock_sleep.await_count == 2
        mock_sleep.assert_any_await(1)  # 2^0
        mock_sleep.assert_any_await(2)  # 2^1

    @pytest.mark.asyncio
    async def test_logs_error_after_all_retries_exhausted(self, caplog):
        """Logs an error when all retry attempts fail."""
        import logging

        mock_fn = AsyncMock(side_effect=Exception("persistent failure"))
        mock_fn.__name__ = "mock_send"
        with (
            caplog.at_level(logging.ERROR),
            patch("app.core.email.asyncio.sleep", new_callable=AsyncMock),
        ):
            await _send_with_retry(mock_fn, max_retries=2)
        assert "Email send failed after 2 attempts" in caplog.text

    @pytest.mark.asyncio
    async def test_never_raises(self):
        """Never propagates exceptions to the caller."""
        mock_fn = AsyncMock(side_effect=Exception("boom"))
        with patch("app.core.email.asyncio.sleep", new_callable=AsyncMock):
            # Should not raise
            await _send_with_retry(mock_fn, max_retries=1)


# ---------------------------------------------------------------------------
# send_email_background tests
# ---------------------------------------------------------------------------


class TestSendEmailBackground:
    """Tests for the send_email_background wrapper."""

    @pytest.fixture(autouse=True)
    def _enable_background_emails(self, monkeypatch):
        """Allow real background email tasks for these tests."""
        monkeypatch.delenv("TESTING", raising=False)

    @pytest.mark.asyncio
    async def test_creates_background_task(self):
        """Creates an asyncio task that eventually calls the send function."""
        import asyncio

        mock_fn = AsyncMock(return_value=True)
        mock_fn.__name__ = "mock_send"

        send_email_background(mock_fn, "to@example.com", subject="Test")

        # Let the event loop run the background task
        await asyncio.sleep(0.05)

        mock_fn.assert_awaited_once_with("to@example.com", subject="Test")

    @pytest.mark.asyncio
    async def test_task_stored_in_background_set(self):
        """Task reference is stored to prevent garbage collection."""
        import asyncio

        mock_fn = AsyncMock(return_value=True)
        mock_fn.__name__ = "mock_send"

        initial_count = len(email_module._background_tasks)
        send_email_background(mock_fn, "to@example.com")

        # Task should be in the set immediately
        assert len(email_module._background_tasks) >= initial_count + 1

        # After completion, task is cleaned up
        await asyncio.sleep(0.05)
        assert len(email_module._background_tasks) == initial_count

    @pytest.mark.asyncio
    async def test_does_not_block_caller(self):
        """The call returns immediately without waiting for the email."""
        import asyncio

        mock_fn = AsyncMock(side_effect=Exception("slow failure"))
        mock_fn.__name__ = "mock_send"

        with patch("app.core.email.asyncio.sleep", new_callable=AsyncMock):
            # This should return immediately, not block
            send_email_background(mock_fn, "to@example.com", max_retries=1)

        # Give the task time to complete
        await asyncio.sleep(0.05)

    @pytest.mark.asyncio
    async def test_replaces_session_kwarg_with_fresh_session(self):
        """send_email_background must replace a db= kwarg AsyncSession with a fresh one.

        Regression: _send_with_fresh_session only scanned positional args for
        AsyncSession. All callers pass db= as a keyword arg, so the request-scoped
        session leaked into the background task and caused asyncpg
        'cannot use Connection.transaction() in a manually started transaction'.
        """
        import asyncio
        from unittest.mock import MagicMock
        from sqlalchemy.ext.asyncio import AsyncSession

        received_sessions: list = []

        async def capture_fn(db, **kwargs):
            received_sessions.append(db)
            return True

        capture_fn.__name__ = "capture_fn"

        request_session = MagicMock(spec=AsyncSession)
        fresh_session = MagicMock(spec=AsyncSession)

        with patch("app.db.session.async_session_maker") as mock_maker:
            mock_cm = AsyncMock()
            mock_cm.__aenter__ = AsyncMock(return_value=fresh_session)
            mock_cm.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_cm

            send_email_background(capture_fn, db=request_session)
            await asyncio.sleep(0.05)

        assert len(received_sessions) == 1
        assert received_sessions[0] is fresh_session, (
            "Background task received the request-scoped session instead of a fresh one"
        )
        assert received_sessions[0] is not request_session

    @pytest.mark.asyncio
    async def test_replaces_session_positional_arg_with_fresh_session(self):
        """send_email_background also replaces positional AsyncSession args."""
        import asyncio
        from unittest.mock import MagicMock
        from sqlalchemy.ext.asyncio import AsyncSession

        received_sessions: list = []

        async def capture_fn(db, **kwargs):
            received_sessions.append(db)
            return True

        capture_fn.__name__ = "capture_fn"

        request_session = MagicMock(spec=AsyncSession)
        fresh_session = MagicMock(spec=AsyncSession)

        with patch("app.db.session.async_session_maker") as mock_maker:
            mock_cm = AsyncMock()
            mock_cm.__aenter__ = AsyncMock(return_value=fresh_session)
            mock_cm.__aexit__ = AsyncMock(return_value=False)
            mock_maker.return_value = mock_cm

            send_email_background(capture_fn, request_session)
            await asyncio.sleep(0.05)

        assert len(received_sessions) == 1
        assert received_sessions[0] is fresh_session
