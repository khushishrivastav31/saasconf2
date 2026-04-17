"""Backwards-compatible shim for :mod:`app.core.invoice.line_items`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.line_items import (
    generate_line_items_for_bulk_registrations,
    generate_line_items_from_registration,
)

__all__ = [
    "generate_line_items_for_bulk_registrations",
    "generate_line_items_from_registration",
]
