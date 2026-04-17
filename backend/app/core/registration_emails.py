"""Backwards-compatible shim for :mod:`app.core.email.registrations`.

Moved under ``app.core.email`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.email.registrations import (
    send_attendee_welcome_email,
    send_registration_invoice_email,
)

__all__ = [
    "send_attendee_welcome_email",
    "send_registration_invoice_email",
]
