"""Custom validators for the application."""

import re

import phonenumbers

# Simple email regex: local@domain.tld
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def validate_email(value: str | None) -> str | None:
    """Validate email format.

    Uses a simple regex check for proper email format.
    Can be used directly in Pydantic field_validator decorators.
    """
    if value is None or value == "":
        return value
    if not _EMAIL_RE.match(value):
        raise ValueError("Invalid email address format")
    return value.strip().lower()


def validate_phone(value: str | None) -> str | None:
    """Validate and normalize phone number to E.164 format.

    Uses libphonenumber for proper international phone validation.
    Requires international format with country code (e.g. +49123456789).

    Returns the E.164 normalized value if valid, raises ValueError if invalid.
    Can be used directly in Pydantic field_validator decorators.
    """
    if value is None or value == "":
        return value
    try:
        parsed = phonenumbers.parse(value, None)
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError("Invalid phone number. Use international format with country code, e.g. +49123456789")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException as e:
        raise ValueError(
            "Invalid phone number format. Use international format with country code, e.g. +49123456789"
        ) from e
