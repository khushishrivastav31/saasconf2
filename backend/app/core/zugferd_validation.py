"""ZUGFeRD/Factur-X validation module.

Validates invoice data against ZUGFeRD requirements before XML generation.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


def validate_zugferd_requirements(invoice: Any) -> list[str]:
    """Check if invoice meets ZUGFeRD minimum requirements.

    Args:
        invoice: Invoice model instance with conference relationship loaded

    Returns:
        list[str]: List of error messages (empty list = valid)
    """
    errors: list[str] = []

    # Get company info from conference settings
    company_info = (invoice.conference.settings or {}).get("invoice_company_info", {})

    # Seller requirements
    if not company_info.get("tax_id"):
        errors.append("Missing seller VAT ID (company tax_id in settings)")

    if not company_info.get("country"):
        errors.append("Missing seller country")

    if not company_info.get("name"):
        errors.append("Missing seller company name")

    # Check seller address (either new single field or legacy fields)
    has_address = company_info.get("address") or company_info.get("address_line1")
    if not has_address:
        errors.append("Missing seller address")

    if not company_info.get("city"):
        errors.append("Missing seller city")

    if not company_info.get("postal_code"):
        errors.append("Missing seller postal code")

    # Buyer requirements
    if not invoice.recipient_name:
        errors.append("Missing buyer name")

    if not invoice.recipient_country:
        errors.append("Missing buyer country (required for ZUGFeRD)")
    elif len(invoice.recipient_country) != 2:
        errors.append("Buyer country must be ISO 3166-1 alpha-2 code (e.g., DE, FR)")

    # Buyer address (recommended but not strictly required for all profiles)
    if not invoice.recipient_address_line1:
        errors.append("Missing buyer address (recommended)")

    if not invoice.recipient_city:
        errors.append("Missing buyer city (recommended)")

    # Financial requirements
    if not invoice.currency:
        errors.append("Missing currency code")

    if not invoice.issue_date:
        errors.append("Missing issue date")

    # Due date only required for regular invoices, not credit notes
    if not invoice.due_date and invoice.template_type != "credit_note":
        errors.append("Missing due date (required for payment terms)")

    if not invoice.invoice_number:
        errors.append("Missing invoice number")

    # Line items validation
    if not invoice.line_items:
        errors.append("No line items (minimum 1 required)")
    else:
        for idx, item in enumerate(invoice.line_items, start=1):
            if not item.get("description"):
                errors.append(f"Line item {idx}: missing description")

            if item.get("quantity") is None:
                errors.append(f"Line item {idx}: missing quantity")

            if item.get("unit_price") is None:
                errors.append(f"Line item {idx}: missing unit_price")

    # Amount validation (basic sanity checks)
    if invoice.subtotal is None:
        errors.append("Missing subtotal")

    if invoice.total is None:
        errors.append("Missing total amount")

    # Tax validation
    if invoice.tax_rate is None:
        errors.append("Missing tax rate")

    return errors


async def validate_zugferd_pdf(pdf_bytes: bytes) -> dict:
    """Validate generated ZUGFeRD PDF using factur-x library.

    Args:
        pdf_bytes: PDF file content as bytes

    Returns:
        dict: Validation result with keys:
            - valid (bool): Whether PDF is valid ZUGFeRD
            - profile (str|None): Detected profile (e.g., "EN16931")
            - errors (list[str]): List of error messages
            - warnings (list[str]): List of warning messages
    """
    try:
        import io

        from facturx import get_facturx_level, get_facturx_xml_from_pdf

        # Extract and validate XML from PDF (runs XSD validation)
        # Run in thread pool as it's I/O bound
        pdf_file = io.BytesIO(pdf_bytes)
        result = await asyncio.to_thread(get_facturx_xml_from_pdf, pdf_file, check_xsd=True)

        if result is None:
            return {
                "valid": False,
                "profile": None,
                "errors": ["No ZUGFeRD XML found in PDF"],
                "warnings": [],
            }

        # get_facturx_xml_from_pdf returns tuple: (filename, xml_bytes)
        _xml_filename, xml_bytes = result

        # Parse XML to etree for profile detection
        from lxml import etree

        xml_etree = etree.fromstring(xml_bytes)

        # Get the profile/level (MINIMUM, BASIC, EN16931, EXTENDED)
        profile = await asyncio.to_thread(get_facturx_level, xml_etree)

        return {
            "valid": True,
            "profile": profile,
            "errors": [],
            "warnings": [],
        }

    except ImportError as e:
        logger.error(f"factur-x library not available: {e}")
        return {
            "valid": False,
            "profile": None,
            "errors": ["factur-x library not installed"],
            "warnings": [],
        }
    except Exception as e:
        # XSD validation errors, missing XML, or parsing errors
        logger.error(f"ZUGFeRD PDF validation failed: {e}")
        return {
            "valid": False,
            "profile": None,
            "errors": [str(e)],
            "warnings": [],
        }


def validate_zugferd_settings(settings: dict) -> list[str]:
    """Validate ZUGFeRD settings configuration.

    Args:
        settings: ZUGFeRD settings dict

    Returns:
        list[str]: List of error messages (empty = valid)
    """
    # ZUGFeRD settings now only contains 'enabled' field
    # All other parameters are auto-determined from invoice data
    # No validation needed beyond the enabled flag
    return []
