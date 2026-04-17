"""Backwards-compatible shim for :mod:`app.core.vat.requirements`.

Moved under ``app.core.vat`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.vat.requirements import (
    VatRequirement,
    VatRequirementLevel,
    determine_vat_requirement,
)

__all__ = [
    "VatRequirement",
    "VatRequirementLevel",
    "determine_vat_requirement",
]
