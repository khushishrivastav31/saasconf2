"""Backwards-compatible shim for :mod:`app.core.security.applicants`.

Moved under ``app.core.security`` in audit Step 28. This shim preserves
the historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.security.applicants import (
    create_applicant_access_token,
    create_applicant_refresh_token,
    decode_applicant_token,
    generate_email_verification_token,
)

__all__ = [
    "create_applicant_access_token",
    "create_applicant_refresh_token",
    "decode_applicant_token",
    "generate_email_verification_token",
]
