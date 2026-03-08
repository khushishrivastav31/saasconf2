"""Shared helpers for invoice API endpoints."""

from app.models.invoice import Invoice
from app.schemas.invoice import InvoiceResponse


def build_invoice_response(
    invoice: Invoice,
    vat_warnings: list | None = None,
    vat_requirement: dict | None = None,
    related_invoice_number: str | None = None,
) -> InvoiceResponse:
    """Build invoice response with events and optional metadata.

    Args:
        invoice: Invoice model instance (with events loaded)
        vat_warnings: Optional VAT validation warnings
        vat_requirement: Optional VAT requirement details
        related_invoice_number: Optional related invoice number (for credit notes)

    Returns:
        InvoiceResponse with all data populated
    """
    response_data = {
        **invoice.__dict__,
        "events": [event.__dict__ for event in invoice.events] if invoice.events else [],
        "vat_auto_calculated": invoice.vat_auto_calculated,
        # Ensure list fields are not None (Pydantic v2 requirement)
        "line_items": invoice.line_items or [],
        "contact_persons": invoice.contact_persons or [],
    }

    # Add optional fields only if provided
    if vat_warnings is not None:
        response_data["vat_warnings"] = vat_warnings
    if vat_requirement is not None:
        response_data["vat_requirement"] = vat_requirement
    if related_invoice_number is not None:
        response_data["related_invoice_number"] = related_invoice_number

    return InvoiceResponse(**response_data)
