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
# validate_phone tests
# ---------------------------------------------------------------------------


class TestValidatePhone:
    """Tests for the validate_phone function."""

    # --- Valid phone numbers ---

    def test_validate_phone_simple_digits(self):
        """Accepts simple digit-only phone number."""
        result = validate_phone("1234567890")
        assert result == "1234567890"

    def test_validate_phone_with_plus_prefix(self):
        """Accepts phone number with + prefix."""
        result = validate_phone("+491234567890")
        assert result == "+491234567890"

    def test_validate_phone_international_format(self):
        """Accepts international format with 00 prefix."""
        result = validate_phone("00491234567890")
        assert result == "00491234567890"

    def test_validate_phone_us_format(self):
        """Accepts US-style phone number."""
        result = validate_phone("+12025551234")
        assert result == "+12025551234"

    def test_validate_phone_short_number(self):
        """Accepts short phone numbers."""
        result = validate_phone("12345")
        assert result == "12345"

    def test_validate_phone_long_number(self):
        """Accepts long phone numbers."""
        result = validate_phone("+123456789012345")
        assert result == "+123456789012345"

    def test_validate_phone_single_digit(self):
        """Accepts single digit."""
        result = validate_phone("1")
        assert result == "1"

    def test_validate_phone_plus_only_digit(self):
        """Accepts + followed by single digit."""
        result = validate_phone("+1")
        assert result == "+1"

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

    def test_validate_phone_with_spaces_raises(self):
        """Raises ValueError for phone numbers with spaces."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123 456 7890")

    def test_validate_phone_with_dashes_raises(self):
        """Raises ValueError for phone numbers with dashes."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123-456-7890")

    def test_validate_phone_with_parentheses_raises(self):
        """Raises ValueError for phone numbers with parentheses."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("(123) 456-7890")

    def test_validate_phone_with_dots_raises(self):
        """Raises ValueError for phone numbers with dots."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123.456.7890")

    def test_validate_phone_with_letters_raises(self):
        """Raises ValueError for phone numbers with letters."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123abc456")

    def test_validate_phone_only_plus_raises(self):
        """Raises ValueError for only + sign."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("+")

    def test_validate_phone_plus_in_middle_raises(self):
        """Raises ValueError for + in the middle of number."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("12+34567890")

    def test_validate_phone_plus_at_end_raises(self):
        """Raises ValueError for + at end of number."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("1234567890+")

    def test_validate_phone_multiple_plus_raises(self):
        """Raises ValueError for multiple + signs."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("++1234567890")

    def test_validate_phone_special_characters_raises(self):
        """Raises ValueError for special characters."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123#456*7890")

    def test_validate_phone_whitespace_only_raises(self):
        """Raises ValueError for whitespace only."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("   ")

    def test_validate_phone_leading_whitespace_raises(self):
        """Raises ValueError for leading whitespace."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone(" 1234567890")

    def test_validate_phone_trailing_whitespace_raises(self):
        """Raises ValueError for trailing whitespace."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("1234567890 ")

    def test_validate_phone_newline_raises(self):
        """Raises ValueError for newline in number."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123\n456")

    def test_validate_phone_tab_raises(self):
        """Raises ValueError for tab in number."""
        with pytest.raises(ValueError, match="Phone number must contain only digits"):
            validate_phone("123\t456")

    # --- Edge cases ---

    def test_validate_phone_all_zeros(self):
        """Accepts all zeros."""
        result = validate_phone("0000000000")
        assert result == "0000000000"

    def test_validate_phone_all_nines(self):
        """Accepts all nines."""
        result = validate_phone("9999999999")
        assert result == "9999999999"

    def test_validate_phone_mixed_digits(self):
        """Accepts mixed digits."""
        result = validate_phone("1029384756")
        assert result == "1029384756"

    # --- Error message content ---

    def test_validate_phone_error_message_contains_examples(self):
        """Error message contains valid examples."""
        with pytest.raises(ValueError) as exc_info:
            validate_phone("invalid-phone")

        error_message = str(exc_info.value)
        assert "+491234545" in error_message
        assert "00491234566" in error_message
