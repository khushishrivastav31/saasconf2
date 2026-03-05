"""VAT rule lookup for conference invoicing.

Pure functions — no DB access, no side effects.
"""

from __future__ import annotations


def get_vat_rule(
    rules: list[dict],
    attendance_type: str,
    customer_type: str,
    customer_location: str,
) -> dict | None:
    """Find the matching VAT rule for a given combination.

    Args:
        rules: List of VAT rule dicts (from conference.settings["vat_rules"]).
        attendance_type: "in_person", "virtual", "hybrid_onsite", or "hybrid_online".
        customer_type: "b2b" or "b2c".
        customer_location: "domestic", "eu", or "non_eu".

    Returns:
        The matching rule dict, or None if no match found.
    """
    for rule in rules:
        if (
            rule.get("attendance_type") == attendance_type
            and rule.get("customer_type") == customer_type
            and rule.get("customer_location") == customer_location
        ):
            return rule
    return None
