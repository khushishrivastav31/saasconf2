"""Backwards-compatible shim for :mod:`app.core.email.templates`.

Moved under ``app.core.email`` in audit Step 28. This shim preserves the
historical import path and will be removed once callers are updated.
"""

from __future__ import annotations

from app.core.email.templates import (
    RenderedEmail,
    build_attendee_welcome_context,
    build_conference_team_invitation_context,
    build_cospeaker_context,
    build_deadline_reminder_context,
    build_direct_message_context,
    build_invoice_send_context,
    build_new_message_context,
    build_password_reset_context,
    build_payment_overdue_admin_context,
    build_payment_reminder_context,
    build_registration_cancellation_context,
    build_registration_invoice_context,
    build_sponsor_contract_context,
    build_submission_context,
    build_tenant_welcome_context,
    build_verification_context,
    get_template,
    render_email,
    replace_placeholders,
)

__all__ = [
    "RenderedEmail",
    "build_attendee_welcome_context",
    "build_conference_team_invitation_context",
    "build_cospeaker_context",
    "build_deadline_reminder_context",
    "build_direct_message_context",
    "build_invoice_send_context",
    "build_new_message_context",
    "build_password_reset_context",
    "build_payment_overdue_admin_context",
    "build_payment_reminder_context",
    "build_registration_cancellation_context",
    "build_registration_invoice_context",
    "build_sponsor_contract_context",
    "build_submission_context",
    "build_tenant_welcome_context",
    "build_verification_context",
    "get_template",
    "render_email",
    "replace_placeholders",
]
