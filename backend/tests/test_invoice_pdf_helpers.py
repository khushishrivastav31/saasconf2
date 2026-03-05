"""Unit tests for invoice PDF helper functions.

Tests pure functions in invoice_pdf.py that don't require DB access.
"""

from app.core.invoice_pdf import _iso_to_country_name, _normalize_country_to_iso, _render_items_table


class TestNormalizeCountryToIso:
    """Tests for _normalize_country_to_iso()."""

    def test_iso_code_passthrough(self):
        assert _normalize_country_to_iso("DE") == "DE"

    def test_iso_code_lowercase(self):
        assert _normalize_country_to_iso("de") == "DE"

    def test_full_name_germany(self):
        assert _normalize_country_to_iso("Germany") == "DE"

    def test_full_name_netherlands(self):
        assert _normalize_country_to_iso("Netherlands") == "NL"

    def test_full_name_united_kingdom(self):
        assert _normalize_country_to_iso("United Kingdom") == "GB"

    def test_full_name_case_insensitive(self):
        assert _normalize_country_to_iso("germany") == "DE"
        assert _normalize_country_to_iso("NETHERLANDS") == "NL"

    def test_unknown_passthrough(self):
        assert _normalize_country_to_iso("Atlantis") == "Atlantis"

    def test_empty_string(self):
        assert _normalize_country_to_iso("") == ""

    def test_whitespace_stripped(self):
        assert _normalize_country_to_iso("  DE  ") == "DE"
        assert _normalize_country_to_iso("  Germany  ") == "DE"


class TestIsoToCountryName:
    """Tests for _iso_to_country_name()."""

    def test_known_code(self):
        assert _iso_to_country_name("NL") == "Netherlands"

    def test_known_code_lowercase(self):
        assert _iso_to_country_name("de") == "Germany"

    def test_full_name_passthrough(self):
        assert _iso_to_country_name("Netherlands") == "Netherlands"

    def test_unknown_code_passthrough(self):
        assert _iso_to_country_name("XX") == "XX"

    def test_empty_string(self):
        assert _iso_to_country_name("") == ""


class TestRenderItemsTable:
    """Tests for _render_items_table()."""

    def test_empty_items(self):
        result = _render_items_table([])
        assert result == "<p>No items</p>"

    def test_compact_spacing(self):
        items = [{"description": "Test", "quantity": 1, "unit_price": 100, "discount": 0, "total": 100}]
        result = _render_items_table(items)
        assert "padding: 1px 4px;" in result

    def test_line_height(self):
        items = [{"description": "Test", "quantity": 1, "unit_price": 100, "discount": 0, "total": 100}]
        result = _render_items_table(items)
        assert "line-height: 1.1;" in result

    def test_renders_item_data(self):
        items = [{"description": "Conference Fee", "quantity": 2, "unit_price": 250, "discount": 10, "total": 490}]
        result = _render_items_table(items)
        assert "Conference Fee" in result
        assert "250.00 EUR" in result
        assert "-10.00 EUR" in result
        assert "490.00 EUR" in result

    def test_currency_appended(self):
        items = [{"description": "Test", "quantity": 1, "unit_price": 100, "discount": 0, "total": 100}]
        result = _render_items_table(items, currency="USD")
        assert "100.00 USD" in result

    def test_discount_zero_shows_dash(self):
        items = [{"description": "Item", "quantity": 1, "unit_price": 100, "discount": 0, "total": 100}]
        result = _render_items_table(items)
        # Discount column shows "-" when discount is 0
        assert ">-<" in result
