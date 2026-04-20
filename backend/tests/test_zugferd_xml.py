"""Tests for ZUGFeRD XML generation with procurement codes."""

import pytest
from lxml import etree

from app.core.zugferd_xml import generate_zugferd_xml


@pytest.mark.asyncio
async def test_zugferd_includes_procurement_code(invoice_with_procurement_code, conference, db_session):
    """Test ZUGFeRD XML includes BuyerOrderReferencedDocument when procurement_code is present."""
    # Generate XML
    xml_bytes = await generate_zugferd_xml(invoice_with_procurement_code, conference, db_session)

    # Parse XML
    root = etree.fromstring(xml_bytes)
    nsmap = {
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    }

    # Find BuyerOrderReferencedDocument element
    buyer_order_refs = root.xpath("//ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID", namespaces=nsmap)

    assert len(buyer_order_refs) == 1
    assert buyer_order_refs[0].text == invoice_with_procurement_code.procurement_code


@pytest.mark.asyncio
async def test_zugferd_omits_empty_procurement_code(invoice_without_procurement_code, conference, db_session):
    """Test ZUGFeRD XML omits BuyerOrderReferencedDocument when procurement_code is null."""
    # Generate XML
    xml_bytes = await generate_zugferd_xml(invoice_without_procurement_code, conference, db_session)

    # Parse XML
    root = etree.fromstring(xml_bytes)
    nsmap = {
        "ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    }

    # Verify BuyerOrderReferencedDocument element is NOT present
    buyer_order_refs = root.xpath("//ram:BuyerOrderReferencedDocument", namespaces=nsmap)

    assert len(buyer_order_refs) == 0


@pytest.mark.asyncio
async def test_zugferd_validates_with_procurement_code(invoice_with_procurement_code, conference, db_session):
    """Test ZUGFeRD XML with procurement code is valid EN16931."""
    # Generate XML
    xml_bytes = await generate_zugferd_xml(invoice_with_procurement_code, conference, db_session)

    # Parse XML (will raise if invalid)
    root = etree.fromstring(xml_bytes)

    # Verify root element
    assert root.tag.endswith("CrossIndustryInvoice")

    # Verify guideline ID for EN16931 compliance
    guideline = root.xpath(
        "//ram:GuidelineSpecifiedDocumentContextParameter/ram:ID",
        namespaces={"ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"},
    )
    assert len(guideline) == 1
    assert "en16931" in guideline[0].text.lower()
