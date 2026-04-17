"""ZUGFeRD/Factur-X e-invoice validation and XML generation.

Submodules:
  - :mod:`app.core.zugferd.validation`: Requirement checks for invoice data,
    settings and embedded PDF XML.
  - :mod:`app.core.zugferd.xml`: CII (Cross-Industry Invoice) XML generation.
"""

from __future__ import annotations

from app.core.zugferd.validation import (
    validate_zugferd_pdf,
    validate_zugferd_requirements,
    validate_zugferd_settings,
)
from app.core.zugferd.xml import generate_zugferd_xml

__all__ = [
    "generate_zugferd_xml",
    "validate_zugferd_pdf",
    "validate_zugferd_requirements",
    "validate_zugferd_settings",
]
