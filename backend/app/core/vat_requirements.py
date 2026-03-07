"""VAT requirement detection based on VAT Decision Table rules."""

from dataclasses import dataclass
from enum import StrEnum


class VatRequirementLevel(StrEnum):
    """VAT number requirement level."""

    REQUIRED = "required"  # Reverse charge - legally mandatory
    RECOMMENDED = "recommended"  # B2B best practice
    OPTIONAL = "optional"  # B2C or non-critical


@dataclass
class VatRequirement:
    """VAT requirement with full context."""

    level: VatRequirementLevel
    reason: str  # Human-readable explanation
    rule_reference: str | None  # e.g., "Article 196 VAT Directive"
    decision_rule: dict | None  # The matched VAT decision table rule


def determine_vat_requirement(
    attendance_type: str,
    customer_location: str,  # domestic/eu/non_eu
    has_company_name: bool,
    vat_rule: dict | None = None,
) -> VatRequirement:
    """Determine if VAT number is required/recommended/optional.

    Based on VAT Decision Table reverse_charge flag and business context.

    Args:
        attendance_type: "in_person", "virtual", "hybrid_onsite", "hybrid_online"
        customer_location: "domestic", "eu", or "non_eu"
        has_company_name: Whether buyer provided company name (B2B indicator)
        vat_rule: The matched VAT decision table rule (optional)

    Returns:
        VatRequirement with level, reason, and rule reference
    """
    # REQUIRED: Reverse charge scenarios
    if vat_rule and vat_rule.get("reverse_charge"):
        return VatRequirement(
            level=VatRequirementLevel.REQUIRED,
            reason=(
                "VAT number is REQUIRED for this transaction. "
                "Virtual/online services to EU businesses are subject to reverse charge "
                "under Article 196 of the VAT Directive. The buyer must have a valid VAT "
                "registration number to self-account for VAT in their country."
            ),
            rule_reference="Article 196, VAT Directive 2006/112/EC",
            decision_rule=vat_rule,
        )

    # RECOMMENDED: B2B transactions (has company name)
    if has_company_name and customer_location in ["domestic", "eu"]:
        return VatRequirement(
            level=VatRequirementLevel.RECOMMENDED,
            reason=(
                "VAT number is recommended for business-to-business transactions. "
                "Providing a VAT number helps with tax compliance and enables your "
                "customer to reclaim input VAT on this purchase."
            ),
            rule_reference="Best practice for B2B invoicing",
            decision_rule=vat_rule,
        )

    # OPTIONAL: B2C or non-EU
    return VatRequirement(
        level=VatRequirementLevel.OPTIONAL,
        reason="VAT number is optional for this transaction type.",
        rule_reference=None,
        decision_rule=vat_rule,
    )
