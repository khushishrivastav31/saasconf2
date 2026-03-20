"""Unit tests for extracted invoice PDF submodules.

Tests pure functions in invoice_pdf_placeholders.py and invoice_pdf_normalize.py
that don't require DB access.
"""

from decimal import Decimal

import pytest

from app.core.invoice_pdf_placeholders import (
    _format_address,
    _format_notes_for_html,
    _format_recipient_address_from_parts,
    _iso_to_country_name,
    _normalize_country_to_iso,
    _resolve_bank_info,
    build_company_replacements,
    build_dual_currency_replacements,
)
from app.core.invoice_pdf_normalize import (
    _compute_fixed_block_padding,
    _get_content_width_px,
    _get_image_scale_factor,
    _get_page_size_css,
    _normalize_image_widths,
    _normalize_table_widths,
    _preserve_empty_paragraphs,
    normalize_html_for_pdf,
)


# ---------------------------------------------------------------------------
# invoice_pdf_placeholders.py
# ---------------------------------------------------------------------------


class TestFormatNotesForHtml:
    """Tests for _format_notes_for_html()."""

    def test_none_returns_empty(self):
        assert _format_notes_for_html(None) == ""

    def test_empty_string_returns_empty(self):
        assert _format_notes_for_html("") == ""

    def test_plain_text_wrapped_in_pre(self):
        result = _format_notes_for_html("Hello world")
        assert "<pre" in result
        assert "Hello world" in result
        assert "white-space: pre-wrap" in result

    def test_plain_text_preserves_newlines(self):
        result = _format_notes_for_html("Line 1\nLine 2")
        assert "Line 1\nLine 2" in result
        assert "<pre" in result

    def test_html_content_passed_through(self):
        html = "<p>Some <strong>bold</strong> text</p>"
        assert _format_notes_for_html(html) == html

    def test_plain_text_escapes_ampersand(self):
        result = _format_notes_for_html("Tom & Jerry")
        assert "&amp;" in result
        assert "Tom &amp; Jerry" in result

    def test_plain_text_escapes_angle_brackets(self):
        # Text that contains < but not in a tag-like pattern (no matching >)
        # Actually, the check is `"<" in notes and ">" in notes` so "a < b > c"
        # would be treated as HTML.  Test a string with only <
        result = _format_notes_for_html("a < b")
        assert "<pre" in result
        assert "&lt;" in result

    def test_html_like_content_with_tags_returned_as_is(self):
        html = "<div>content</div>"
        assert _format_notes_for_html(html) == html


class TestResolveBankInfo:
    """Tests for _resolve_bank_info()."""

    def test_default_account_preferred(self):
        company_info = {
            "bank_accounts": [
                {"bank_name": "First Bank", "iban": "DE111", "bic": "BIC1", "is_default": False},
                {"bank_name": "Default Bank", "iban": "DE222", "bic": "BIC2", "is_default": True},
            ]
        }
        name, iban, bic = _resolve_bank_info(company_info)
        assert name == "Default Bank"
        assert iban == "DE222"
        assert bic == "BIC2"

    def test_first_account_when_no_default(self):
        company_info = {
            "bank_accounts": [
                {"bank_name": "First Bank", "iban": "DE111", "bic": "BIC1"},
            ]
        }
        name, iban, bic = _resolve_bank_info(company_info)
        assert name == "First Bank"
        assert iban == "DE111"

    def test_legacy_fields_fallback(self):
        company_info = {
            "bank_name": "Legacy Bank",
            "iban": "LEGACY_IBAN",
            "bic": "LEGACY_BIC",
        }
        name, iban, bic = _resolve_bank_info(company_info)
        assert name == "Legacy Bank"
        assert iban == "LEGACY_IBAN"
        assert bic == "LEGACY_BIC"

    def test_empty_bank_accounts_uses_legacy(self):
        company_info = {
            "bank_accounts": [],
            "bank_name": "Legacy",
            "iban": "LI1",
            "bic": "LB1",
        }
        name, iban, bic = _resolve_bank_info(company_info)
        assert name == "Legacy"

    def test_no_bank_info_returns_empty(self):
        name, iban, bic = _resolve_bank_info({})
        assert name == ""
        assert iban == ""
        assert bic == ""

    def test_none_bic_returns_empty_string(self):
        company_info = {
            "bank_accounts": [
                {"bank_name": "Bank", "iban": "DE123", "bic": None, "is_default": True},
            ]
        }
        _, _, bic = _resolve_bank_info(company_info)
        assert bic == ""


class TestFormatAddress:
    """Tests for _format_address()."""

    def test_address_field_used_when_present(self):
        info = {
            "address": "123 Main St",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "Germany",
        }
        result = _format_address(info)
        assert "123 Main St" in result
        assert "10115 Berlin" in result
        assert "Germany" in result
        # address_line1/line2 should not appear even if set
        parts = result.split("<br>")
        assert len(parts) == 3

    def test_address_line_fallback(self):
        info = {
            "address_line1": "Street A",
            "address_line2": "Floor 3",
            "postal_code": "1000",
            "city": "Brussels",
            "country": "Belgium",
        }
        result = _format_address(info)
        assert "Street A" in result
        assert "Floor 3" in result
        assert "1000 Brussels" in result
        assert "Belgium" in result

    def test_empty_parts_omitted(self):
        info = {
            "address_line1": "Street A",
            "postal_code": "",
            "city": "",
        }
        result = _format_address(info)
        assert result == "Street A"

    def test_minimal_info(self):
        result = _format_address({})
        assert result == ""


class TestFormatRecipientAddressFromParts:
    """Tests for _format_recipient_address_from_parts()."""

    def test_full_address(self):
        result = _format_recipient_address_from_parts(
            "123 Main St", "Apt 4", "10115", "Berlin", "DE"
        )
        assert "123 Main St" in result
        assert "Apt 4" in result
        assert "10115 Berlin" in result
        assert "Germany" in result  # ISO converted to name

    def test_none_parts_omitted(self):
        result = _format_recipient_address_from_parts("Street", None, "1000", "City", None)
        parts = result.split("<br>")
        assert len(parts) == 2
        assert parts[0] == "Street"
        assert "1000 City" in parts[1]

    def test_unknown_iso_passed_through(self):
        result = _format_recipient_address_from_parts(None, None, None, None, "XX")
        assert "XX" in result

    def test_all_none(self):
        result = _format_recipient_address_from_parts(None, None, None, None, None)
        assert result == ""

    def test_country_name_conversion(self):
        result = _format_recipient_address_from_parts(None, None, None, None, "NL")
        assert "Netherlands" in result


class TestBuildCompanyReplacements:
    """Tests for build_company_replacements()."""

    def _base_company_info(self) -> dict:
        return {
            "name": "ACME Corp",
            "address": "1 Test Rd",
            "city": "Vienna",
            "postal_code": "1010",
            "country": "AT",
            "tax_id": "ATU12345678",
            "bank_accounts": [
                {"bank_name": "TestBank", "iban": "AT00", "bic": "TBAT", "is_default": True}
            ],
            "footer_text": "Thank you",
        }

    def test_basic_keys(self):
        replacements = build_company_replacements(
            self._base_company_info(),
            fiscal_rep=None,
            logo_html="<img src='logo'>",
            contact_email="info@acme.com",
            phone="+43 1 234",
            primary_currency="EUR",
            second_currency="USD",
            settings={},
        )
        assert replacements["[COMPANY_NAME]"] == "ACME Corp"
        assert replacements["[COMPANY_LOGO]"] == "<img src='logo'>"
        assert replacements["[CONTACT_EMAIL]"] == "info@acme.com"
        assert replacements["[CONTACT EMAIL]"] == "info@acme.com"
        assert replacements["[PHONE]"] == "+43 1 234"
        assert replacements["[TELEFON]"] == "+43 1 234"
        assert replacements["[CURRENCY]"] == "EUR"
        assert replacements["[SECOND_CURRENCY]"] == "USD"
        assert replacements["[BANK_NAME]"] == "TestBank"
        assert replacements["[BANK NAME]"] == "TestBank"
        assert replacements["[IBAN]"] == "AT00"
        assert replacements["[BIC]"] == "TBAT"
        assert replacements["[FOOTER_TEXT]"] == "Thank you"

    def test_fiscal_rep_fields(self):
        # Create a mock fiscal rep with the needed attributes
        class FakeRep:
            company_name = "FiscalCo"
            address_line1 = "Fiscal St 1"
            address_line2 = "Suite 5"
            city = "Zurich"
            postal_code = "8001"
            country = "CH"
            conference_vat_number = "CHE-123"
            vat_number = "CHE-456"

        rep = FakeRep()
        replacements = build_company_replacements(
            self._base_company_info(),
            fiscal_rep=rep,
            logo_html="",
            contact_email="",
            phone="",
            primary_currency="EUR",
            second_currency="",
            settings={},
        )
        assert replacements["[FISCAL_REP_NAME]"] == "FiscalCo"
        assert "Fiscal St 1" in replacements["[FISCAL_REP_ADDRESS]"]
        assert "Suite 5" in replacements["[FISCAL_REP_ADDRESS]"]
        assert replacements["[FISCAL_REP_VAT]"] == "CHE-123"
        assert replacements["[FISCAL_REP_COUNTRY]"] == "CH"

    def test_vat_source_fiscal_rep(self):
        class FakeRep:
            company_name = "FR"
            address_line1 = ""
            address_line2 = ""
            city = ""
            postal_code = ""
            country = ""
            conference_vat_number = "FR-VAT"
            vat_number = ""

        info = self._base_company_info()
        info["vat_source"] = "fiscal_rep"
        replacements = build_company_replacements(
            info,
            fiscal_rep=FakeRep(),
            logo_html="",
            contact_email="",
            phone="",
            primary_currency="EUR",
            second_currency="",
            settings={},
        )
        assert replacements["[COMPANY_TAX_ID]"] == "FR-VAT"

    def test_no_fiscal_rep_empty_fields(self):
        replacements = build_company_replacements(
            self._base_company_info(),
            fiscal_rep=None,
            logo_html="",
            contact_email="",
            phone="",
            primary_currency="EUR",
            second_currency="",
            settings={},
        )
        assert replacements["[FISCAL_REP_NAME]"] == ""
        assert replacements["[FISCAL_REP_VAT]"] == ""
        assert replacements["[FISCAL_REP_ADDRESS]"] == ""


class TestBuildDualCurrencyReplacements:
    """Tests for build_dual_currency_replacements()."""

    def test_with_exchange_rate(self):
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        result = build_dual_currency_replacements(
            subtotal=100,
            tax_amount=20,
            total=120,
            exchange_rate=Decimal("1.1"),
            settings=settings,
        )
        assert result["[SECOND_TOTAL]"] != ""
        assert result["[SECOND_SUBTOTAL]"] != ""
        assert result["[SECOND_TAX_AMOUNT]"] != ""

    def test_no_exchange_rate_returns_empty(self):
        settings = {}
        result = build_dual_currency_replacements(
            subtotal=100,
            tax_amount=20,
            total=120,
            exchange_rate=None,
            settings=settings,
        )
        assert result["[SECOND_TOTAL]"] == ""
        assert result["[SECOND_SUBTOTAL]"] == ""
        assert result["[SECOND_TAX_AMOUNT]"] == ""

    def test_zero_values_return_empty(self):
        settings = {}
        result = build_dual_currency_replacements(
            subtotal=0,
            tax_amount=0,
            total=0,
            exchange_rate=Decimal("1.5"),
            settings=settings,
        )
        assert result["[SECOND_TOTAL]"] == ""
        assert result["[SECOND_SUBTOTAL]"] == ""
        assert result["[SECOND_TAX_AMOUNT]"] == ""

    def test_decimal_inputs(self):
        settings = {"decimal_separator": ".", "thousands_separator": ","}
        result = build_dual_currency_replacements(
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("19.00"),
            total=Decimal("119.00"),
            exchange_rate=Decimal("2.0"),
            settings=settings,
        )
        # total * 2.0 = 238.00
        assert "238" in result["[SECOND_TOTAL]"]


# ---------------------------------------------------------------------------
# invoice_pdf_normalize.py
# ---------------------------------------------------------------------------


class TestGetPageSizeCss:
    """Tests for _get_page_size_css()."""

    def test_a4(self):
        assert _get_page_size_css("A4") == "A4"

    def test_letter(self):
        assert _get_page_size_css("Letter") == "letter"

    def test_a5(self):
        assert _get_page_size_css("A5") == "A5"

    def test_legal(self):
        assert _get_page_size_css("Legal") == "legal"

    def test_b5(self):
        assert _get_page_size_css("B5") == "B5"

    def test_tabloid(self):
        assert _get_page_size_css("Tabloid") == "11in 17in"

    def test_unknown_defaults_to_a4(self):
        assert _get_page_size_css("Unknown") == "A4"

    def test_empty_defaults_to_a4(self):
        assert _get_page_size_css("") == "A4"


class TestGetImageScaleFactor:
    """Tests for _get_image_scale_factor()."""

    def test_a4_returns_ratio_less_than_one(self):
        factor = _get_image_scale_factor("A4")
        assert 0 < factor < 1

    def test_a4_value(self):
        # A4 = 210mm, content = 170mm, ratio = 170/210
        factor = _get_image_scale_factor("A4")
        assert abs(factor - 170 / 210) < 0.001

    def test_letter_value(self):
        # Letter = 215.9mm, content = 175.9mm, ratio = 175.9/215.9
        factor = _get_image_scale_factor("Letter")
        assert abs(factor - 175.9 / 215.9) < 0.001

    def test_unknown_format_uses_a4(self):
        assert _get_image_scale_factor("Unknown") == _get_image_scale_factor("A4")


class TestGetContentWidthPx:
    """Tests for _get_content_width_px()."""

    def test_a4_returns_int(self):
        result = _get_content_width_px("A4")
        assert isinstance(result, int)

    def test_a4_value(self):
        # 170mm * 96/25.4 ≈ 642
        result = _get_content_width_px("A4")
        assert result == int(170 * 96 / 25.4)

    def test_letter_value(self):
        result = _get_content_width_px("Letter")
        assert result == int(175.9 * 96 / 25.4)

    def test_unknown_uses_a4(self):
        assert _get_content_width_px("Foo") == _get_content_width_px("A4")


class TestNormalizeImageWidths:
    """Tests for _normalize_image_widths()."""

    def test_width_attr_converted_to_css(self):
        html = '<img src="pic.png" width="200">'
        result = _normalize_image_widths(html, scale=1.0)
        assert 'width="200"' not in result
        assert "width: 200px" in result

    def test_width_scaled(self):
        html = '<img src="pic.png" width="200">'
        result = _normalize_image_widths(html, scale=0.5)
        assert "width: 100px" in result

    def test_img_without_width_gets_max_constraints(self):
        html = '<img src="pic.png">'
        result = _normalize_image_widths(html, content_width_px=600)
        assert "max-width: 600px" in result
        assert "max-height: 250px" in result

    def test_img_without_width_no_content_px(self):
        html = '<img src="pic.png">'
        result = _normalize_image_widths(html, content_width_px=0)
        assert "max-width: 100%" in result

    def test_existing_style_preserved(self):
        html = '<img src="pic.png" width="300" style="border: 1px solid;">'
        result = _normalize_image_widths(html, scale=1.0)
        assert "border: 1px solid;" in result
        assert "width: 300px" in result

    def test_no_img_tags_unchanged(self):
        html = "<p>No images here</p>"
        assert _normalize_image_widths(html) == html

    def test_minimum_width_is_one(self):
        html = '<img src="pic.png" width="1">'
        result = _normalize_image_widths(html, scale=0.01)
        assert "width: 1px" in result


class TestNormalizeTableWidths:
    """Tests for _normalize_table_widths()."""

    def test_pixel_widths_to_percentages(self):
        html = '<colgroup><col style="width: 100px"><col style="width: 300px"></colgroup>'
        result = _normalize_table_widths(html)
        assert "25.0%" in result
        assert "75.0%" in result

    def test_colwidth_attribute_removed(self):
        html = '<td colwidth="200">data</td>'
        result = _normalize_table_widths(html)
        assert "colwidth" not in result

    def test_no_colgroup_unchanged(self):
        html = "<table><tr><td>data</td></tr></table>"
        assert _normalize_table_widths(html) == html

    def test_td_inline_width_stripped(self):
        html = '<td style="width: 200px; color: red;">data</td>'
        result = _normalize_table_widths(html)
        # The width should be removed but color preserved
        assert "200px" not in result

    def test_equal_columns(self):
        html = '<colgroup><col style="width: 150px"><col style="width: 150px"><col style="width: 150px"></colgroup>'
        result = _normalize_table_widths(html)
        assert "33.3%" in result


class TestPreserveEmptyParagraphs:
    """Tests for _preserve_empty_paragraphs()."""

    def test_empty_p_gets_nbsp(self):
        assert _preserve_empty_paragraphs("<p></p>") == "<p>&nbsp;</p>"

    def test_p_with_only_whitespace(self):
        assert _preserve_empty_paragraphs("<p>  </p>") == "<p>&nbsp;</p>"

    def test_p_with_br_gets_nbsp(self):
        assert _preserve_empty_paragraphs("<p><br></p>") == "<p>&nbsp;</p>"
        assert _preserve_empty_paragraphs("<p><br/></p>") == "<p>&nbsp;</p>"
        assert _preserve_empty_paragraphs("<p><br /></p>") == "<p>&nbsp;</p>"

    def test_p_with_content_unchanged(self):
        html = "<p>Hello world</p>"
        assert _preserve_empty_paragraphs(html) == html

    def test_multiple_empty_paragraphs(self):
        html = "<p></p><p>text</p><p></p>"
        result = _preserve_empty_paragraphs(html)
        assert result == "<p>&nbsp;</p><p>text</p><p>&nbsp;</p>"


class TestComputeFixedBlockPadding:
    """Tests for _compute_fixed_block_padding()."""

    def test_top_simple_text(self):
        result = _compute_fixed_block_padding("<p>Header text</p>", "top")
        assert "padding-top: 1.5cm" in result

    def test_top_with_table(self):
        result = _compute_fixed_block_padding("<table><tr><td>Logo</td></tr></table>", "top")
        assert "padding-top: 2cm" in result

    def test_top_with_image(self):
        result = _compute_fixed_block_padding('<img src="logo.png">', "top")
        assert "padding-top: 2cm" in result

    def test_bottom_minimum_2cm(self):
        result = _compute_fixed_block_padding("<p>x</p>", "bottom")
        assert "padding-bottom:" in result
        # Extract the cm value
        import re

        match = re.search(r"padding-bottom:\s*([\d.]+)cm", result)
        assert match
        assert float(match.group(1)) >= 2.0

    def test_bottom_with_table_rows(self):
        html = "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"
        result = _compute_fixed_block_padding(html, "bottom")
        import re

        match = re.search(r"padding-bottom:\s*([\d.]+)cm", result)
        assert match
        val = float(match.group(1))
        assert val >= 2.0

    def test_bottom_max_8cm(self):
        # Many rows to push padding high
        rows = "<tr><td>x</td></tr>" * 50
        html = f"<table>{rows}</table>"
        result = _compute_fixed_block_padding(html, "bottom")
        import re

        match = re.search(r"padding-bottom:\s*([\d.]+)cm", result)
        assert match
        assert float(match.group(1)) <= 8.0

    def test_bottom_plain_text_no_tags(self):
        # Text with no block tags — uses character count heuristic
        result = _compute_fixed_block_padding("Just some footer text", "bottom")
        assert "padding-bottom:" in result


class TestNormalizeHtmlForPdf:
    """Tests for normalize_html_for_pdf() integration."""

    def test_applies_empty_paragraph_preservation(self):
        result = normalize_html_for_pdf("<p></p>", "A4")
        assert "&nbsp;" in result

    def test_applies_image_normalization(self):
        html = '<img src="x.png" width="400">'
        result = normalize_html_for_pdf(html, "A4")
        assert 'width="400"' not in result
        assert "width:" in result

    def test_applies_table_normalization(self):
        html = '<colgroup><col style="width: 100px"><col style="width: 100px"></colgroup>'
        result = normalize_html_for_pdf(html, "A4")
        assert "50.0%" in result

    def test_different_formats_produce_different_scaling(self):
        html = '<img src="x.png" width="500">'
        a4 = normalize_html_for_pdf(html, "A4")
        letter = normalize_html_for_pdf(html, "Letter")
        # Both should have the width converted but to different values
        assert "width:" in a4
        assert "width:" in letter

    def test_passthrough_for_plain_text(self):
        html = "<p>No special elements</p>"
        result = normalize_html_for_pdf(html, "A4")
        assert "No special elements" in result
