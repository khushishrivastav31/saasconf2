"""Invoice validation helpers."""

from typing import Any

from fastapi import HTTPException


def validate_recipient_fields(obj: Any) -> None:
    """Validate required recipient fields for invoices.

    Args:
        obj: Object with recipient fields (Invoice model or InvoiceCreate/InvoiceUpdate schema)

    Raises:
        HTTPException: 400 if required fields are missing
    """
    missing_fields = []

    if not obj.recipient_name:
        missing_fields.append("Recipient name")
    if not obj.recipient_address_line1:
        missing_fields.append("Street address")
    if not obj.recipient_city:
        missing_fields.append("City")
    if not obj.recipient_postal_code:
        missing_fields.append("Postal code")
    if not obj.recipient_country:
        missing_fields.append("Country")

    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )
