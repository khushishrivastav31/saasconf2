"""Currency-to-number-format mapping.

Provides suggested number formatting based on currency code.
"""

from dataclasses import dataclass


@dataclass
class NumberFormat:
    """Number format settings."""

    decimal_separator: str
    thousands_separator: str
    currency_position: str  # "before" or "after"
    decimal_places: int = 2


# Named format presets for dropdown selection
FORMAT_PRESETS: dict[str, tuple[str, NumberFormat]] = {
    "us_uk": ("US/UK (1,234.56)", NumberFormat(".", ",", "before")),
    "european": ("European (1.234,56)", NumberFormat(",", ".", "after")),
    "swiss": ("Swiss (1'234.56)", NumberFormat(".", "'", "before")),
    "french": ("French (1 234,56)", NumberFormat(",", " ", "after")),
    "indian": ("Indian (1,23,456.78)", NumberFormat(".", ",", "before")),
    "no_separator": ("No separator (1234.56)", NumberFormat(".", "", "before")),
}


def get_preset_list() -> list[dict]:
    """Get list of format presets for dropdown.

    Returns:
        List of dicts with code, label, and format details
    """
    return [
        {
            "code": code,
            "label": label,
            "decimal_separator": fmt.decimal_separator,
            "thousands_separator": fmt.thousands_separator,
            "currency_position": fmt.currency_position,
            "decimal_places": fmt.decimal_places,
        }
        for code, (label, fmt) in FORMAT_PRESETS.items()
    ]


def get_preset_format(preset_code: str) -> NumberFormat | None:
    """Get format for a preset code.

    Args:
        preset_code: Preset identifier (e.g., "us_uk", "european")

    Returns:
        NumberFormat or None if not found
    """
    preset = FORMAT_PRESETS.get(preset_code)
    return preset[1] if preset else None


# Common number formats for currencies
# Based on ISO 4217 currency codes and regional conventions
CURRENCY_FORMATS: dict[str, NumberFormat] = {
    # European - comma decimal, period/space thousands, symbol after
    "EUR": NumberFormat(",", ".", "after"),
    "CHF": NumberFormat(",", "'", "before"),  # Swiss franc uses apostrophe
    "SEK": NumberFormat(",", " ", "after"),
    "NOK": NumberFormat(",", " ", "after"),
    "DKK": NumberFormat(",", ".", "after"),
    "PLN": NumberFormat(",", " ", "after"),
    "CZK": NumberFormat(",", " ", "after"),
    "HUF": NumberFormat(",", " ", "after", 0),  # No decimals
    "RON": NumberFormat(",", ".", "after"),
    "BGN": NumberFormat(",", " ", "after"),
    "HRK": NumberFormat(",", ".", "after"),
    "RSD": NumberFormat(",", ".", "after"),
    # Anglo-Saxon - period decimal, comma thousands, symbol before
    "USD": NumberFormat(".", ",", "before"),
    "GBP": NumberFormat(".", ",", "before"),
    "CAD": NumberFormat(".", ",", "before"),
    "AUD": NumberFormat(".", ",", "before"),
    "NZD": NumberFormat(".", ",", "before"),
    "SGD": NumberFormat(".", ",", "before"),
    "HKD": NumberFormat(".", ",", "before"),
    "ZAR": NumberFormat(".", " ", "before"),
    # Asian
    "JPY": NumberFormat(".", ",", "before", 0),  # No decimals
    "CNY": NumberFormat(".", ",", "before"),
    "KRW": NumberFormat(".", ",", "before", 0),  # No decimals
    "INR": NumberFormat(".", ",", "before"),
    "THB": NumberFormat(".", ",", "before"),
    "MYR": NumberFormat(".", ",", "before"),
    "IDR": NumberFormat(",", ".", "before", 0),
    "PHP": NumberFormat(".", ",", "before"),
    "VND": NumberFormat(",", ".", "after", 0),  # No decimals
    # Latin America
    "BRL": NumberFormat(",", ".", "before"),
    "MXN": NumberFormat(".", ",", "before"),
    "ARS": NumberFormat(",", ".", "before"),
    "CLP": NumberFormat(",", ".", "before", 0),  # No decimals
    "COP": NumberFormat(",", ".", "before", 0),
    "PEN": NumberFormat(".", ",", "before"),
    # Middle East / Africa
    "AED": NumberFormat(".", ",", "before"),
    "SAR": NumberFormat(".", ",", "before"),
    "ILS": NumberFormat(".", ",", "before"),
    "TRY": NumberFormat(",", ".", "after"),
    "EGP": NumberFormat(".", ",", "before"),
    "NGN": NumberFormat(".", ",", "before"),
    "KES": NumberFormat(".", ",", "before"),
    # Eastern Europe / Russia
    "RUB": NumberFormat(",", " ", "after"),
    "UAH": NumberFormat(",", " ", "after"),
    # Other
    "TWD": NumberFormat(".", ",", "before"),
    "ISK": NumberFormat(",", ".", "after", 0),  # No decimals
}

# Default format for unknown currencies (US/UK style)
DEFAULT_FORMAT = NumberFormat(".", ",", "before")


def get_suggested_format(currency_code: str | None) -> NumberFormat:
    """Get suggested number format for a currency.

    Args:
        currency_code: ISO 4217 currency code (e.g., "EUR", "USD")

    Returns:
        NumberFormat with suggested settings
    """
    if not currency_code:
        return DEFAULT_FORMAT
    return CURRENCY_FORMATS.get(currency_code.upper(), DEFAULT_FORMAT)


def get_format_as_dict(currency_code: str | None) -> dict:
    """Get suggested number format as a dictionary.

    Args:
        currency_code: ISO 4217 currency code (e.g., "EUR", "USD")

    Returns:
        Dictionary with format settings
    """
    fmt = get_suggested_format(currency_code)
    return {
        "decimal_separator": fmt.decimal_separator,
        "thousands_separator": fmt.thousands_separator,
        "currency_position": fmt.currency_position,
        "decimal_places": fmt.decimal_places,
    }
