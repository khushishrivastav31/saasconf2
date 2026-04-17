"""Invoice PDF placeholder resolution and address formatting.

Country code conversion, address formatting, bank/VAT resolution,
and shared placeholder building logic used by both generate functions.
"""

import base64
import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency_formats import format_amount
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.fiscal_representative import FiscalRepresentative

logger = logging.getLogger(__name__)

# Mapping of full country names to ISO 3166-1 alpha-2 codes.
# Matches frontend/src/config/countries.ts COUNTRY_OPTIONS.
_COUNTRY_NAME_TO_ISO: dict[str, str] = {
    "albania": "AL",
    "andorra": "AD",
    "armenia": "AM",
    "australia": "AU",
    "austria": "AT",
    "azerbaijan": "AZ",
    "belarus": "BY",
    "belgium": "BE",
    "bosnia and herzegovina": "BA",
    "brazil": "BR",
    "bulgaria": "BG",
    "canada": "CA",
    "china": "CN",
    "croatia": "HR",
    "cyprus": "CY",
    "czechia": "CZ",
    "denmark": "DK",
    "estonia": "EE",
    "finland": "FI",
    "france": "FR",
    "georgia": "GE",
    "germany": "DE",
    "greece": "GR",
    "hungary": "HU",
    "iceland": "IS",
    "india": "IN",
    "ireland": "IE",
    "israel": "IL",
    "italy": "IT",
    "japan": "JP",
    "latvia": "LV",
    "liechtenstein": "LI",
    "lithuania": "LT",
    "luxembourg": "LU",
    "malta": "MT",
    "moldova": "MD",
    "monaco": "MC",
    "montenegro": "ME",
    "netherlands": "NL",
    "new zealand": "NZ",
    "north macedonia": "MK",
    "norway": "NO",
    "poland": "PL",
    "portugal": "PT",
    "romania": "RO",
    "russia": "RU",
    "serbia": "RS",
    "slovakia": "SK",
    "slovenia": "SI",
    "south korea": "KR",
    "spain": "ES",
    "sweden": "SE",
    "switzerland": "CH",
    "turkey": "TR",
    "ukraine": "UA",
    "united kingdom": "GB",
    "united states": "US",
}


def _normalize_country_to_iso(value: str) -> str:
    """Convert a country name to its ISO 3166-1 alpha-2 code.

    If the value is already a 2-letter code, return it uppercased.
    If it's a known country name, return the corresponding code.
    Otherwise return the original value unchanged (backward compatible).
    """
    if not value:
        return value
    stripped = value.strip()
    if len(stripped) == 2:
        return stripped.upper()
    return _COUNTRY_NAME_TO_ISO.get(stripped.lower(), stripped)


# Reverse mapping: ISO code -> display name (title-cased).
_ISO_TO_COUNTRY_NAME: dict[str, str] = {code: name.title() for name, code in _COUNTRY_NAME_TO_ISO.items()}


def _iso_to_country_name(value: str) -> str:
    """Convert an ISO 3166-1 alpha-2 code to a human-readable country name."""
    if not value:
        return value
    stripped = value.strip().upper()
    return _ISO_TO_COUNTRY_NAME.get(stripped, value.strip())


def _format_notes_for_html(notes: str | None) -> str:
    """Format invoice notes for HTML display, preserving newlines and whitespace."""
    if not notes:
        return ""
    if "<" in notes and ">" in notes:
        return notes
    escaped_notes = notes.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f'<pre style="white-space: pre-wrap; font-family: inherit; font-size: inherit; margin: 0; padding: 0;">{escaped_notes}</pre>'


def _resolve_bank_info(company_info: dict) -> tuple[str, str, str]:
    """Get bank info from array or legacy fields.

    Returns:
        Tuple of (bank_name, iban, bic)
    """
    bank_accounts = company_info.get("bank_accounts", [])

    if bank_accounts:
        default_account = next(
            (acc for acc in bank_accounts if acc.get("is_default")),
            bank_accounts[0] if bank_accounts else None,
        )
        if default_account:
            return (
                default_account.get("bank_name", ""),
                default_account.get("iban", ""),
                default_account.get("bic", "") or "",
            )

    return (
        company_info.get("bank_name", ""),
        company_info.get("iban", ""),
        company_info.get("bic", "") or "",
    )


async def _resolve_vat_number(company_info: dict, conference: Conference, db: AsyncSession) -> str:
    """Get VAT based on vat_source setting."""
    vat_source = company_info.get("vat_source", "company")

    if vat_source == "fiscal_rep":
        result = await db.execute(
            select(FiscalRepresentative)
            .where(FiscalRepresentative.conference_id == conference.id)
            .where(FiscalRepresentative.tenant_id == conference.tenant_id)
        )
        fiscal_rep = result.scalar_one_or_none()
        return fiscal_rep.conference_vat_number if fiscal_rep and fiscal_rep.conference_vat_number else ""
    else:
        return company_info.get("tax_id", "")


def _format_address(company_info: dict) -> str:
    """Format company address as single string with line breaks."""
    if company_info.get("address"):
        parts = [
            company_info.get("address"),
            f"{company_info.get('postal_code', '')} {company_info.get('city', '')}".strip(),
            company_info.get("country"),
        ]
    else:
        parts = [
            company_info.get("address_line1"),
            company_info.get("address_line2"),
            f"{company_info.get('postal_code', '')} {company_info.get('city', '')}".strip(),
            company_info.get("country"),
        ]
    return "<br>".join(p for p in parts if p)


def _format_recipient_address_from_parts(
    address_line1: str | None,
    address_line2: str | None,
    postal_code: str | None,
    city: str | None,
    country: str | None,
) -> str:
    """Format recipient address from individual fields."""
    parts = [
        address_line1,
        address_line2,
        f"{postal_code or ''} {city or ''}".strip(),
        _iso_to_country_name(country) if country else None,
    ]
    return "<br>".join(p for p in parts if p)


def _apply_placeholders(html: str, replacements: dict[str, str]) -> str:
    """Apply all placeholder replacements to an HTML string."""
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html


async def fetch_fiscal_rep_and_logo(
    conference: Conference, db: AsyncSession
) -> tuple[FiscalRepresentative | None, str]:
    """Fetch fiscal representative and logo HTML for a conference.

    Returns:
        Tuple of (fiscal_rep_or_none, logo_html_string)
    """
    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference.id)
        .where(FiscalRepresentative.tenant_id == conference.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()

    logo_html = ""
    if conference.tenant_id:
        logo_result = await db.execute(
            select(Attachment)
            .where(Attachment.entity_type == "tenant_logo")
            .where(Attachment.entity_id == conference.tenant_id)
            .order_by(Attachment.created_at.desc())
            .limit(1)
        )
        logo_attachment = logo_result.scalar_one_or_none()

        if logo_attachment and logo_attachment.file_data:
            import mimetypes

            mime_type = mimetypes.guess_type(logo_attachment.filename)[0] or "image/png"
            logo_base64 = base64.b64encode(logo_attachment.file_data).decode("utf-8")
            logo_data_url = f"data:{mime_type};base64,{logo_base64}"
            logo_html = f'<img src="{logo_data_url}" style="max-width: 150px; height: auto;" alt="Company Logo">'

    return fiscal_rep, logo_html


def build_company_replacements(
    company_info: dict,
    fiscal_rep: FiscalRepresentative | None,
    logo_html: str,
    contact_email: str,
    phone: str,
    primary_currency: str,
    second_currency: str,
    settings: dict,
) -> dict[str, str]:
    """Build the shared portion of the replacements dict (company, fiscal rep, banking, contact).

    This is the part that is identical between generate_invoice_pdf and
    generate_invoice_pdf_from_data.
    """
    bank_name, iban, bic = _resolve_bank_info(company_info)

    company_vat = company_info.get("tax_id", "")
    fiscal_rep_vat = ""
    if fiscal_rep and fiscal_rep.conference_vat_number:
        fiscal_rep_vat = fiscal_rep.conference_vat_number

    vat_source = company_info.get("vat_source", "company")
    legacy_vat_number = fiscal_rep_vat if vat_source == "fiscal_rep" else company_vat

    if fiscal_rep:
        fiscal_rep_address_parts = [
            fiscal_rep.address_line1 or "",
            fiscal_rep.address_line2 or "",
        ]
        fiscal_rep_address = ", ".join(p for p in fiscal_rep_address_parts if p)
    else:
        fiscal_rep_address = ""

    return {
        # Company info
        "[COMPANY_NAME]": company_info.get("name", ""),
        "[COMPANY_ADDRESS]": _format_address(company_info),
        "[COMPANY_CITY]": company_info.get("city", ""),
        "[COMPANY_POSTAL_CODE]": company_info.get("postal_code", ""),
        "[COMPANY_COUNTRY]": _normalize_country_to_iso(company_info.get("country", "")),
        "[COMPANY_TAX_ID]": legacy_vat_number,
        "[COMPANY_VAT]": company_vat,
        "[COMPANY_LOGO]": logo_html,
        # Fiscal representative
        "[FISCAL_REP_NAME]": (fiscal_rep.company_name or "") if fiscal_rep else "",
        "[FISCAL_REP_ADDRESS]": fiscal_rep_address,
        "[FISCAL_REP_CITY]": (fiscal_rep.city or "") if fiscal_rep else "",
        "[FISCAL_REP_POSTAL_CODE]": (fiscal_rep.postal_code or "") if fiscal_rep else "",
        "[FISCAL_REP_COUNTRY]": _normalize_country_to_iso((fiscal_rep.country or "") if fiscal_rep else ""),
        "[FISCAL_REP_VAT]": fiscal_rep_vat,
        "[FISCAL_REP_TAX_ID]": (fiscal_rep.vat_number or "") if fiscal_rep else "",
        # Banking (both underscore and space variants)
        "[BANK_NAME]": bank_name,
        "[BANK NAME]": bank_name,
        "[IBAN]": iban,
        "[BIC]": bic,
        # Footer text
        "[FOOTER_TEXT]": company_info.get("footer_text", ""),
        # Currency
        "[CURRENCY]": primary_currency,
        "[CURRENCY_1]": primary_currency,
        "[CURRENCY_2]": second_currency,
        # Dual currency
        "[SECOND_CURRENCY]": second_currency,
        # Contact info (both underscore and space variants)
        "[CONTACT_EMAIL]": contact_email,
        "[CONTACT EMAIL]": contact_email,
        "[PHONE]": phone,
        "[TELEFON]": phone,
    }


def build_dual_currency_replacements(
    subtotal: Decimal | float | int,
    tax_amount: Decimal | float | int,
    total: Decimal | float | int,
    exchange_rate: Decimal | None,
    settings: dict,
) -> dict[str, str]:
    """Build dual currency replacement entries."""
    return {
        "[SECOND_TOTAL]": format_amount(Decimal(str(total)) * exchange_rate, settings)
        if exchange_rate and total
        else "",
        "[SECOND_SUBTOTAL]": format_amount(Decimal(str(subtotal)) * exchange_rate, settings)
        if exchange_rate and subtotal
        else "",
        "[SECOND_TAX_AMOUNT]": format_amount(Decimal(str(tax_amount)) * exchange_rate, settings)
        if exchange_rate and tax_amount
        else "",
    }
