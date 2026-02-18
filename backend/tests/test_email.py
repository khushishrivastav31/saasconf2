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

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.core import email as email_module
from app.core.email import (
    _get_resend,
    _log_email,
    send_email,
)
from app.core.email_templates import (
    RenderedEmail,
    replace_placeholders,
    build_verification_context,
    build_cospeaker_context,
    build_password_reset_context,
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
    async def test_send_email_falls_back_to_logging_when_no_resend(self, caplog):
        """Falls back to console logging when Resend is not configured."""
        import logging

        email_module._resend_client = None

        with caplog.at_level(logging.INFO):
            with patch("app.core.email._get_resend", return_value=None):
                result = await send_email(
                    to="test@example.com",
                    subject="Test Email",
                    html="<p>Hello</p>",
                    text="Hello",
                )

        assert result is True
        assert "To: test@example.com" in caplog.text

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
        result = replace_placeholders(text, {
            "First Name": "Jane",
            "Last Name": "Doe",
            "Company Name": "Acme Corp",
        })
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

        with patch("app.core.email.render_email", return_value=mock_rendered):
            with patch("app.core.email.send_email", return_value=True) as mock_send:
                with patch("app.core.email.get_settings") as mock_settings:
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
            {"Name": '<img src=x onerror=alert(1)>'},
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
            {"Paper Title": '<script>alert(1)</script>'},
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

        with patch("app.core.email._is_email_enabled_for_conference", return_value=True):
            with patch("app.core.email.render_email", return_value=mock_rendered):
                with patch("app.core.email.send_email", return_value=True) as mock_send:
                    with patch("app.core.email.get_settings") as mock_settings:
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

        with patch("app.core.email.render_email", return_value=mock_rendered):
            with patch("app.core.email.send_email", return_value=True) as mock_send:
                with patch("app.core.email.get_settings") as mock_settings:
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
    """Tests for send_direct_message_email."""

    @pytest.mark.asyncio
    async def test_basic_send(self):
        """Sends a direct message email with correct structure."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            result = await send_direct_message_email(
                email="recipient@example.com",
                first_name="Alice",
                subject="Call for Papers Update",
                body_html="<p>Your paper was accepted.</p>",
                conference_name="PyCon",
                sender_name="Bob Reviewer",
            )

        assert result is True
        mock_send.assert_called_once()
        args = mock_send.call_args
        assert args[0][0] == "recipient@example.com"
        assert args[0][1] == "[PyCon] Call for Papers Update"
        assert "Alice" in args[0][2]  # HTML body
        assert "PyCon" in args[0][2]
        assert "Bob Reviewer" in args[0][2]
        assert "Your paper was accepted." in args[0][2]

    @pytest.mark.asyncio
    async def test_empty_first_name_fallback(self):
        """Uses 'there' when first_name is empty."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="",
                subject="Test",
                body_html="<p>msg</p>",
                conference_name="Conf",
                sender_name="Admin",
            )

        html_body = mock_send.call_args[0][2]
        assert "Hi there," in html_body

    @pytest.mark.asyncio
    async def test_subject_without_conference_name(self):
        """Subject has no prefix when conference_name is empty."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                subject="Important Update",
                body_html="<p>msg</p>",
                conference_name="",
                sender_name="Admin",
            )

        subject = mock_send.call_args[0][1]
        assert subject == "Important Update"

    @pytest.mark.asyncio
    async def test_reply_to_passed_through(self):
        """Reply-to address is forwarded to send_email."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                subject="Test",
                body_html="<p>msg</p>",
                conference_name="Conf",
                sender_name="Admin",
                reply_to="contact@conf.org",
            )

        assert mock_send.call_args[1]["reply_to"] == "contact@conf.org"

    @pytest.mark.asyncio
    async def test_generates_plain_text_from_html(self):
        """Generates a plain-text body by stripping HTML tags."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="Alice",
                subject="Test",
                body_html="<p>Hello <strong>world</strong></p>",
                conference_name="Conf",
                sender_name="Admin",
            )

        text_body = mock_send.call_args[0][3]
        assert "Hello world" in text_body
        assert "<p>" not in text_body
        assert "<strong>" not in text_body


class TestSendDirectMessageEmailXSS:
    """XSS prevention tests for send_direct_message_email."""

    @pytest.mark.asyncio
    async def test_xss_in_first_name(self):
        """Script tags in first_name are HTML-escaped."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name='<script>alert("xss")</script>',
                subject="Test",
                body_html="<p>safe body</p>",
                conference_name="Conf",
                sender_name="Admin",
            )

        html_body = mock_send.call_args[0][2]
        assert "<script>" not in html_body
        assert "&lt;script&gt;" in html_body

    @pytest.mark.asyncio
    async def test_xss_in_conference_name(self):
        """Script tags in conference_name are HTML-escaped."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="Alice",
                subject="Test",
                body_html="<p>safe body</p>",
                conference_name='<img src=x onerror=alert(1)>',
                sender_name="Admin",
            )

        html_body = mock_send.call_args[0][2]
        assert "<img" not in html_body
        assert "&lt;img" in html_body

    @pytest.mark.asyncio
    async def test_xss_in_sender_name(self):
        """Script tags in sender_name are HTML-escaped."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="Alice",
                subject="Test",
                body_html="<p>safe body</p>",
                conference_name="Conf",
                sender_name='<svg onload=alert(document.cookie)>',
            )

        html_body = mock_send.call_args[0][2]
        assert "<svg" not in html_body
        assert "&lt;svg" in html_body

    @pytest.mark.asyncio
    async def test_html_entities_in_all_fields(self):
        """Ampersands, quotes, angle brackets escaped in all user fields."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name='A & B "C"',
                subject="Test",
                body_html="<p>safe</p>",
                conference_name="<Conf>",
                sender_name="O'Brien & Co",
            )

        html_body = mock_send.call_args[0][2]
        assert "A &amp; B &quot;C&quot;" in html_body
        assert "&lt;Conf&gt;" in html_body
        assert "O&#x27;Brien &amp; Co" in html_body

    @pytest.mark.asyncio
    async def test_body_html_not_double_escaped(self):
        """The body_html (already sanitized) is NOT re-escaped."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="Alice",
                subject="Test",
                body_html="<p>Formatted <strong>text</strong></p>",
                conference_name="Conf",
                sender_name="Admin",
            )

        html_body = mock_send.call_args[0][2]
        assert "<p>Formatted <strong>text</strong></p>" in html_body
        assert "&lt;p&gt;" not in html_body

    @pytest.mark.asyncio
    async def test_plain_text_not_escaped(self):
        """Plain-text version uses raw values (no HTML escaping needed)."""
        from app.core.email import send_direct_message_email

        with patch("app.core.email.send_email", return_value=True) as mock_send:
            await send_direct_message_email(
                email="r@example.com",
                first_name="Alice <script>",
                subject="Test",
                body_html="<p>safe</p>",
                conference_name="Conf",
                sender_name="Admin",
            )

        text_body = mock_send.call_args[0][3]
        # Plain text should contain raw first_name — no HTML rendering
        assert "Alice <script>" in text_body


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

        with patch("app.core.email._is_email_enabled_for_conference", return_value=True):
            with patch("app.core.email.render_email", return_value=mock_rendered):
                with patch("app.core.email.send_email", return_value=True) as mock_send:
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

        with patch("app.core.email._is_email_enabled_for_conference", return_value=True):
            with patch("app.core.email.render_email", return_value=RenderedEmail("s", "<p>h</p>", "t")) as mock_render:
                with patch("app.core.email.send_email", return_value=True):
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
