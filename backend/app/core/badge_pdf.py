"""Backwards-compatible shim for :mod:`app.core.pdf.badges`.

Moved under ``app.core.pdf`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.pdf.badges import (
    generate_badge_pdf,
    generate_badge_pdf_from_data,
    generate_badges_bulk,
    generate_qr_preview,
)

__all__ = [
    "generate_badge_pdf",
    "generate_badge_pdf_from_data",
    "generate_badges_bulk",
    "generate_qr_preview",
]
