"""Stand-alone PDF generators.

Submodules:
  - :mod:`app.core.pdf.badges`: Attendee badge PDFs (HTML→PDF via WeasyPrint).
  - :mod:`app.core.pdf.trainer_schedule`: Trainer schedule PDFs.
  - :mod:`app.core.pdf.volunteers`: Volunteer schedule PDFs (fpdf2).
  - :mod:`app.core.pdf.analytics`: Financial-report PDFs (dashboard).
  - :mod:`app.core.pdf.training_invoices`: Training invoice PDFs.

Note: the main conference-invoice PDF generator lives under the invoice
subpackage (:mod:`app.core.invoice.pdf`).
"""

from __future__ import annotations

from app.core.pdf.analytics import build_financial_report_pdf
from app.core.pdf.badges import (
    generate_badge_pdf,
    generate_badge_pdf_from_data,
    generate_badges_bulk,
    generate_qr_preview,
)
from app.core.pdf.trainer_schedule import generate_trainer_schedule_pdf
from app.core.pdf.training_invoices import generate_training_invoice_pdf
from app.core.pdf.volunteers import generate_schedule_pdf

__all__ = [
    "build_financial_report_pdf",
    "generate_badge_pdf",
    "generate_badge_pdf_from_data",
    "generate_badges_bulk",
    "generate_qr_preview",
    "generate_schedule_pdf",
    "generate_trainer_schedule_pdf",
    "generate_training_invoice_pdf",
]
