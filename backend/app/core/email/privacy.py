"""Email notifications for portal-initiated privacy requests.

Fired when a signed-in ``PortalUser`` files a request under Art. 15 (export)
or Art. 17 (erasure) via ``POST /portal/me/privacy-requests``. Two
recipients:

* **The subject** — a confirmation that the request was received and what
  happens next.
* **The tenant contact** — an alert that a new request is awaiting admin
  review in the MyCompany Privacy panel.

Both are fire-and-forget (``send_email_background``). Failures are logged
to ``email_logs`` by :func:`app.core.email.send_email` and never surface
to the portal user — the row has already been persisted, so the admin
still sees it in their queue.
"""

from __future__ import annotations

import logging
from html import escape
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.email import send_email
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


def _pick_tenant_contact_email(tenant: Tenant) -> str | None:
    """Return the first contact_persons[].email, or the Resend from-address."""
    for cp in tenant.contact_persons or []:
        if isinstance(cp, dict):
            candidate = (cp.get("email") or "").strip()
            if candidate:
                return candidate
    return (tenant.resend_from_email or "").strip() or None


def _request_type_label(request_type: str) -> str:
    return {"erasure": "Deletion (Art. 17)", "export": "Data export (Art. 15)"}.get(request_type, request_type)


async def send_privacy_request_user_confirmation(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    recipient_email: str,
    request_type: str,
    notes: str | None,
    tenant_name: str,
) -> bool:
    """Confirm to the portal user that their request was received."""
    label = _request_type_label(request_type)
    safe_notes = escape(notes.strip()) if notes and notes.strip() else ""
    notes_block = f"<p><strong>Your note:</strong><br>{safe_notes}</p>" if safe_notes else ""
    tenant_name_safe = escape(tenant_name)

    subject = f"We received your privacy request — {tenant_name}"
    html = f"""\
<p>Hi,</p>
<p>This is a confirmation that <strong>{tenant_name_safe}</strong> received
your privacy request:</p>
<ul>
  <li><strong>Type:</strong> {escape(label)}</li>
  <li><strong>Email on file:</strong> {escape(recipient_email)}</li>
</ul>
{notes_block}
<p>An administrator will review the request and follow up by email once it
has been processed. Under the GDPR, we are required to respond within one
month.</p>
<p>If you did not file this request, please reply to this email right away.</p>
<p>— {tenant_name_safe}</p>
"""
    text = (
        f"We received your privacy request from {tenant_name}.\n"
        f"Type: {label}\n"
        f"Email on file: {recipient_email}\n"
        + (f"Your note: {notes.strip()}\n" if notes and notes.strip() else "")
        + "\nAn administrator will review the request and follow up by email "
        "once it has been processed.\n"
        "If you did not file this request, please reply to this email right away.\n"
    )

    return await send_email(
        recipient_email,
        subject,
        html,
        text,
        db=db,
        tenant_id=tenant_id,
        email_type="privacy_request_confirmation",
    )


async def send_privacy_request_admin_notification(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    request_type: str,
    subject_email: str,
    notes: str | None,
) -> bool:
    """Notify the tenant contact that a new privacy request needs review.

    Resolves the recipient from ``tenant.contact_persons[0].email`` (falls
    back to ``tenant.resend_from_email``). No-ops when neither is set —
    the request is still visible in the admin UI.
    """
    settings = get_settings()

    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if tenant is None:
        logger.warning("privacy admin notify: tenant %s not found", tenant_id)
        return False

    admin_email = _pick_tenant_contact_email(tenant)
    if not admin_email:
        logger.info(
            "privacy admin notify: tenant %s has no contact_persons email; skipping",
            tenant_id,
        )
        return False

    label = _request_type_label(request_type)
    safe_notes = escape(notes.strip()) if notes and notes.strip() else ""
    notes_block = f"<p><strong>User's note:</strong><br>{safe_notes}</p>" if safe_notes else ""
    tenant_name_safe = escape(tenant.name)
    admin_link = f"{settings.FRONTEND_BASE_URL}/my-company"

    subject = f"[{tenant.name}] New privacy request — {label}"
    html = f"""\
<p>A portal user has filed a new privacy request for
<strong>{tenant_name_safe}</strong>.</p>
<ul>
  <li><strong>Type:</strong> {escape(label)}</li>
  <li><strong>Subject email:</strong> {escape(subject_email)}</li>
</ul>
{notes_block}
<p>Please review the request in the
<a href="{escape(admin_link)}">MyCompany &rarr; Privacy</a> panel. Erasure
requests require human review before execution.</p>
"""
    text = (
        f"A portal user has filed a new privacy request for {tenant.name}.\n"
        f"Type: {label}\n"
        f"Subject email: {subject_email}\n"
        + (f"User's note: {notes.strip()}\n" if notes and notes.strip() else "")
        + f"\nReview it in the admin portal: {admin_link}\n"
    )

    return await send_email(
        admin_email,
        subject,
        html,
        text,
        db=db,
        tenant_id=tenant_id,
        email_type="privacy_request_admin_notify",
    )
