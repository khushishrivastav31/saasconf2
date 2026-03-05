"""Tests for currency_formats.format_amount()."""

from decimal import Decimal

from app.core.currency_formats import format_amount


class TestFormatAmount:
    """Tests for the format_amount helper."""

    def test_us_uk_format(self):
        """US/UK: period decimal, comma thousands."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(1234567.89, settings) == "1,234,567.89"

    def test_european_format(self):
        """European: comma decimal, period thousands."""
        settings = {"decimal_separator": ",", "thousands_separator": "."}
        assert format_amount(1234567.89, settings) == "1.234.567,89"

    def test_french_format(self):
        """French: comma decimal, space thousands."""
        settings = {"decimal_separator": ",", "thousands_separator": " "}
        assert format_amount(1234567.89, settings) == "1 234 567,89"

    def test_swiss_format(self):
        """Swiss: period decimal, apostrophe thousands."""
        settings = {"decimal_separator": ".", "thousands_separator": "'"}
        assert format_amount(1234567.89, settings) == "1'234'567.89"

    def test_no_separator(self):
        """No thousands separator."""
        settings = {"decimal_separator": ".", "thousands_separator": ""}
        assert format_amount(1234567.89, settings) == "1234567.89"

    def test_zero_value(self):
        """Zero formats correctly."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(0, settings) == "0.00"

    def test_negative_value(self):
        """Negative values preserve the sign."""
        settings = {"decimal_separator": ",", "thousands_separator": "."}
        assert format_amount(-1234.56, settings) == "-1.234,56"

    def test_large_number(self):
        """Large numbers get all thousands separators."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(1000000000.50, settings) == "1,000,000,000.50"

    def test_empty_settings_fallback(self):
        """Empty settings dict falls back to US defaults."""
        assert format_amount(1234.56, {}) == "1,234.56"

    def test_decimal_input(self):
        """Accepts Decimal values."""
        settings = {"decimal_separator": ",", "thousands_separator": "."}
        assert format_amount(Decimal("1234.56"), settings) == "1.234,56"

    def test_small_number_no_thousands(self):
        """Small numbers don't get thousands separators."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(42.10, settings) == "42.10"

    def test_zero_decimal_places(self):
        """Custom decimal places = 0."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(1234.56, settings, decimal_places=0) == "1,235"

    def test_integer_input(self):
        """Integer input gets decimal places."""
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        assert format_amount(500, settings) == "500.00"
