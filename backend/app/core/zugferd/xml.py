"""ZUGFeRD/Factur-X XML generation module.

Generates CII (Cross-Industry Invoice) XML from SaaSConf invoice data
using the factur-x library for EN 16931 compliance.

All ZUGFeRD parameters are auto-determined from invoice/conference data:
- Profile: Always EN16931 (EU standard)
- Seller VAT ID: From company settings or fiscal representative
- Contact info: From conference email/phone
- Payment terms: Always 30 days
- Payment means: Auto-determined from invoice template_type
- Tax category: Auto-determined from VAT calculation result
- Invoice type: Auto-determined from template_type (380=invoice, 381=credit note)
"""

# ruff: noqa: UP031 - Using % formatting for XML namespace interpolation with lxml

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import read_pii

logger = logging.getLogger(__name__)


async def generate_zugferd_xml(
    invoice: Any,  # Invoice model
    conference: Any,  # Conference model
    db: AsyncSession,
) -> bytes:
    """Generate ZUGFeRD CII XML from invoice data.

    Uses factur-x library for XML structure and validation.
    Returns XML bytes ready for PDF embedding.

    All parameters are auto-determined - no manual configuration needed.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        db: Database session for VAT calculation

    Returns:
        bytes: Generated XML ready for PDF embedding

    Raises:
        ValueError: If required data is missing or invalid
        RuntimeError: If XML generation fails
    """
    # Map invoice fields to CII XML structure (auto-determines all values)
    xml_data = await _map_invoice_to_zugferd(invoice, conference, db)

    # Generate XML using lxml (CPU-bound, run in thread pool)
    # Profile is always EN16931 (EU standard)
    try:
        xml_bytes = await asyncio.to_thread(_generate_cii_xml, xml_data)

        logger.info(
            f"ZUGFeRD XML generated for invoice {invoice.id}",
            extra={
                "invoice_id": str(invoice.id),
                "profile": "EN16931",
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


def _generate_cii_xml(data: dict) -> bytes:
    """Generate UN/CEFACT CII XML from mapped invoice data.

    Args:
        data: Mapped invoice data from _map_invoice_to_zugferd

    Returns:
        bytes: ZUGFeRD XML in UN/CEFACT CII format
    """
    from lxml import etree

    # Define namespaces
    nsmap = {
        "rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
        "udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
        "qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
    }

    # Create root element
    root = etree.Element(
        "{urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100}CrossIndustryInvoice",
        nsmap=nsmap,
    )

    # Exchange context
    context = etree.SubElement(root, "{%s}ExchangedDocumentContext" % nsmap["rsm"])
    guideline = etree.SubElement(context, "{%s}GuidelineSpecifiedDocumentContextParameter" % nsmap["ram"])
    guideline_id = etree.SubElement(guideline, "{%s}ID" % nsmap["ram"])
    guideline_id.text = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:EN16931"

    # Exchanged document
    doc = etree.SubElement(root, "{%s}ExchangedDocument" % nsmap["rsm"])
    doc_id = etree.SubElement(doc, "{%s}ID" % nsmap["ram"])
    doc_id.text = data.get("invoice_number", "DRAFT")

    doc_type = etree.SubElement(doc, "{%s}TypeCode" % nsmap["ram"])
    doc_type.text = data.get("invoice_type_code", "380")

    doc_issue = etree.SubElement(doc, "{%s}IssueDateTime" % nsmap["ram"])
    issue_str = etree.SubElement(doc_issue, "{%s}DateTimeString" % nsmap["udt"], format="102")
    if data.get("issue_date"):
        issue_str.text = data["issue_date"].replace("-", "")

    # Invoice-level notes (optional per EN 16931)
    if data.get("notes"):
        note_elem = etree.SubElement(doc, "{%s}IncludedNote" % nsmap["ram"])
        note_content = etree.SubElement(note_elem, "{%s}Content" % nsmap["ram"])
        note_content.text = data["notes"]

    # Supply chain trade transaction
    trade = etree.SubElement(root, "{%s}SupplyChainTradeTransaction" % nsmap["rsm"])

    # Line items
    for item in data.get("line_items", []):
        item_elem = etree.SubElement(trade, "{%s}IncludedSupplyChainTradeLineItem" % nsmap["ram"])

        line_doc = etree.SubElement(item_elem, "{%s}AssociatedDocumentLineDocument" % nsmap["ram"])
        line_id = etree.SubElement(line_doc, "{%s}LineID" % nsmap["ram"])
        line_id.text = str(item.get("line_id", "1"))

        product = etree.SubElement(item_elem, "{%s}SpecifiedTradeProduct" % nsmap["ram"])
        name = etree.SubElement(product, "{%s}Name" % nsmap["ram"])
        name.text = item.get("name", "Item")

        agreement = etree.SubElement(item_elem, "{%s}SpecifiedLineTradeAgreement" % nsmap["ram"])

        # Per EN 16931: when a discount exists, include GrossPriceProductTradePrice
        # with the original unit_price and an AllowanceCharge, then NetPriceProductTradePrice
        # with the effective price after discount.
        item_discount = item.get("discount", 0)
        item_qty = item.get("quantity", 1)
        if item_discount > 0 and item_qty > 0:
            gross_price = etree.SubElement(agreement, "{%s}GrossPriceProductTradePrice" % nsmap["ram"])
            gross_charge = etree.SubElement(gross_price, "{%s}ChargeAmount" % nsmap["ram"])
            gross_charge.text = f"{item.get('unit_price', 0):.2f}"

            # AllowanceCharge on GrossPrice (discount per unit)
            allowance = etree.SubElement(gross_price, "{%s}AppliedTradeAllowanceCharge" % nsmap["ram"])
            indicator = etree.SubElement(allowance, "{%s}ChargeIndicator" % nsmap["ram"])
            indicator_val = etree.SubElement(indicator, "{%s}Indicator" % nsmap["udt"])
            indicator_val.text = "false"  # false = allowance/discount
            actual_amount = etree.SubElement(allowance, "{%s}ActualAmount" % nsmap["ram"])
            actual_amount.text = f"{item_discount:.2f}"

            # Net price = unit_price - discount (discount is already per-unit)
            net_unit_price = item.get("unit_price", 0) - item_discount
            net_price = etree.SubElement(agreement, "{%s}NetPriceProductTradePrice" % nsmap["ram"])
            net_charge = etree.SubElement(net_price, "{%s}ChargeAmount" % nsmap["ram"])
            net_charge.text = f"{net_unit_price:.2f}"
        else:
            net_price = etree.SubElement(agreement, "{%s}NetPriceProductTradePrice" % nsmap["ram"])
            net_charge = etree.SubElement(net_price, "{%s}ChargeAmount" % nsmap["ram"])
            net_charge.text = f"{item.get('unit_price', 0):.2f}"

        delivery = etree.SubElement(item_elem, "{%s}SpecifiedLineTradeDelivery" % nsmap["ram"])
        qty = etree.SubElement(delivery, "{%s}BilledQuantity" % nsmap["ram"])
        qty.set("unitCode", "C62")  # C62 = unit/piece (UN/ECE recommendation 20)
        qty.text = f"{item_qty:.2f}"

        settlement = etree.SubElement(item_elem, "{%s}SpecifiedLineTradeSettlement" % nsmap["ram"])
        tax = etree.SubElement(settlement, "{%s}ApplicableTradeTax" % nsmap["ram"])
        tax_type = etree.SubElement(tax, "{%s}TypeCode" % nsmap["ram"])
        tax_type.text = "VAT"
        tax_category = etree.SubElement(tax, "{%s}CategoryCode" % nsmap["ram"])
        tax_category.text = item.get("tax_category", "S")
        tax_percent = etree.SubElement(tax, "{%s}RateApplicablePercent" % nsmap["ram"])
        tax_percent.text = f"{item.get('tax_percent', 0):.2f}"

        line_total = etree.SubElement(settlement, "{%s}SpecifiedTradeSettlementLineMonetarySummation" % nsmap["ram"])
        line_amount = etree.SubElement(line_total, "{%s}LineTotalAmount" % nsmap["ram"])
        line_amount.text = f"{item.get('line_total', 0):.2f}"

    # Trade agreement
    agreement = etree.SubElement(trade, "{%s}ApplicableHeaderTradeAgreement" % nsmap["ram"])

    # Seller party (supplier)
    # CII element order: Name, DefinedTradeContact, PostalTradeAddress, URIUniversalCommunication, SpecifiedTaxRegistration
    seller = etree.SubElement(agreement, "{%s}SellerTradeParty" % nsmap["ram"])
    seller_name = etree.SubElement(seller, "{%s}Name" % nsmap["ram"])
    seller_name.text = data.get("seller", {}).get("name", "Unknown")

    # Seller contact info (must come before PostalTradeAddress per CII XSD)
    seller_email = data.get("seller", {}).get("contact_email")
    seller_phone = data.get("seller", {}).get("contact_phone")
    if seller_email or seller_phone:
        seller_contact = etree.SubElement(seller, "{%s}DefinedTradeContact" % nsmap["ram"])
        contact_name = etree.SubElement(seller_contact, "{%s}PersonName" % nsmap["ram"])
        contact_name.text = data.get("seller", {}).get("name", "")
        if seller_phone:
            phone_elem = etree.SubElement(seller_contact, "{%s}TelephoneUniversalCommunication" % nsmap["ram"])
            phone_number = etree.SubElement(phone_elem, "{%s}CompleteNumber" % nsmap["ram"])
            phone_number.text = seller_phone
        if seller_email:
            email_elem = etree.SubElement(seller_contact, "{%s}EmailURIUniversalCommunication" % nsmap["ram"])
            email_uri = etree.SubElement(email_elem, "{%s}URIID" % nsmap["ram"])
            email_uri.text = seller_email

    # Seller postal address (must come after DefinedTradeContact, before SpecifiedTaxRegistration)
    # Inner element order: PostcodeCode, LineOne, CityName, CountryID
    seller_address_data = data.get("seller", {}).get("address", {})
    if seller_address_data:
        seller_address = etree.SubElement(seller, "{%s}PostalTradeAddress" % nsmap["ram"])

        if seller_address_data.get("postal_code"):
            seller_postcode = etree.SubElement(seller_address, "{%s}PostcodeCode" % nsmap["ram"])
            seller_postcode.text = seller_address_data["postal_code"]

        if seller_address_data.get("street"):
            seller_street = etree.SubElement(seller_address, "{%s}LineOne" % nsmap["ram"])
            seller_street.text = seller_address_data["street"]

        if seller_address_data.get("city"):
            seller_city = etree.SubElement(seller_address, "{%s}CityName" % nsmap["ram"])
            seller_city.text = seller_address_data["city"]

        if data.get("seller", {}).get("country_code"):
            seller_country = etree.SubElement(seller_address, "{%s}CountryID" % nsmap["ram"])
            seller_country.text = data["seller"]["country_code"]

    # Seller VAT ID (must come last in SellerTradeParty)
    seller_vat = data.get("seller", {}).get("vat_id")
    if seller_vat:
        seller_spec_tax = etree.SubElement(seller, "{%s}SpecifiedTaxRegistration" % nsmap["ram"])
        seller_tax_id = etree.SubElement(seller_spec_tax, "{%s}ID" % nsmap["ram"], schemeID="VA")
        seller_tax_id.text = seller_vat

    # Buyer party (customer)
    buyer = etree.SubElement(agreement, "{%s}BuyerTradeParty" % nsmap["ram"])
    buyer_name = etree.SubElement(buyer, "{%s}Name" % nsmap["ram"])
    buyer_name.text = data.get("buyer", {}).get("name", "Unknown")

    # Buyer postal address (required - must come before SpecifiedTaxRegistration)
    # Element order: PostcodeCode, LineOne, LineTwo, LineThree, CityName, CountryID
    buyer_address_data = data.get("buyer", {}).get("address", {})
    if buyer_address_data:
        buyer_address = etree.SubElement(buyer, "{%s}PostalTradeAddress" % nsmap["ram"])

        # PostcodeCode must come first
        if buyer_address_data.get("postal_code"):
            buyer_postcode = etree.SubElement(buyer_address, "{%s}PostcodeCode" % nsmap["ram"])
            buyer_postcode.text = buyer_address_data["postal_code"]

        # Then street address lines
        if buyer_address_data.get("street"):
            buyer_street = etree.SubElement(buyer_address, "{%s}LineOne" % nsmap["ram"])
            buyer_street.text = buyer_address_data["street"]

        # Then city
        if buyer_address_data.get("city"):
            buyer_city = etree.SubElement(buyer_address, "{%s}CityName" % nsmap["ram"])
            buyer_city.text = buyer_address_data["city"]

        # Finally country code
        if data.get("buyer", {}).get("country_code"):
            buyer_country = etree.SubElement(buyer_address, "{%s}CountryID" % nsmap["ram"])
            buyer_country.text = data["buyer"]["country_code"]

    # Buyer VAT ID (required for B2B reverse charge - must come after address)
    buyer_vat = data.get("buyer", {}).get("vat_id")
    if buyer_vat:
        buyer_spec_tax = etree.SubElement(buyer, "{%s}SpecifiedTaxRegistration" % nsmap["ram"])
        buyer_tax_id = etree.SubElement(buyer_spec_tax, "{%s}ID" % nsmap["ram"], schemeID="VA")
        buyer_tax_id.text = buyer_vat

    # Buyer order reference (PO number) - optional per EN16931
    buyer_order_ref = data.get("buyer_order_reference")
    if buyer_order_ref:
        order_ref_doc = etree.SubElement(agreement, "{%s}BuyerOrderReferencedDocument" % nsmap["ram"])
        order_ref_id = etree.SubElement(order_ref_doc, "{%s}IssuerAssignedID" % nsmap["ram"])
        order_ref_id.text = str(buyer_order_ref)

    # Trade delivery (required by EN16931)
    delivery_header = etree.SubElement(trade, "{%s}ApplicableHeaderTradeDelivery" % nsmap["ram"])
    delivery_event = etree.SubElement(delivery_header, "{%s}ActualDeliverySupplyChainEvent" % nsmap["ram"])
    delivery_date = etree.SubElement(delivery_event, "{%s}OccurrenceDateTime" % nsmap["ram"])
    delivery_date_format = etree.SubElement(delivery_date, "{%s}DateTimeString" % nsmap["udt"], format="102")
    # Use issue_date as delivery date (format: YYYYMMDD)
    delivery_date_format.text = data.get("issue_date", "").replace("-", "")

    # Trade settlement
    settlement = etree.SubElement(trade, "{%s}ApplicableHeaderTradeSettlement" % nsmap["ram"])

    payment_currency = etree.SubElement(settlement, "{%s}InvoiceCurrencyCode" % nsmap["ram"])
    payment_currency.text = data.get("currency", "EUR")

    # Payment means (REQUIRED before monetary summation)
    payment_means_elem = etree.SubElement(settlement, "{%s}SpecifiedTradeSettlementPaymentMeans" % nsmap["ram"])
    payment_means_code = etree.SubElement(payment_means_elem, "{%s}TypeCode" % nsmap["ram"])
    payment_means_code.text = data.get("payment_means", {}).get("code", "30")

    # Add bank account details if available
    payment_means_data = data.get("payment_means", {})
    if payment_means_data.get("iban"):
        payee_account = etree.SubElement(payment_means_elem, "{%s}PayeePartyCreditorFinancialAccount" % nsmap["ram"])
        iban_elem = etree.SubElement(payee_account, "{%s}IBANID" % nsmap["ram"])
        iban_elem.text = payment_means_data["iban"]

    # Add BIC as a separate element (sibling to PayeePartyCreditorFinancialAccount)
    if payment_means_data.get("bic"):
        financial_institution = etree.SubElement(
            payment_means_elem, "{%s}PayeeSpecifiedCreditorFinancialInstitution" % nsmap["ram"]
        )
        bic_elem = etree.SubElement(financial_institution, "{%s}BICID" % nsmap["ram"])
        bic_elem.text = payment_means_data["bic"]

    # Tax breakdown (REQUIRED before monetary summation)
    for tax_item in data.get("tax_breakdown", []):
        tax_elem = etree.SubElement(settlement, "{%s}ApplicableTradeTax" % nsmap["ram"])

        calc_amount = etree.SubElement(tax_elem, "{%s}CalculatedAmount" % nsmap["ram"])
        calc_amount.text = f"{tax_item.get('tax_amount', 0):.2f}"

        tax_type_code = etree.SubElement(tax_elem, "{%s}TypeCode" % nsmap["ram"])
        tax_type_code.text = "VAT"

        tax_basis_amount = etree.SubElement(tax_elem, "{%s}BasisAmount" % nsmap["ram"])
        tax_basis_amount.text = f"{tax_item.get('tax_basis', 0):.2f}"

        tax_category_code = etree.SubElement(tax_elem, "{%s}CategoryCode" % nsmap["ram"])
        tax_category_code.text = tax_item.get("tax_category", "S")

        tax_rate_percent = etree.SubElement(tax_elem, "{%s}RateApplicablePercent" % nsmap["ram"])
        tax_rate_percent.text = f"{tax_item.get('tax_percent', 0):.2f}"

    # Header-level AllowanceCharge for global discount (per EN 16931 BG-20)
    header_discount = data.get("header_discount", 0)
    if header_discount > 0:
        header_allowance = etree.SubElement(settlement, "{%s}SpecifiedTradeAllowanceCharge" % nsmap["ram"])
        h_indicator = etree.SubElement(header_allowance, "{%s}ChargeIndicator" % nsmap["ram"])
        h_indicator_val = etree.SubElement(h_indicator, "{%s}Indicator" % nsmap["udt"])
        h_indicator_val.text = "false"  # false = allowance/discount
        h_actual = etree.SubElement(header_allowance, "{%s}ActualAmount" % nsmap["ram"])
        h_actual.text = f"{header_discount:.2f}"
        h_reason = etree.SubElement(header_allowance, "{%s}Reason" % nsmap["ram"])
        h_reason.text = data.get("discount_reason", "Discount")
        # Tax category on header allowance
        h_tax = etree.SubElement(header_allowance, "{%s}CategoryTradeTax" % nsmap["ram"])
        h_tax_type = etree.SubElement(h_tax, "{%s}TypeCode" % nsmap["ram"])
        h_tax_type.text = "VAT"
        h_tax_cat = etree.SubElement(h_tax, "{%s}CategoryCode" % nsmap["ram"])
        h_tax_cat.text = data.get("tax_breakdown", [{}])[0].get("tax_category", "S")
        h_tax_pct = etree.SubElement(h_tax, "{%s}RateApplicablePercent" % nsmap["ram"])
        h_tax_pct.text = f"{data.get('tax_breakdown', [{}])[0].get('tax_percent', 0):.2f}"

    # Payment terms with due date (per EN 16931 BT-9 / BG-22)
    payment_terms_data = data.get("payment_terms", {})
    if payment_terms_data:
        terms_elem = etree.SubElement(settlement, "{%s}SpecifiedTradePaymentTerms" % nsmap["ram"])
        terms_desc = etree.SubElement(terms_elem, "{%s}Description" % nsmap["ram"])
        terms_desc.text = payment_terms_data.get("description", "Net 30 days")
        if data.get("due_date"):
            due_date_elem = etree.SubElement(terms_elem, "{%s}DueDateDateTime" % nsmap["ram"])
            due_date_str = etree.SubElement(due_date_elem, "{%s}DateTimeString" % nsmap["udt"], format="102")
            due_date_str.text = data["due_date"].replace("-", "")

    # Monetary summation (MUST come after payment means, tax, and allowances)
    # Per EN 16931: LineTotalAmount = sum of line totals (net of line discounts)
    # AllowanceTotalAmount = sum of header-level allowances
    # TaxBasisTotalAmount = LineTotalAmount - AllowanceTotalAmount
    summation = etree.SubElement(settlement, "{%s}SpecifiedTradeSettlementHeaderMonetarySummation" % nsmap["ram"])

    line_total = etree.SubElement(summation, "{%s}LineTotalAmount" % nsmap["ram"])
    line_total.text = f"{data.get('line_total', 0):.2f}"

    if header_discount > 0:
        allowance_total = etree.SubElement(summation, "{%s}AllowanceTotalAmount" % nsmap["ram"])
        allowance_total.text = f"{header_discount:.2f}"

    tax_basis = etree.SubElement(summation, "{%s}TaxBasisTotalAmount" % nsmap["ram"])
    tax_basis.text = f"{data.get('tax_basis', 0):.2f}"

    tax_total = etree.SubElement(summation, "{%s}TaxTotalAmount" % nsmap["ram"], currencyID=data.get("currency", "EUR"))
    tax_total.text = f"{data.get('tax_total', 0):.2f}"

    grand_total = etree.SubElement(summation, "{%s}GrandTotalAmount" % nsmap["ram"])
    grand_total.text = f"{data.get('grand_total', 0):.2f}"

    due_payable = etree.SubElement(summation, "{%s}DuePayableAmount" % nsmap["ram"])
    due_payable.text = f"{data.get('grand_total', 0):.2f}"

    # Generate XML bytes
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)


def _determine_tax_category_code(vat_rule: dict | None, tax_rate: float) -> str:
    """Determine ZUGFeRD tax category code from VAT calculation result.

    Maps VAT decision table rules to UN/CEFACT tax category codes.

    Args:
        vat_rule: VAT rule dict from VAT decision table
        tax_rate: Calculated tax rate percentage

    Returns:
        str: ZUGFeRD tax category code:
            - "AE": Reverse charge (buyer pays VAT)
            - "Z": Zero rated (0%)
            - "E": Exempt from tax
            - "S": Standard rate (normal VAT)
    """
    if not vat_rule:
        # No rule found, assume exempt
        return "E"

    # Reverse charge: buyer self-accounts for VAT
    if vat_rule.get("reverse_charge"):
        return "AE"

    # VAT charged at standard rate
    if vat_rule.get("charge_vat"):
        if tax_rate > 0:
            return "S"  # Standard rate
        else:
            return "Z"  # Zero rated

    # No VAT charged, not reverse charge
    return "E"  # Exempt


async def _map_invoice_to_zugferd(invoice: Any, conference: Any, db: AsyncSession) -> dict:
    """Map SaaSConf Invoice model to factur-x dict structure.

    All ZUGFeRD parameters are auto-determined from invoice/conference data.

    Args:
        invoice: Invoice model instance
        conference: Conference model instance
        db: Database session for VAT calculation

    Returns:
        dict: factur-x compatible data structure
    """
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
    from app.core.invoice_pdf import _normalize_country_to_iso
    from app.core.vat_calculation import classify_customer_location, classify_customer_type
    from app.core.vat_rules import get_vat_rule

    # Get company info from conference settings
    company_info = (conference.settings or {}).get("invoice_company_info", {})

    # ── AUTO-DETERMINE SELLER VAT ID ──
    # Use company tax_id, or fiscal representative if configured
    vat_number = company_info.get("tax_id")
    fiscal_rep = company_info.get("fiscal_representative")
    if fiscal_rep and fiscal_rep.get("vat_number"):
        # Use fiscal representative's VAT number
        vat_number = fiscal_rep["vat_number"]

    # ── EXTRACT BANK INFO ──
    # From bank_accounts array or legacy fields
    iban = ""
    bic = ""
    bank_accounts = company_info.get("bank_accounts", [])
    if bank_accounts and len(bank_accounts) > 0:
        first_account = bank_accounts[0]
        iban = first_account.get("iban", "")
        bic = first_account.get("bic", "")
    else:
        # Fallback to legacy fields
        iban = company_info.get("iban", "")
        bic = company_info.get("bic", "")

    # ── BUILD SELLER DATA ──
    seller_country = _normalize_country_to_iso(company_info.get("country", ""))
    seller_data = {
        "name": company_info.get("name", "Unknown Company"),
        "country_code": seller_country,
    }

    # Add VAT ID (required for ZUGFeRD)
    if vat_number:
        seller_data["vat_id"] = vat_number

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

    # ── AUTO-DETERMINE CONTACT INFO ──
    # Use conference contact_email/phone (from conference details)
    if conference.contact_email:
        seller_data["contact_email"] = conference.contact_email
    if conference.phone:
        seller_data["contact_phone"] = conference.phone
    # Fallback to company info if conference doesn't have contact info
    elif company_info.get("phone"):
        seller_data["contact_phone"] = company_info.get("phone")

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
    recipient_vat_number = read_pii(invoice, "recipient_vat_number")
    if recipient_vat_number:
        buyer_data["vat_id"] = recipient_vat_number

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

    # ── AUTO-DETERMINE TAX CATEGORY CODE ──
    # Re-run VAT calculation to get the rule that was applied
    # This ensures tax category matches the actual VAT treatment
    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)

    # Classify customer for VAT decision table
    customer_type = classify_customer_type(recipient_vat_number)
    customer_location = classify_customer_location(
        invoice.recipient_country or "",
        conference.country or "",
        eu_countries,
    )

    # Infer attendance type from registration (or default to in_person)
    from app.core.vat_calculation import infer_attendance_type_from_registration

    attendance_type = await infer_attendance_type_from_registration(invoice, db)
    if not attendance_type:
        attendance_type = "in_person"

    # Get VAT rule that was applied to this invoice
    vat_rule = get_vat_rule(vat_rules, attendance_type, customer_type, customer_location)

    # Convert amounts to float (factur-x expects float, not Decimal)
    tax_amount = float(invoice.tax_amount) if invoice.tax_amount else 0.0
    total = float(invoice.total) if invoice.total else 0.0
    tax_rate = float(invoice.tax_rate) if invoice.tax_rate else 0.0

    # Determine tax category code from VAT rule
    tax_category_code = _determine_tax_category_code(vat_rule, tax_rate)

    # ── BUILD LINE ITEMS (including per-line discounts) ──
    line_items = []
    for idx, item in enumerate(invoice.line_items or [], start=1):
        item_quantity = float(item.get("quantity", 1))
        item_unit_price = float(item.get("unit_price", 0))
        # A line carries either a fixed discount amount or a percentage; when a
        # percentage is set, derive the absolute line discount so EN16931 output
        # is identical to the fixed-amount case (see build_zugferd_xml).
        discount_percentage = item.get("discount_percentage")
        if discount_percentage:
            item_discount = item_unit_price * item_quantity * float(discount_percentage) / 100
        else:
            item_discount = float(item.get("discount", 0))
        line_item = {
            "line_id": str(idx),
            "name": item.get("description", f"Item {idx}"),
            "quantity": item_quantity,
            "unit_price": item_unit_price,
            "discount": item_discount,
            "line_total": float(item.get("total", 0)),
            "tax_category": tax_category_code,
            "tax_percent": tax_rate,
        }
        line_items.append(line_item)

    # ── AUTO-DETERMINE PAYMENT MEANS CODE ──
    # Based on invoice template_type:
    # - bank_transfer → "30" (Credit transfer)
    # - credit_card → "48" (Payment card)
    # - credit_note → "30" (default to credit transfer)
    payment_means_code = "30"  # Default: credit transfer
    if invoice.template_type == "credit_card":
        payment_means_code = "48"

    # Build payment info
    payment_data: dict[str, Any] = {
        "code": payment_means_code,
    }

    # Add bank account if available
    if iban:
        payment_data["iban"] = iban
    if bic:
        payment_data["bic"] = bic

    # ── AUTO-DETERMINE INVOICE TYPE CODE ──
    # Based on invoice template_type:
    # - credit_note → "381" (Credit note)
    # - invoice/bank_transfer/credit_card → "380" (Commercial invoice)
    invoice_type_code = "381" if invoice.template_type == "credit_note" else "380"

    # ── LINE TOTALS ──
    # Line totals are already net of per-line discounts (unit_price * qty - discount).
    # invoice.discount_amount is purely informational (sum of per-line discounts) —
    # it must NOT be subtracted again at the header level (see vat_calculation.py:239).
    line_total_sum = sum(float(item.get("total", 0)) for item in (invoice.line_items or []))

    # ── BUILD COMPLETE FACTUR-X DATA STRUCTURE ──
    zugferd_data = {
        # Document metadata
        "invoice_number": invoice.invoice_number or "DRAFT",
        "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "invoice_type_code": invoice_type_code,
        "currency": invoice.currency or "EUR",
        "notes": invoice.notes or "",
        # Parties
        "seller": seller_data,
        "buyer": buyer_data,
        # References
        "buyer_order_reference": invoice.procurement_code,  # PO number (optional)
        # Amounts — per-line discounts already reflected in line totals, no header discount
        "line_total": line_total_sum,
        "header_discount": 0,
        "tax_basis": line_total_sum,
        "tax_total": tax_amount,
        "grand_total": total,
        # Tax breakdown
        "tax_breakdown": [
            {
                "tax_basis": line_total_sum,
                "tax_percent": tax_rate,
                "tax_amount": tax_amount,
                "tax_category": tax_category_code,
            }
        ],
        # Line items
        "line_items": line_items,
        # Payment
        "payment_means": payment_data,
        "payment_terms": {
            "code": "30",  # Always Net 30 days
            "description": "Net 30 days",
        },
    }

    return zugferd_data
