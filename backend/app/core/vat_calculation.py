"""Backwards-compatible shim for :mod:`app.core.vat.calculation`.

Moved under ``app.core.vat`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.vat.calculation import (
    calculate_vat_for_invoice,
    classify_customer_location,
    classify_customer_type,
    infer_attendance_type_from_registration,
)

__all__ = [
    "calculate_vat_for_invoice",
    "classify_customer_location",
    "classify_customer_type",
    "infer_attendance_type_from_registration",
]
