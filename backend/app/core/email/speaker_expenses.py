"""Email notifications for speaker expense workflow events.

Four helpers, all fire-and-forget:
- send_expense_submitted  → conference admin(s)  when a speaker submits
- send_expense_approved   → speaker             when admin approves
- send_expense_rejected   → speaker             when admin rejects (includes note)
- send_expense_paid       → speaker             when admin marks paid

Email failures are logged and never surfaced to the caller — the status
transition has already been committed when these are called.
"""

from __future__ import annotations

import logging
from html import escape
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email
from app.core.email.privacy import resolve_privacy_notify_recipients

logger = logging.getLogger(__name__)


async def send_expense_submitted(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_name: str,
    speaker_name: str,
    expense_title: str,
    expense_amount: str,
    tenant_name: str,
) -> bool:
    """Notify conference admin(s) that a speaker has submitted an expense."""
    recipients = await resolve_privacy_notify_recipients(db, tenant_id)
    if not recipients:
        logger.info("expense submitted notify: tenant %s has no admin recipients; skipping", tenant_id)
        return False

    safe_conf = escape(conference_name)
    safe_speaker = escape(speaker_name)
    safe_title = escape(expense_title)
    safe_amount = escape(expense_amount)
    safe_tenant = escape(tenant_name)

    subject = f"[{conference_name}] New expense submitted by {speaker_name}"
    html = f"""\
<p>A speaker has submitted a new expense for review.</p>
<ul>
  <li><strong>Conference:</strong> {safe_conf}</li>
  <li><strong>Speaker:</strong> {safe_speaker}</li>
  <li><strong>Expense:</strong> {safe_title}</li>
  <li><strong>Amount:</strong> {safe_amount}</li>
</ul>
<p>Please review it in the <strong>{safe_tenant}</strong> admin panel under
Conferences &rarr; Speaker Expenses.</p>
"""
    text = (
        f"A speaker has submitted a new expense for review.\n"
        f"Conference: {conference_name}\n"
        f"Speaker: {speaker_name}\n"
        f"Expense: {expense_title}\n"
        f"Amount: {expense_amount}\n"
        f"Review it in the {tenant_name} admin panel.\n"
    )

    sent_any = False
    for recipient in recipients:
        ok = await send_email(
            recipient,
            subject,
            html,
            text,
            db=db,
            tenant_id=tenant_id,
            email_type="expense_submitted",
        )
        sent_any = sent_any or ok
    return sent_any


async def send_expense_approved(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    recipient_email: str,
    speaker_name: str,
    expense_title: str,
    expense_amount: str,
    conference_name: str,
    tenant_name: str,
) -> bool:
    """Notify the speaker that their expense has been approved."""
    safe_speaker = escape(speaker_name)
    safe_title = escape(expense_title)
    safe_amount = escape(expense_amount)
    safe_conf = escape(conference_name)
    safe_tenant = escape(tenant_name)

    subject = f"Your expense has been approved — {conference_name}"
    html = f"""\
<p>Hi {safe_speaker},</p>
<p>Your expense submission has been <strong>approved</strong>.</p>
<ul>
  <li><strong>Conference:</strong> {safe_conf}</li>
  <li><strong>Expense:</strong> {safe_title}</li>
  <li><strong>Amount:</strong> {safe_amount}</li>
</ul>
<p>Payment will be arranged by <strong>{safe_tenant}</strong>. You will receive
a confirmation once the payment has been processed.</p>
<p>— {safe_tenant}</p>
"""
    text = (
        f"Hi {speaker_name},\n"
        f"Your expense has been approved.\n"
        f"Conference: {conference_name}\n"
        f"Expense: {expense_title}\n"
        f"Amount: {expense_amount}\n"
        f"Payment will be arranged by {tenant_name}.\n"
    )
    return await send_email(
        recipient_email,
        subject,
        html,
        text,
        db=db,
        tenant_id=tenant_id,
        email_type="expense_approved",
    )


async def send_expense_rejected(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    recipient_email: str,
    speaker_name: str,
    expense_title: str,
    conference_name: str,
    review_notes: str,
    tenant_name: str,
) -> bool:
    """Notify the speaker that their expense has been rejected (includes reason)."""
    safe_speaker = escape(speaker_name)
    safe_title = escape(expense_title)
    safe_conf = escape(conference_name)
    safe_notes = escape(review_notes.strip()) if review_notes and review_notes.strip() else ""
    safe_tenant = escape(tenant_name)

    subject = f"Your expense was not approved — {conference_name}"
    html = f"""\
<p>Hi {safe_speaker},</p>
<p>Your expense submission for <strong>{safe_conf}</strong> was
<strong>not approved</strong>.</p>
<ul>
  <li><strong>Expense:</strong> {safe_title}</li>
</ul>
<p><strong>Reason:</strong><br>{safe_notes}</p>
<p>You may update and resubmit the expense, or contact
<strong>{safe_tenant}</strong> if you have questions.</p>
<p>— {safe_tenant}</p>
"""
    text = (
        f"Hi {speaker_name},\n"
        f"Your expense for {conference_name} was not approved.\n"
        f"Expense: {expense_title}\n"
        f"Reason: {review_notes.strip() if review_notes else ''}\n"
        f"You may update and resubmit, or contact {tenant_name}.\n"
    )
    return await send_email(
        recipient_email,
        subject,
        html,
        text,
        db=db,
        tenant_id=tenant_id,
        email_type="expense_rejected",
    )


async def send_expense_paid(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    recipient_email: str,
    speaker_name: str,
    expense_title: str,
    expense_amount: str,
    conference_name: str,
    payment_reference: str | None,
    tenant_name: str,
) -> bool:
    """Notify the speaker that their expense has been paid."""
    safe_speaker = escape(speaker_name)
    safe_title = escape(expense_title)
    safe_amount = escape(expense_amount)
    safe_conf = escape(conference_name)
    safe_tenant = escape(tenant_name)
    ref_block = ""
    if payment_reference:
        safe_ref = escape(payment_reference)
        ref_block = f"<li><strong>Reference:</strong> {safe_ref}</li>"

    subject = f"Your expense payment has been processed — {conference_name}"
    html = f"""\
<p>Hi {safe_speaker},</p>
<p>Your expense for <strong>{safe_conf}</strong> has been
<strong>paid</strong>.</p>
<ul>
  <li><strong>Expense:</strong> {safe_title}</li>
  <li><strong>Amount:</strong> {safe_amount}</li>
  {ref_block}
</ul>
<p>If you have any questions, please contact <strong>{safe_tenant}</strong>.</p>
<p>— {safe_tenant}</p>
"""
    ref_line = f"Reference: {payment_reference}\n" if payment_reference else ""
    text = (
        f"Hi {speaker_name},\n"
        f"Your expense for {conference_name} has been paid.\n"
        f"Expense: {expense_title}\n"
        f"Amount: {expense_amount}\n"
        f"{ref_line}"
        f"Contact {tenant_name} with any questions.\n"
    )
    return await send_email(
        recipient_email,
        subject,
        html,
        text,
        db=db,
        tenant_id=tenant_id,
        email_type="expense_paid",
    )
