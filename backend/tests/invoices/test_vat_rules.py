"""Tests for VAT decision rules — defaults, schema validation, and lookup."""

import pytest
from pydantic import ValidationError

from app.core.default_settings import (
    DEFAULT_VAT_RULES,
    VALID_ATTENDANCE_TYPES,
    VALID_CUSTOMER_LOCATIONS,
    VALID_CUSTOMER_TYPES,
)
from app.core.vat_rules import get_vat_rule
from app.schemas.settings import VatRule


class TestDefaultVatRules:
    """Verify the default VAT rules are complete and consistent."""

    def test_has_24_rules(self):
        """All combinations of 4 attendance x 2 customer x 3 location = 24 rules."""
        assert len(DEFAULT_VAT_RULES) == 24

    def test_all_combinations_covered(self):
        """Every (attendance, customer, location) tuple has exactly one rule."""
        seen = set()
        for rule in DEFAULT_VAT_RULES:
            key = (rule["attendance_type"], rule["customer_type"], rule["customer_location"])
            assert key not in seen, f"Duplicate rule: {key}"
            seen.add(key)

        expected = {
            (att, ct, loc)
            for att in VALID_ATTENDANCE_TYPES
            for ct in VALID_CUSTOMER_TYPES
            for loc in VALID_CUSTOMER_LOCATIONS
        }
        assert seen == expected

    def test_all_rules_have_required_fields(self):
        """Each rule dict has all 8 required fields."""
        required = {
            "attendance_type",
            "customer_type",
            "customer_location",
            "charge_vat",
            "vat_rate_source",
            "reverse_charge",
            "oss_applicable",
            "note",
        }
        for rule in DEFAULT_VAT_RULES:
            missing = required - set(rule.keys())
            assert not missing, f"Rule {rule} missing fields: {missing}"

    def test_in_person_always_charges_vat(self):
        """In-person attendance always charges VAT at conference country."""
        for rule in DEFAULT_VAT_RULES:
            if rule["attendance_type"] == "in_person":
                assert rule["charge_vat"] is True
                assert rule["vat_rate_source"] == "conference"
                assert rule["reverse_charge"] is False

    def test_virtual_b2b_eu_is_reverse_charge(self):
        """Virtual B2B EU customer uses reverse charge."""
        rule = get_vat_rule(DEFAULT_VAT_RULES, "virtual", "b2b", "eu")
        assert rule is not None
        assert rule["charge_vat"] is False
        assert rule["reverse_charge"] is True
        assert rule["oss_applicable"] is False

    def test_virtual_b2c_eu_uses_oss(self):
        """Virtual B2C EU customer pays consumer's country VAT via OSS."""
        rule = get_vat_rule(DEFAULT_VAT_RULES, "virtual", "b2c", "eu")
        assert rule is not None
        assert rule["charge_vat"] is True
        assert rule["vat_rate_source"] == "customer"
        assert rule["oss_applicable"] is True

    def test_non_eu_virtual_no_vat(self):
        """Non-EU virtual customers don't get charged VAT."""
        for ct in ("b2b", "b2c"):
            rule = get_vat_rule(DEFAULT_VAT_RULES, "virtual", ct, "non_eu")
            assert rule is not None
            assert rule["charge_vat"] is False
            assert rule["vat_rate_source"] == "none"

    def test_hybrid_onsite_matches_in_person(self):
        """Hybrid onsite rules mirror in-person."""
        for ct in ("b2b", "b2c"):
            for loc in ("domestic", "eu", "non_eu"):
                ip = get_vat_rule(DEFAULT_VAT_RULES, "in_person", ct, loc)
                ho = get_vat_rule(DEFAULT_VAT_RULES, "hybrid_onsite", ct, loc)
                assert ip is not None and ho is not None
                assert ip["charge_vat"] == ho["charge_vat"]
                assert ip["reverse_charge"] == ho["reverse_charge"]
                assert ip["oss_applicable"] == ho["oss_applicable"]
                assert ip["vat_rate_source"] == ho["vat_rate_source"]

    def test_hybrid_online_matches_virtual(self):
        """Hybrid online rules mirror virtual."""
        for ct in ("b2b", "b2c"):
            for loc in ("domestic", "eu", "non_eu"):
                vr = get_vat_rule(DEFAULT_VAT_RULES, "virtual", ct, loc)
                ho = get_vat_rule(DEFAULT_VAT_RULES, "hybrid_online", ct, loc)
                assert vr is not None and ho is not None
                assert vr["charge_vat"] == ho["charge_vat"]
                assert vr["reverse_charge"] == ho["reverse_charge"]
                assert vr["oss_applicable"] == ho["oss_applicable"]
                assert vr["vat_rate_source"] == ho["vat_rate_source"]


class TestGetVatRule:
    """Tests for the lookup helper."""

    def test_finds_exact_match(self):
        rule = get_vat_rule(DEFAULT_VAT_RULES, "in_person", "b2b", "domestic")
        assert rule is not None
        assert rule["attendance_type"] == "in_person"
        assert rule["customer_type"] == "b2b"
        assert rule["customer_location"] == "domestic"

    def test_returns_none_for_unknown(self):
        assert get_vat_rule(DEFAULT_VAT_RULES, "teleport", "b2b", "domestic") is None

    def test_returns_none_for_empty_list(self):
        assert get_vat_rule([], "in_person", "b2b", "domestic") is None

    def test_all_24_lookups_succeed(self):
        for att in VALID_ATTENDANCE_TYPES:
            for ct in VALID_CUSTOMER_TYPES:
                for loc in VALID_CUSTOMER_LOCATIONS:
                    rule = get_vat_rule(DEFAULT_VAT_RULES, att, ct, loc)
                    assert rule is not None, f"No rule for {att}/{ct}/{loc}"


class TestVatRuleSchema:
    """Pydantic validation for VatRule."""

    def test_valid_rule(self):
        rule = VatRule(
            attendance_type="in_person",
            customer_type="b2b",
            customer_location="domestic",
            charge_vat=True,
            vat_rate_source="conference",
            reverse_charge=False,
            oss_applicable=False,
            note="Test",
        )
        assert rule.attendance_type == "in_person"

    def test_invalid_attendance_type(self):
        with pytest.raises(ValidationError, match="attendance_type"):
            VatRule(
                attendance_type="teleport",
                customer_type="b2b",
                customer_location="domestic",
            )

    def test_invalid_customer_type(self):
        with pytest.raises(ValidationError, match="customer_type"):
            VatRule(
                attendance_type="in_person",
                customer_type="b2g",
                customer_location="domestic",
            )

    def test_invalid_customer_location(self):
        with pytest.raises(ValidationError, match="customer_location"):
            VatRule(
                attendance_type="in_person",
                customer_type="b2b",
                customer_location="mars",
            )

    def test_invalid_vat_rate_source(self):
        with pytest.raises(ValidationError, match="vat_rate_source"):
            VatRule(
                attendance_type="in_person",
                customer_type="b2b",
                customer_location="domestic",
                vat_rate_source="magic",
            )

    def test_defaults(self):
        """Default values for optional fields."""
        rule = VatRule(
            attendance_type="virtual",
            customer_type="b2c",
            customer_location="eu",
        )
        assert rule.charge_vat is True
        assert rule.vat_rate_source == "conference"
        assert rule.reverse_charge is False
        assert rule.oss_applicable is False
        assert rule.note == ""

    def test_all_defaults_parse(self):
        """All 24 default rules can be parsed into VatRule models."""
        for rule_data in DEFAULT_VAT_RULES:
            rule = VatRule(**rule_data)
            assert rule.attendance_type in VALID_ATTENDANCE_TYPES
