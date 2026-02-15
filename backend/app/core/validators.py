"""Custom validators for the application."""

import phonenumbers


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
            raise ValueError(
                "Invalid phone number. Use international format with country code, "
                "e.g. +49123456789"
            )
        return phonenumbers.format_number(
            parsed, phonenumbers.PhoneNumberFormat.E164
        )
    except phonenumbers.NumberParseException as e:
        raise ValueError(
            "Invalid phone number format. Use international format with country code, "
            "e.g. +49123456789"
        ) from e
