"""Bulk-cancel-with-credit-note for conference registrations.

Conference counterpart to ``app/api/v1/trainings/bulk_cancel.py``. Same
shared filter schema (``app/schemas/bulk_cancel.py``) and same
preview/confirm shape, but the underlying cancellation primitives are
the conference-side ones:

  - ``cancel_registrations_for_invoice`` (cancels registrations + access)
  - ``create_credit_note_for_invoice`` (builds the negative invoice)
  - ``generate_cancellation_number`` (per-conference invoice numbering)
  - ``deactivate_payment_link_for_invoice`` (Stripe link)
  - ``refund_payment`` (Stripe refund for paid CC)
  - ``send_invoice_email`` (credit-note email)

Conference rows have a 1:N billing-profile-to-registration shape (one
multi-attendee submission can produce multiple registrations sharing a
billing profile + invoice). The orchestrator therefore deduplicates by
``billing_profile_id`` so each invoice is cancelled exactly once even
when the filter matches several of its registrations.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import (
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.invoice.email import send_invoice_email
from app.core.invoice.registration_cancellation import cancel_registrations_for_invoice
from app.core.invoice_number import generate_cancellation_number
from app.core.invoice_operations import create_credit_note_for_invoice
from app.core.stripe_helper import deactivate_payment_link_for_invoice, refund_payment
from app.models.audit import AuditLog
from app.models.booking import BookingOption
from app.models.invoice import Invoice
from app.models.registration import Registration, RegistrationStatus
from app.models.tenant import Tenant
from app.schemas.bulk_cancel import (
    MAX_BULK_CANCEL,
    BulkCancelError,
    BulkCancelGroupCount,
    RegistrationBulkCancelFilter,
    RegistrationBulkCancelPreview,
    RegistrationBulkCancelPreviewItem,
    RegistrationBulkCancelResult,
)

logger = logging.getLogger(__name__)

# The router is mounted under /conferences/{conference_id}/registrations,
# so the URLs land at /conferences/{conference_id}/registrations/bulk-cancel/*.
MODULE_CODE = "conferences"
router = APIRouter(dependencies=[Depends(require_module(MODULE_CODE))])


# ─────────────────────────────────────────────────────────────────────────
# Filter SQL
# ─────────────────────────────────────────────────────────────────────────


def _apply_filter(
    base_select,  # type: ignore[no-untyped-def]
    *,
    tenant_id: UUID,
    conference_id: UUID,
    filter_: RegistrationBulkCancelFilter,
):
    """Apply ``filter_`` to a SELECT over Registration. Tenant + conference
    are always pinned (defense-in-depth on top of RLS).

    Joins ``BillingProfile`` (so ``billing_email_pattern`` / ``payment_status``
    can read fields that live there) and the linked ``Invoice`` (so payment
    status can be read off the invoice).
    """
    stmt = base_select.where(
        Registration.tenant_id == tenant_id,
        Registration.conference_id == conference_id,
        Registration.status != RegistrationStatus.CANCELLED.value,
    )
    if filter_.created_after:
        stmt = stmt.where(Registration.created_at >= filter_.created_after)
    if filter_.created_before:
        stmt = stmt.where(Registration.created_at <= filter_.created_before)
    if filter_.originating_ip:
        stmt = stmt.where(Registration.originating_ip == filter_.originating_ip)
    if filter_.booking_option_ids:
        stmt = stmt.where(Registration.booking_option_id.in_(filter_.booking_option_ids))
    # NOTE: ``billing_email_pattern`` is intentionally NOT applied on the
    # conference surface. ``BillingProfile.contact_email`` is PII-encrypted
    # (stored in ``contact_email_encrypted`` + a ``contact_email_hash`` for
    # exact lookups only), so an ILIKE pattern can't be evaluated in SQL.
    # The endpoint returns 400 if it's set; admins should rely on
    # originating_ip + time window for the same attacks.
    if filter_.payment_status in ("paid", "unpaid"):
        # Payment status sits on the linked Invoice. The orchestrator does
        # the join via recipient_source_type='registration' +
        # recipient_source_id=billing_profile_id (set in
        # cancel_registrations_for_invoice's docstring).
        stmt = stmt.join(
            Invoice,
            (Invoice.recipient_source_type == "registration")
            & (Invoice.recipient_source_id == Registration.billing_profile_id),
        )
        if filter_.payment_status == "paid":
            stmt = stmt.where(Invoice.status == "paid")
        else:
            stmt = stmt.where(Invoice.status != "paid")
    return stmt


def _apply_filter_with_id_subset(
    base_select,  # type: ignore[no-untyped-def]
    *,
    tenant_id: UUID,
    conference_id: UUID,
    filter_: RegistrationBulkCancelFilter,
):
    """Filter + optional explicit-ID intersection (drives per-row
    deselection in the preview UI). Filter remains a safety net.
    """
    stmt = _apply_filter(base_select, tenant_id=tenant_id, conference_id=conference_id, filter_=filter_)
    if filter_.registration_ids:
        stmt = stmt.where(Registration.id.in_(filter_.registration_ids))
    return stmt


# ─────────────────────────────────────────────────────────────────────────
# Preview endpoint
# ─────────────────────────────────────────────────────────────────────────


@router.post("/bulk-cancel/preview")
async def preview_bulk_cancel(
    conference_id: UUID,
    body: RegistrationBulkCancelFilter,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationBulkCancelPreview:
    """Read-only: return the rows that would be cancelled by this filter."""
    if body.billing_email_pattern:
        raise HTTPException(
            status_code=400,
            detail=(
                "billing_email_pattern is not supported on conference "
                "registrations — the email is PII-encrypted at rest and "
                "cannot be ILIKE-matched. Use originating_ip + time "
                "window instead."
            ),
        )
    tenant_id = current_user.require_tenant_id()
    # Verify the conference exists under this tenant — bounces 404 before
    # the SQL filter runs.
    await get_conference_for_tenant(db, conference_id, tenant_id)

    count_stmt = _apply_filter(
        select(func.count(Registration.id)),
        tenant_id=tenant_id,
        conference_id=conference_id,
        filter_=body,
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    rows_stmt = (
        _apply_filter(
            select(Registration),
            tenant_id=tenant_id,
            conference_id=conference_id,
            filter_=body,
        )
        .options(
            joinedload(Registration.billing_profile),
        )
        .order_by(Registration.created_at.desc())
        .limit(MAX_BULK_CANCEL)
    )
    rows: Sequence[Registration] = (await db.execute(rows_stmt)).unique().scalars().all()

    # Resolve booking-option labels (one extra query for the visible rows)
    booking_option_ids = {r.booking_option_id for r in rows if r.booking_option_id}
    bo_label: dict[UUID, str] = {}
    if booking_option_ids:
        bo_rows = (
            (await db.execute(select(BookingOption).where(BookingOption.id.in_(booking_option_ids)))).scalars().all()
        )
        bo_label = {bo.id: bo.name for bo in bo_rows}

    # Resolve linked invoices for the totals (a multi-attendee submission
    # shares one invoice across N registrations — sum once per invoice so
    # we don't multi-count). Group by billing_profile_id.
    billing_profile_ids = {r.billing_profile_id for r in rows if r.billing_profile_id}
    invoice_totals: dict[UUID, Decimal] = {}
    if billing_profile_ids:
        inv_rows = (
            (
                await db.execute(
                    select(Invoice).where(
                        Invoice.tenant_id == tenant_id,
                        Invoice.recipient_source_type == "registration",
                        Invoice.recipient_source_id.in_(billing_profile_ids),
                        Invoice.template_type != "credit_note",
                    )
                )
            )
            .scalars()
            .all()
        )
        for inv in inv_rows:
            if inv.recipient_source_id and inv.status != "cancelled":
                invoice_totals[inv.recipient_source_id] = Decimal(str(inv.total or 0))

    total_credit_value = sum(invoice_totals.values(), Decimal(0))

    def _email_of(r: Registration) -> str:
        if r.billing_profile and r.billing_profile.contact_email:
            return r.billing_profile.contact_email
        return "(unknown)"

    ip_counter: Counter[str] = Counter(r.originating_ip or "(unknown)" for r in rows)
    email_counter: Counter[str] = Counter(_email_of(r) for r in rows)

    items = [
        RegistrationBulkCancelPreviewItem(
            registration_id=r.id,
            created_at=r.created_at,
            billing_email=_email_of(r),
            originating_ip=r.originating_ip,
            invoice_total=str(
                invoice_totals.get(r.billing_profile_id, Decimal(0)) if r.billing_profile_id else Decimal(0)
            ),
            invoice_status=None,
            label=bo_label.get(r.booking_option_id, "—") if r.booking_option_id else "—",
        )
        for r in rows
    ]

    return RegistrationBulkCancelPreview(
        total=total,
        truncated=total > MAX_BULK_CANCEL,
        total_credit_note_value=str(total_credit_value),
        by_originating_ip=[BulkCancelGroupCount(key=ip, count=c) for ip, c in ip_counter.most_common(10)],
        by_billing_email=[BulkCancelGroupCount(key=e, count=c) for e, c in email_counter.most_common(10)],
        items=items,
    )


# ─────────────────────────────────────────────────────────────────────────
# Confirm endpoint
# ─────────────────────────────────────────────────────────────────────────


@router.post("/bulk-cancel/confirm")
async def confirm_bulk_cancel(
    conference_id: UUID,
    body: RegistrationBulkCancelFilter,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationBulkCancelResult:
    """Cancel each matching invoice, generating one credit note per."""
    if body.billing_email_pattern:
        raise HTTPException(
            status_code=400,
            detail=(
                "billing_email_pattern is not supported on conference "
                "registrations — the email is PII-encrypted at rest."
            ),
        )
    tenant_id = current_user.require_tenant_id()
    conference = await get_conference_for_tenant(db, conference_id, tenant_id)

    # Cap on the FILTER count (so a 400-row id list against a 600-row
    # filter still hits the cap).
    count_stmt = _apply_filter(
        select(func.count(Registration.id)),
        tenant_id=tenant_id,
        conference_id=conference_id,
        filter_=body,
    )
    total = (await db.execute(count_stmt)).scalar() or 0
    if total > MAX_BULK_CANCEL:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Filter matches {total} registrations — at most "
                f"{MAX_BULK_CANCEL} per call. Narrow the filter and retry."
            ),
        )

    # Pull matching registrations narrowed by the optional id subset.
    rows_stmt = _apply_filter_with_id_subset(
        select(Registration),
        tenant_id=tenant_id,
        conference_id=conference_id,
        filter_=body,
    ).order_by(Registration.created_at)
    registrations: Sequence[Registration] = (await db.execute(rows_stmt)).unique().scalars().all()
    if not registrations:
        return RegistrationBulkCancelResult(
            cancelled=0, credit_notes_created=0, emails_sent=0, refunds_initiated=0, errors=[]
        )

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Group registrations by billing_profile_id — each unique billing
    # profile maps to one Invoice + one credit note. A multi-attendee
    # submission with 3 registrations under one billing profile gets ONE
    # credit note for the bundled invoice, not three.
    by_billing: dict[UUID, list[Registration]] = defaultdict(list)
    for reg in registrations:
        if reg.billing_profile_id:
            by_billing[reg.billing_profile_id].append(reg)

    # Pull invoices for those billing profiles (skip credit notes; we want
    # the originals).
    inv_stmt = select(Invoice).where(
        Invoice.tenant_id == tenant_id,
        Invoice.recipient_source_type == "registration",
        Invoice.recipient_source_id.in_(list(by_billing.keys())),
        Invoice.template_type != "credit_note",
    )
    invoices_by_profile: dict[UUID, Invoice] = {}
    for inv in (await db.execute(inv_stmt)).scalars():
        if inv.recipient_source_id and inv.status != "cancelled":
            invoices_by_profile[inv.recipient_source_id] = inv

    # ── Mutations ─────────────────────────────────────────────────────
    cancelled = 0
    credit_notes_created = 0
    refunds_pending: list[tuple[UUID, Invoice]] = []
    deactivate_pending: list[tuple[UUID, Invoice]] = []
    emails_pending: list[Invoice] = []
    errors: list[BulkCancelError] = []
    reason = body.reason.strip()

    for billing_profile_id, regs in by_billing.items():
        invoice = invoices_by_profile.get(billing_profile_id)
        if invoice is None:
            for r in regs:
                errors.append(
                    BulkCancelError(
                        registration_id=r.id,
                        error="No active invoice for this registration's billing profile.",
                    )
                )
            continue
        if invoice.status not in ("sent", "overdue", "paid"):
            for r in regs:
                errors.append(
                    BulkCancelError(
                        registration_id=r.id,
                        error=f"Invoice status '{invoice.status}' is not cancellable.",
                    )
                )
            continue

        # Schedule Stripe refund + payment-link deactivation for after commit.
        if invoice.template_type == "credit_card":
            deactivate_pending.append((regs[0].id, invoice))
            if invoice.status == "paid" and invoice.stripe_payment_intent_id:
                refunds_pending.append((regs[0].id, invoice))

        # Cancel the invoice
        invoice.status = "cancelled"
        invoice.internal_comment = f"{reason} (bulk cancel)"

        # Build credit note
        cancellation_number = await generate_cancellation_number(db, conference_id, tenant_id)
        credit_note = create_credit_note_for_invoice(invoice, cancellation_number, tenant_id, conference_id)
        db.add(credit_note)
        credit_notes_created += 1

        # Audit log entries — mirror the single-cancel shape
        db.add_all(
            [
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=current_user.user_id,
                    action="invoice.cancelled",
                    resource_type="invoice",
                    resource_id=invoice.id,
                    details={
                        "invoice_number": invoice.invoice_number,
                        "reason": reason,
                        "bulk": True,
                        "registration_count": len(regs),
                    },
                ),
                AuditLog(
                    tenant_id=tenant_id,
                    user_id=current_user.user_id,
                    action="invoice.credit_note_created",
                    resource_type="invoice",
                    resource_id=credit_note.id,
                    details={
                        "credit_note_number": cancellation_number,
                        "bulk": True,
                    },
                ),
            ]
        )

        emails_pending.append(credit_note)

    await db.flush()

    # Cancel registrations + access for every invoice we just cancelled.
    # ``cancel_registrations_for_invoice`` returns the count of rows
    # actually flipped (excludes already-cancelled).
    for billing_profile_id, _regs in by_billing.items():
        invoice = invoices_by_profile.get(billing_profile_id)
        if invoice is None or invoice.status != "cancelled":
            continue
        try:
            n_cancelled, _, _ = await cancel_registrations_for_invoice(
                db,
                invoice,
                conference,
                tenant_id,
                current_user.user_id,
                cancellation_message=reason,
            )
            cancelled += n_cancelled
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("Bulk-cancel: registration-cancel failed for invoice %s: %s", invoice.id, exc)
            for r in _regs:
                errors.append(BulkCancelError(registration_id=r.id, error=f"reg-cancel: {exc}"))

    # Bulk-level audit log
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action="registration.bulk_cancel",
            resource_type="conference",
            resource_id=conference_id,
            details={
                "filter": body.model_dump(mode="json"),
                "cancelled": cancelled,
                "credit_notes_created": credit_notes_created,
                "reason": reason,
            },
        )
    )

    await db.commit()

    # ── Best-effort post-commit side-effects ─────────────────────────
    refunds_initiated = 0
    for reg_id, invoice in deactivate_pending:
        try:
            await deactivate_payment_link_for_invoice(invoice, conference)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("Bulk-cancel: payment-link deactivate failed for %s: %s", reg_id, exc)
            errors.append(BulkCancelError(registration_id=reg_id, error=f"deactivate: {exc}"))

    for reg_id, invoice in refunds_pending:
        try:
            await refund_payment(db, conference, invoice, current_user, None, "requested_by_customer")
            refunds_initiated += 1
        except Exception as exc:
            logger.warning("Bulk-cancel: refund failed for %s: %s", reg_id, exc)
            errors.append(BulkCancelError(registration_id=reg_id, error=f"refund: {exc}"))

    emails_sent = 0
    for credit_note in emails_pending:
        try:
            await send_invoice_email(db, credit_note, conference)
            emails_sent += 1
        except Exception as exc:
            logger.warning("Bulk-cancel: credit-note email failed for %s: %s", credit_note.id, exc)

    return RegistrationBulkCancelResult(
        cancelled=cancelled,
        credit_notes_created=credit_notes_created,
        emails_sent=emails_sent,
        refunds_initiated=refunds_initiated,
        errors=errors,
    )
