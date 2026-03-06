"""ZUGFeRD/Factur-X XML generation module.

Generates CII (Cross-Industry Invoice) XML from SaaSConf invoice data
using the factur-x library for EN 16931 compliance.
"""

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)


async def generate_zugferd_xml(
    invoice: Any,  # Invoice model
    conference: Any,  # Conference model
    zugferd_settings: dict,
) -> bytes:
    """Generate ZUGFeRD CII XML from invoice data.

    Uses factur-x library for XML structure and validation.
    Returns XML bytes ready for PDF embedding.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        zugferd_settings: ZUGFeRD configuration dict from conference settings

    Returns:
        bytes: Generated XML ready for PDF embedding

    Raises:
        ValueError: If required data is missing or invalid
        RuntimeError: If XML generation fails
    """
    # Map invoice fields to CII XML structure
    xml_data = _map_invoice_to_zugferd(invoice, conference, zugferd_settings)

    # Generate XML using factur-x library (CPU-bound, run in thread pool)
    try:
        from facturx import generate_facturx_from_dict

        xml_bytes = await asyncio.to_thread(
            generate_facturx_from_dict,
            xml_data,
            level=zugferd_settings.get("profile", "EN16931"),
        )

        logger.info(
            f"ZUGFeRD XML generated for invoice {invoice.id}",
            extra={
                "invoice_id": str(invoice.id),
                "profile": zugferd_settings.get("profile"),
                "xml_size": len(xml_bytes),
            },
        )

        return xml_bytes

    except Exception as e:
        logger.error(
            f"ZUGFeRD XML generation failed for invoice {invoice.id}: {e}",
            extra={"invoice_id": str(invoice.id), "error": str(e)},
        )
        raise RuntimeError(f"Failed to generate ZUGFeRD XML: {e}") from e


def _map_invoice_to_zugferd(invoice: Any, conference: Any, settings: dict) -> dict:
    """Map SaaSConf Invoice model to factur-x dict structure.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        settings: ZUGFeRD settings dict

    Returns:
        dict: factur-x compatible data structure
    """
    from app.core.invoice_pdf import (
        _normalize_country_to_iso,
        _resolve_bank_info,
        _resolve_vat_number,
    )

    # Get company info from conference settings
    company_info = (conference.settings or {}).get("invoice_company_info", {})

    # Resolve VAT number (company or fiscal rep)
    vat_number = _resolve_vat_number(company_info)

    # Resolve bank info (from bank_accounts array or legacy fields)
    bank_info = _resolve_bank_info(company_info)

    # Build seller data
    seller_country = _normalize_country_to_iso(company_info.get("country", ""))
    seller_data = {
        "name": company_info.get("name", "Unknown Company"),
        "country_code": seller_country,
    }

    # Add VAT ID (required for ZUGFeRD)
    if vat_number:
        seller_data["vat_id"] = vat_number
    elif settings.get("seller_vat_id"):
        seller_data["vat_id"] = settings["seller_vat_id"]

    # Add seller address
    seller_address: dict[str, Any] = {}
    # Try new single address field first
    if company_info.get("address"):
        seller_address["street"] = company_info["address"]
    # Fallback to legacy address_line1 + address_line2
    elif company_info.get("address_line1"):
        addr_parts = [company_info["address_line1"]]
        if company_info.get("address_line2"):
            addr_parts.append(company_info["address_line2"])
        seller_address["street"] = " ".join(addr_parts)

    if company_info.get("postal_code"):
        seller_address["postal_code"] = company_info["postal_code"]
    if company_info.get("city"):
        seller_address["city"] = company_info["city"]

    if seller_address:
        seller_data["address"] = seller_address

    # Add contact info if available
    if settings.get("seller_contact_email"):
        seller_data["contact_email"] = settings["seller_contact_email"]
    if settings.get("seller_contact_phone") or company_info.get("phone"):
        seller_data["contact_phone"] = settings.get("seller_contact_phone") or company_info.get("phone")

    # Build buyer data
    buyer_country = invoice.recipient_country or ""
    # Ensure buyer country is ISO code (should already be, but validate)
    if len(buyer_country) > 2:
        buyer_country = _normalize_country_to_iso(buyer_country)

    buyer_data = {
        "name": invoice.recipient_name or "Unknown Buyer",
        "country_code": buyer_country,
    }

    # Add buyer VAT ID if available
    if invoice.recipient_vat_number:
        buyer_data["vat_id"] = invoice.recipient_vat_number

    # Add buyer address
    buyer_address: dict[str, Any] = {}
    if invoice.recipient_address_line1:
        addr_parts = [invoice.recipient_address_line1]
        if invoice.recipient_address_line2:
            addr_parts.append(invoice.recipient_address_line2)
        buyer_address["street"] = " ".join(addr_parts)

    if invoice.recipient_postal_code:
        buyer_address["postal_code"] = invoice.recipient_postal_code
    if invoice.recipient_city:
        buyer_address["city"] = invoice.recipient_city

    if buyer_address:
        buyer_data["address"] = buyer_address

    # Convert amounts to float (factur-x expects float, not Decimal)
    subtotal = float(invoice.subtotal) if invoice.subtotal else 0.0
    tax_amount = float(invoice.tax_amount) if invoice.tax_amount else 0.0
    total = float(invoice.total) if invoice.total else 0.0
    tax_rate = float(invoice.tax_rate) if invoice.tax_rate else 0.0

    # Build line items
    line_items = []
    for idx, item in enumerate(invoice.line_items or [], start=1):
        line_item = {
            "line_id": str(idx),
            "name": item.get("description", f"Item {idx}"),
            "quantity": float(item.get("quantity", 1)),
            "unit_price": float(item.get("unit_price", 0)),
            "line_total": float(item.get("total", 0)),
            "tax_category": settings.get("tax_category_code", "S"),
            "tax_percent": tax_rate,
        }
        line_items.append(line_item)

    # Build payment info
    payment_data: dict[str, Any] = {
        "code": settings.get("payment_means_code", "30"),
    }

    # Add bank account if available
    if bank_info.get("iban"):
        payment_data["iban"] = bank_info["iban"]
    if bank_info.get("bic"):
        payment_data["bic"] = bank_info["bic"]

    # Build complete factur-x data structure
    zugferd_data = {
        # Document metadata
        "invoice_number": invoice.invoice_number or "DRAFT",
        "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "invoice_type_code": settings.get("invoice_type_code", "380"),
        "currency": invoice.currency or "EUR",
        # Parties
        "seller": seller_data,
        "buyer": buyer_data,
        # Amounts
        "line_total": subtotal,
        "tax_basis": subtotal,
        "tax_total": tax_amount,
        "grand_total": total,
        # Tax breakdown
        "tax_breakdown": [
            {
                "tax_basis": subtotal,
                "tax_percent": tax_rate,
                "tax_amount": tax_amount,
                "tax_category": settings.get("tax_category_code", "S"),
            }
        ],
        # Line items
        "line_items": line_items,
        # Payment
        "payment_means": payment_data,
        "payment_terms": {
            "code": settings.get("payment_terms_code", "30"),
            "description": f"Net {settings.get('payment_terms_code', '30')} days",
        },
    }

    return zugferd_data
