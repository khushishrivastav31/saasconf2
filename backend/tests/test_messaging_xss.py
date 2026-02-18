"""Unit tests for XSS prevention in messaging template variable substitution.

Tests the substitute_template_variables() function directly to verify
that all user-controlled values are HTML-escaped before insertion.
"""

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

from app.api.v1.messaging._shared import substitute_template_variables


class TestSubstituteTemplateVariablesBasic:
    """Basic functionality tests for substitute_template_variables."""

    def test_replaces_all_placeholders(self):
        """All six placeholders are replaced."""
        text = (
            "Dear [First Name] [Last Name], "
            "email: [Email], conf: [Conference Name], "
            "paper: [Paper Title], papers: [Paper List]"
        )
        result = substitute_template_variables(
            text,
            first_name="Alice",
            last_name="Smith",
            email="alice@example.com",
            conference_name="PyCon",
            paper_title="My Paper",
            paper_list="Paper A, Paper B",
        )
        assert "Alice" in result
        assert "Smith" in result
        assert "alice@example.com" in result
        assert "PyCon" in result
        assert "My Paper" in result
        assert "Paper A, Paper B" in result
        assert "[First Name]" not in result

    def test_empty_values_replace_with_empty(self):
        """Empty string values replace placeholders with nothing."""
        text = "Hello [First Name]!"
        result = substitute_template_variables(text, first_name="")
        assert result == "Hello !"

    def test_no_placeholders_returns_unchanged(self):
        """Text without placeholders is returned unchanged."""
        text = "No placeholders here."
        result = substitute_template_variables(text, first_name="Alice")
        assert result == "No placeholders here."

    def test_multiple_occurrences_replaced(self):
        """Same placeholder appearing multiple times is replaced everywhere."""
        text = "[First Name] said hello. [First Name] waved goodbye."
        result = substitute_template_variables(text, first_name="Alice")
        assert result == "Alice said hello. Alice waved goodbye."


class TestSubstituteTemplateVariablesXSS:
    """XSS prevention tests for substitute_template_variables."""

    def test_script_tag_in_first_name(self):
        """Script tags in first_name are HTML-escaped."""
        text = "Hello [First Name]!"
        result = substitute_template_variables(
            text, first_name='<script>alert("xss")</script>'
        )
        assert "<script>" not in result
        assert "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;" in result

    def test_script_tag_in_last_name(self):
        """Script tags in last_name are HTML-escaped."""
        text = "Name: [Last Name]"
        result = substitute_template_variables(
            text, last_name="<script>document.cookie</script>"
        )
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_img_onerror_in_email(self):
        """img onerror XSS payload in email is escaped."""
        text = "Contact: [Email]"
        result = substitute_template_variables(
            text, email='"><img src=x onerror=alert(1)>'
        )
        assert "<img" not in result
        assert "&lt;img" in result

    def test_svg_onload_in_conference_name(self):
        """SVG onload XSS payload in conference_name is escaped."""
        text = "Conference: [Conference Name]"
        result = substitute_template_variables(
            text, conference_name="<svg onload=alert(document.cookie)>"
        )
        assert "<svg" not in result
        assert "&lt;svg" in result

    def test_script_in_paper_title(self):
        """Script injection in paper_title is escaped."""
        text = "Paper: [Paper Title]"
        result = substitute_template_variables(
            text, paper_title='My Paper<script>alert(1)</script>'
        )
        assert "<script>" not in result
        assert "My Paper&lt;script&gt;" in result

    def test_script_in_paper_list(self):
        """Script injection in paper_list is escaped."""
        text = "Papers: [Paper List]"
        result = substitute_template_variables(
            text, paper_list='<script>fetch("https://evil.com")</script>'
        )
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_html_entities_escaped(self):
        """Ampersands, angle brackets, and quotes are all escaped."""
        text = "Name: [First Name]"
        result = substitute_template_variables(
            text, first_name='A & B <C> "D"'
        )
        assert "&amp;" in result
        assert "&lt;C&gt;" in result
        assert "&quot;D&quot;" in result

    def test_multiple_xss_payloads_all_escaped(self):
        """XSS payloads in multiple fields are all escaped."""
        text = "[First Name] [Last Name] - [Paper Title]"
        result = substitute_template_variables(
            text,
            first_name="<b>Bold</b>",
            last_name='<img src=x onerror="alert(1)">',
            paper_title="<script>alert(1)</script>",
        )
        assert "<b>" not in result
        assert "<img" not in result
        assert "<script>" not in result
        assert "&lt;b&gt;" in result
        assert "&lt;img" in result
        assert "&lt;script&gt;" in result

    def test_event_handler_attribute_escaped(self):
        """Event handler injection via attributes is escaped."""
        text = "Speaker: [First Name]"
        result = substitute_template_variables(
            text, first_name='" onmouseover="alert(1)" data-x="'
        )
        assert 'onmouseover="alert(1)"' not in result
        assert "&quot;" in result

    def test_template_body_html_preserved(self):
        """HTML in the template body itself is NOT escaped (only values are)."""
        text = '<p>Hello <strong>[First Name]</strong></p>'
        result = substitute_template_variables(text, first_name="Alice")
        assert "<p>Hello <strong>Alice</strong></p>" == result

    def test_unicode_in_values_preserved(self):
        """Unicode characters pass through correctly."""
        text = "Speaker: [First Name]"
        result = substitute_template_variables(text, first_name="José García")
        assert "José García" in result

    def test_xss_payload_with_placeholder_syntax(self):
        """XSS payload disguised as placeholder syntax is still escaped."""
        text = "Name: [First Name]"
        result = substitute_template_variables(
            text, first_name='<script>[Email]</script>'
        )
        # The script tags must be escaped regardless of placeholder-like content
        assert "<script>" not in result
        assert "&lt;script&gt;" in result
