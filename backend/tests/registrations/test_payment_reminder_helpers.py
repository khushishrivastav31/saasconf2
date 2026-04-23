"""Tests for payment reminder helper functions in app/core/payment_reminder_service.py."""

from unittest.mock import MagicMock

from app.core.default_settings import DEFAULT_PAYMENT_REMINDER_SETTINGS
from app.core.payment_reminder_service import _format_amount, _get_reminder_settings

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_conference(settings: dict | None = None) -> MagicMock:
    """Create a mock Conference with optional settings."""
    conference = MagicMock()
    conference.settings = settings
    return conference


def _make_invoice(total: float | None = None) -> MagicMock:
    """Create a mock Invoice with a total."""
    invoice = MagicMock()
    invoice.total = total
    return invoice


# ---------------------------------------------------------------------------
# _get_reminder_settings
# ---------------------------------------------------------------------------


class TestGetReminderSettings:
    """Tests for _get_reminder_settings()."""

    def test_defaults_when_no_settings(self) -> None:
        conference = _make_conference(settings=None)
        result = _get_reminder_settings(conference)

        assert result == DEFAULT_PAYMENT_REMINDER_SETTINGS
        assert result["payment_reminders_enabled"] is True
        assert result["first_reminder_days"] == 2
        assert result["second_reminder_days"] == 17
        assert result["notify_admin_after_second"] is True

    def test_defaults_when_empty_settings(self) -> None:
        conference = _make_conference(settings={})
        result = _get_reminder_settings(conference)

        assert result == DEFAULT_PAYMENT_REMINDER_SETTINGS

    def test_custom_values(self) -> None:
        conference = _make_conference(
            settings={
                "payment_reminders": {
                    "payment_reminders_enabled": False,
                    "first_reminder_days": 5,
                    "second_reminder_days": 30,
                    "notify_admin_after_second": False,
                },
            }
        )
        result = _get_reminder_settings(conference)

        assert result["payment_reminders_enabled"] is False
        assert result["first_reminder_days"] == 5
        assert result["second_reminder_days"] == 30
        assert result["notify_admin_after_second"] is False

    def test_partial_override(self) -> None:
        conference = _make_conference(
            settings={
                "payment_reminders": {
                    "first_reminder_days": 10,
                },
            }
        )
        result = _get_reminder_settings(conference)

        # Overridden key
        assert result["first_reminder_days"] == 10
        # Defaults for the rest
        assert result["payment_reminders_enabled"] is True
        assert result["second_reminder_days"] == 17
        assert result["notify_admin_after_second"] is True


# ---------------------------------------------------------------------------
# _format_amount
# ---------------------------------------------------------------------------


class TestFormatAmount:
    """Tests for _format_amount()."""

    def test_normal(self) -> None:
        invoice = _make_invoice(total=99.50)
        assert _format_amount(invoice) == "99.50"

    def test_none_returns_zero(self) -> None:
        invoice = _make_invoice(total=None)
        assert _format_amount(invoice) == "0.00"

    def test_large_number_with_commas(self) -> None:
        invoice = _make_invoice(total=1234567.89)
        result = _format_amount(invoice)
        assert result == "1,234,567.89"

    def test_integer_total(self) -> None:
        invoice = _make_invoice(total=500)
        assert _format_amount(invoice) == "500.00"

    def test_small_amount(self) -> None:
        invoice = _make_invoice(total=0.01)
        assert _format_amount(invoice) == "0.01"
