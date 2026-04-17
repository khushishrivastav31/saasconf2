"""Backwards-compatible shim for :mod:`app.core.invoice.email`.

Moved under ``app.core.invoice`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.invoice.email import (
    build_invoice_email_html,
    build_pdf_attachment,
    send_email_best_effort,
    send_invoice_email,
    send_registration_cancellation_email,
    send_replacement_invoice_emails,
)

__all__ = [
    "build_invoice_email_html",
    "build_pdf_attachment",
    "send_email_best_effort",
    "send_invoice_email",
    "send_registration_cancellation_email",
    "send_replacement_invoice_emails",
]
