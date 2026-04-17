"""Backwards-compatible shim for :mod:`app.core.zugferd.validation`.

The actual implementation moved to :mod:`app.core.zugferd.validation` as part
of the ``app.core`` subpackaging (audit Step 28). This shim preserves the
historical import path ``from app.core.zugferd_validation import ...``. It
will be removed in a later release once callers are updated.
"""

from __future__ import annotations

from app.core.zugferd.validation import (
    validate_zugferd_pdf,
    validate_zugferd_requirements,
    validate_zugferd_settings,
)

__all__ = [
    "validate_zugferd_pdf",
    "validate_zugferd_requirements",
    "validate_zugferd_settings",
]
