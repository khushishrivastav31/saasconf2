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

    if not invoice.due_date:
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
        from facturx import check_facturx_pdf

        # Run validation in thread pool (I/O bound operation)
        result = await asyncio.to_thread(check_facturx_pdf, pdf_bytes)

        # factur-x check_facturx_pdf returns different formats depending on version
        # Handle both dict and boolean return types
        if isinstance(result, dict):
            return {
                "valid": result.get("valid", False),
                "profile": result.get("profile"),
                "errors": result.get("errors", []),
                "warnings": result.get("warnings", []),
            }
        elif isinstance(result, bool):
            # Older versions just return True/False
            return {
                "valid": result,
                "profile": None,
                "errors": [] if result else ["Validation failed"],
                "warnings": [],
            }
        else:
            return {
                "valid": False,
                "profile": None,
                "errors": [f"Unexpected validation result type: {type(result)}"],
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
    errors: list[str] = []

    # Check if enabled
    if not settings.get("enabled"):
        return errors  # Not enabled, no validation needed

    # Validate required fields when enabled
    if not settings.get("seller_vat_id"):
        errors.append("seller_vat_id required when ZUGFeRD is enabled")

    # Validate profile
    valid_profiles = ("MINIMUM", "BASIC_WL", "BASIC", "EN16931", "EXTENDED")
    profile = settings.get("profile", "EN16931")
    if profile not in valid_profiles:
        errors.append(f"Invalid profile: {profile}. Must be one of: {', '.join(valid_profiles)}")

    # Validate payment terms code (optional but should be numeric if provided)
    payment_terms = settings.get("payment_terms_code")
    if payment_terms and not str(payment_terms).isdigit():
        errors.append("payment_terms_code should be numeric (e.g., '30' for Net 30 days)")

    # Validate payment means code (UN/CEFACT code list 4461)
    payment_means = settings.get("payment_means_code")
    if payment_means:
        # Common codes: 30=Credit transfer, 48=Card, 49=Direct debit, 1=Cash
        valid_means_codes = ("1", "10", "30", "31", "42", "48", "49", "57", "58", "97")
        if payment_means not in valid_means_codes:
            errors.append(
                f"payment_means_code '{payment_means}' is uncommon. "
                f"Standard codes: 30 (credit transfer), 48 (card), 49 (direct debit)"
            )

    # Validate tax category code (UN/CEFACT 5305)
    tax_category = settings.get("tax_category_code")
    if tax_category:
        valid_tax_codes = ("S", "Z", "E", "AE", "K", "G", "O", "L", "M")
        if tax_category not in valid_tax_codes:
            errors.append(
                f"Invalid tax_category_code: {tax_category}. "
                f"Valid codes: S (standard), Z (zero rated), E (exempt), etc."
            )

    # Validate invoice type code (UN/CEFACT 1001)
    invoice_type = settings.get("invoice_type_code")
    if invoice_type:
        # Common codes: 380=Commercial invoice, 381=Credit note, 384=Corrected invoice
        valid_type_codes = ("380", "381", "384", "389", "751")
        if invoice_type not in valid_type_codes:
            errors.append(
                f"invoice_type_code '{invoice_type}' is uncommon. "
                f"Standard codes: 380 (commercial invoice), 381 (credit note), 384 (corrected)"
            )

    return errors
