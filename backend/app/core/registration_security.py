"""Backwards-compatible shim for :mod:`app.core.security.registrations`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.registrations import (
    check_rate_limit,
    clear_rate_limits,
    is_disposable_email,
    validate_registration_security,
)

__all__ = [
    "check_rate_limit",
    "clear_rate_limits",
    "is_disposable_email",
    "validate_registration_security",
]
