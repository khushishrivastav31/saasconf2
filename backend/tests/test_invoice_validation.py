"""Tests for app/core/invoice_validation.py — validate_recipient_fields."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core.invoice_validation import validate_recipient_fields


def _make_recipient(**overrides):
    """Build a SimpleNamespace with all recipient fields, applying overrides."""
    defaults = {
        "recipient_name": "Acme Corp",
        "recipient_address_line1": "123 Main St",
        "recipient_city": "Berlin",
        "recipient_postal_code": "10115",
        "recipient_country": "DE",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestValidateRecipientFields:
    def test_all_fields_present_passes(self):
        """No exception when every required field is populated."""
        obj = _make_recipient()
        validate_recipient_fields(obj)  # should not raise

    def test_missing_name_raises_400(self):
        """HTTPException 400 when recipient_name is None."""
        obj = _make_recipient(recipient_name=None)
        with pytest.raises(HTTPException) as exc_info:
            validate_recipient_fields(obj)
        assert exc_info.value.status_code == 400
        assert "Recipient name" in exc_info.value.detail

    def test_missing_multiple_fields_lists_all(self):
        """All missing field labels appear in the error detail."""
        obj = _make_recipient(
            recipient_name=None,
            recipient_city=None,
            recipient_country=None,
        )
        with pytest.raises(HTTPException) as exc_info:
            validate_recipient_fields(obj)
        detail = exc_info.value.detail
        assert "Recipient name" in detail
        assert "City" in detail
        assert "Country" in detail

    def test_empty_string_treated_as_missing(self):
        """An empty string is falsy and should be treated as missing."""
        obj = _make_recipient(recipient_postal_code="")
        with pytest.raises(HTTPException) as exc_info:
            validate_recipient_fields(obj)
        assert exc_info.value.status_code == 400
        assert "Postal code" in exc_info.value.detail

    def test_whitespace_only_passes(self):
        """A whitespace-only string is truthy, so it passes the `not` check."""
        obj = _make_recipient(recipient_name="   ")
        # Should NOT raise — the function uses `not obj.field`, and "   " is truthy
        validate_recipient_fields(obj)
