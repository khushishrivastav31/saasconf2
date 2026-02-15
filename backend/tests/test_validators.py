"""Unit tests for the validators module."""

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

import pytest

from app.core.validators import validate_phone


# ---------------------------------------------------------------------------
# validate_phone tests (uses libphonenumber, E.164 normalization)
# ---------------------------------------------------------------------------


class TestValidatePhone:
    """Tests for the validate_phone function with libphonenumber."""

    # --- Valid phone numbers (E.164 normalized) ---

    def test_validate_phone_german_number(self):
        """Accepts German phone number and normalizes to E.164."""
        result = validate_phone("+491701234567")
        assert result == "+491701234567"

    def test_validate_phone_german_with_spaces(self):
        """Accepts German number with spaces and normalizes."""
        result = validate_phone("+49 170 123 4567")
        assert result == "+491701234567"

    def test_validate_phone_us_number(self):
        """Accepts US phone number and normalizes to E.164."""
        result = validate_phone("+12025551234")
        assert result == "+12025551234"

    def test_validate_phone_us_with_formatting(self):
        """Accepts US number with parentheses/dashes and normalizes."""
        result = validate_phone("+1 (202) 555-1234")
        assert result == "+12025551234"

    def test_validate_phone_uk_number(self):
        """Accepts UK phone number and normalizes to E.164."""
        result = validate_phone("+442071234567")
        assert result == "+442071234567"

    def test_validate_phone_austrian_number(self):
        """Accepts Austrian phone number."""
        result = validate_phone("+4312345678")
        assert result == "+4312345678"

    def test_validate_phone_swiss_number(self):
        """Accepts Swiss phone number."""
        result = validate_phone("+41441234567")
        assert result == "+41441234567"

    # --- None and empty values ---

    def test_validate_phone_none_returns_none(self):
        """Returns None when input is None."""
        result = validate_phone(None)
        assert result is None

    def test_validate_phone_empty_string_returns_empty(self):
        """Returns empty string when input is empty."""
        result = validate_phone("")
        assert result == ""

    # --- Invalid phone numbers ---

    def test_validate_phone_no_country_code_raises(self):
        """Raises ValueError for number without country code."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("1234567890")

    def test_validate_phone_invalid_number_raises(self):
        """Raises ValueError for invalid number."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("+49123")  # Too short for Germany

    def test_validate_phone_only_plus_raises(self):
        """Raises ValueError for only + sign."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("+")

    def test_validate_phone_letters_raises(self):
        """Raises ValueError for phone numbers with letters."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("+49abc123456")

    def test_validate_phone_plus_in_middle_raises(self):
        """Raises ValueError for + in the middle of number."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("12+34567890")

    def test_validate_phone_whitespace_only_raises(self):
        """Raises ValueError for whitespace only."""
        with pytest.raises(ValueError, match="Invalid phone number"):
            validate_phone("   ")

    # --- Error message content ---

    def test_validate_phone_error_message_contains_example(self):
        """Error message contains valid example."""
        with pytest.raises(ValueError) as exc_info:
            validate_phone("invalid-phone")

        error_message = str(exc_info.value)
        assert "+49123456789" in error_message
