"""Backwards-compatible shim for :mod:`app.core.pdf.training_invoices`.

Moved under ``app.core.pdf`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.pdf.training_invoices import generate_training_invoice_pdf

__all__ = ["generate_training_invoice_pdf"]
