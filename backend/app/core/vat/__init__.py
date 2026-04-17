"""VAT calculation, rules, validation and requirement classification.

Submodules:
  - :mod:`app.core.vat.calculation`: Customer classification and invoice VAT
    calculation.
  - :mod:`app.core.vat.requirements`: VAT-ID requirement determination.
  - :mod:`app.core.vat.rules`: Per-country VAT rule lookup.
  - :mod:`app.core.vat.validation`: VAT number normalization and validation
    (regex, stdnum, VIES).
"""

from __future__ import annotations

from app.core.vat.calculation import (
    calculate_vat_for_invoice,
    classify_customer_location,
    classify_customer_type,
    infer_attendance_type_from_registration,
)
from app.core.vat.requirements import (
    VatRequirement,
    VatRequirementLevel,
    determine_vat_requirement,
)
from app.core.vat.rules import get_vat_rule
from app.core.vat.validation import (
    EU_COUNTRIES,
    normalize_country,
    normalize_vat,
    validate_regex,
    validate_stdnum,
    validate_vat_number,
    validate_vies,
)

__all__ = [
    "EU_COUNTRIES",
    "VatRequirement",
    "VatRequirementLevel",
    "calculate_vat_for_invoice",
    "classify_customer_location",
    "classify_customer_type",
    "determine_vat_requirement",
    "get_vat_rule",
    "infer_attendance_type_from_registration",
    "normalize_country",
    "normalize_vat",
    "validate_regex",
    "validate_stdnum",
    "validate_vat_number",
    "validate_vies",
]
