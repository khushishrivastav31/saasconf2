"""Tests for VAT requirement detection."""

import pytest

from app.core.vat_requirements import VatRequirement, VatRequirementLevel, determine_vat_requirement


def test_vat_required_virtual_eu_reverse_charge():
    """VAT required for virtual EU B2B (reverse charge)."""
    rule = {"reverse_charge": True, "charge_vat": False}
    req = determine_vat_requirement("virtual", "eu", True, rule)

    assert req.level == VatRequirementLevel.REQUIRED
    assert "reverse charge" in req.reason.lower()
    assert "Article 196" in req.rule_reference


def test_vat_required_hybrid_online_eu_reverse_charge():
    """VAT required for hybrid online EU B2B (reverse charge)."""
    rule = {"reverse_charge": True, "charge_vat": False}
    req = determine_vat_requirement("hybrid_online", "eu", True, rule)

    assert req.level == VatRequirementLevel.REQUIRED
    assert "reverse charge" in req.reason.lower()


def test_vat_recommended_domestic_b2b():
    """VAT recommended for domestic B2B."""
    rule = {"reverse_charge": False, "charge_vat": True}
    req = determine_vat_requirement("in_person", "domestic", True, rule)

    assert req.level == VatRequirementLevel.RECOMMENDED
    assert "recommended" in req.reason.lower()


def test_vat_recommended_eu_b2b_no_reverse_charge():
    """VAT recommended for EU B2B without reverse charge."""
    rule = {"reverse_charge": False, "charge_vat": True}
    req = determine_vat_requirement("in_person", "eu", True, rule)

    assert req.level == VatRequirementLevel.RECOMMENDED


def test_vat_optional_b2c():
    """VAT optional for B2C."""
    rule = {"reverse_charge": False, "charge_vat": True}
    req = determine_vat_requirement("in_person", "domestic", False, rule)

    assert req.level == VatRequirementLevel.OPTIONAL
    assert "optional" in req.reason.lower()


def test_vat_optional_non_eu():
    """VAT optional for non-EU B2B."""
    rule = {"reverse_charge": False, "charge_vat": False}
    req = determine_vat_requirement("in_person", "non_eu", True, rule)

    assert req.level == VatRequirementLevel.OPTIONAL


def test_vat_no_company_name_b2c():
    """No company name means B2C, VAT is optional."""
    rule = {"reverse_charge": False, "charge_vat": True}
    req = determine_vat_requirement("virtual", "eu", False, rule)

    assert req.level == VatRequirementLevel.OPTIONAL
