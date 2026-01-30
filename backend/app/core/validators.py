"""Custom validators for the application."""

import re

# Phone number pattern: optional + at start, then only digits
_PHONE_PATTERN = re.compile(r"^\+?[0-9]+$")


def validate_phone(value: str | None) -> str | None:
    """Validate phone number format: optional + prefix followed by digits only.

    Returns the value if valid, raises ValueError if invalid.
    Can be used directly in Pydantic field_validator decorators.
    """
    if value is None or value == "":
        return value
    if not _PHONE_PATTERN.match(value):
        raise ValueError(
            "Phone number must contain only digits, optionally starting with +. "
            "Examples: +491234545, 00491234566"
        )
    return value
