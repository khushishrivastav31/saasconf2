"""Backwards-compatible shim for :mod:`app.core.invoice.registration_transfer`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.registration_transfer import (
    transfer_registrations_to_invoice,
)

__all__ = ["transfer_registrations_to_invoice"]
