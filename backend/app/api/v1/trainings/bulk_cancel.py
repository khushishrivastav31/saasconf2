"""Bulk-cancel-with-credit-note for training registrations.

Two endpoints:

- ``POST /api/v1/trainings/registrations/bulk-cancel/preview`` — read-only
  dry-run. Returns the candidate list, totals, and top-N groupings for the
  given filter so the admin can verify what's about to happen.
- ``POST /api/v1/trainings/registrations/bulk-cancel/confirm`` — applies
  the cancellation. For each matching registration: flips the original
  invoice to ``cancelled``, generates a credit note (negative invoice
  linked via ``related_invoice_id``), removes attendee bridge rows,
  reactivates parked attendees (sets attendee.status = "active"), records
  history + customer-event rows, and (after commit, best-effort)
  deactivates Stripe payment links + initiates refunds + sends credit-note
  emails.

The orchestrator re-uses the same primitives as the per-attendee
``cancel_attendee_registration`` endpoint — ``build_credit_note``,
``generate_training_invoice_number``, ``deactivate_training_payment_link``,
``refund_training_payment``, ``send_training_invoice_email`` — so the two
flows produce ledger-compatible records.
"""

from __future__ import annotations

import logging
from collections import Counter
from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.email.trainings import send_training_invoice_email
from app.core.training_invoice_number import generate_training_invoice_number
from app.core.training_stripe_helper import (
    deactivate_training_payment_link,
    refund_training_payment,
)
from app.models.customer_event import CustomerEventType
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import (
    TrainingRegistration,
    TrainingRegistrationAttendee,
)
from app.schemas.bulk_cancel import (
    MAX_BULK_CANCEL,
    BulkCancelError,
    BulkCancelGroupCount,
    RegistrationBulkCancelFilter,
    RegistrationBulkCancelPreview,
    RegistrationBulkCancelPreviewItem,
    RegistrationBulkCancelResult,
)
from app.services.customer_event_service import CustomerEventService

from ._invoice_helpers import CANCELLABLE_STATUSES, build_credit_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/registrations", tags=["training-registrations"])


# ─────────────────────────────────────────────────────────────────────────
# Filter SQL
# ─────────────────────────────────────────────────────────────────────────


def _apply_filter(
    base_select,  # type: ignore[no-untyped-def]
    *,
    tenant_id: UUID,
    filter_: RegistrationBulkCancelFilter,
):
    """Apply ``filter_`` to a SELECT over TrainingRegistration. Returns the
    narrowed select. Always pins ``tenant_id`` so RLS holds even if the
    caller forgets it.
    """
    stmt = base_select.where(
        TrainingRegistration.tenant_id == tenant_id,
        # Skip already-cancelled rows by default — re-running the same
        # filter after a confirm should match zero, not cancel-twice.
        TrainingRegistration.status != "cancelled",
    )
    if filter_.created_after:
        stmt = stmt.where(TrainingRegistration.created_at >= filter_.created_after)
    if filter_.created_before:
        stmt = stmt.where(TrainingRegistration.created_at <= filter_.created_before)
    if filter_.originating_ip:
        stmt = stmt.where(TrainingRegistration.originating_ip == filter_.originating_ip)
    if filter_.placement_ids:
        stmt = stmt.where(TrainingRegistration.placement_id.in_(filter_.placement_ids))
    if filter_.billing_email_pattern:
        stmt = stmt.where(TrainingRegistration.contact_email.ilike(filter_.billing_email_pattern))
    if filter_.payment_status == "paid":
        stmt = stmt.where(TrainingRegistration.status == "paid")
    elif filter_.payment_status == "unpaid":
        stmt = stmt.where(TrainingRegistration.status != "paid")
    return stmt


def _apply_filter_with_id_subset(
    base_select,  # type: ignore[no-untyped-def]
    *,
    tenant_id: UUID,
    filter_: RegistrationBulkCancelFilter,
):
    """Filter + optional explicit-ID intersection.

    Used by the confirm path so the per-row checkboxes in the preview can
    narrow the cancellation scope without bypassing the filter (which is
    still applied as a safety net — a forged ``registration_ids`` field
    can never reach a row that the filter wouldn't have matched).
    """
    stmt = _apply_filter(base_select, tenant_id=tenant_id, filter_=filter_)
    if filter_.registration_ids:
        stmt = stmt.where(TrainingRegistration.id.in_(filter_.registration_ids))
    return stmt


# ─────────────────────────────────────────────────────────────────────────
# Preview endpoint
# ─────────────────────────────────────────────────────────────────────────


@router.post("/bulk-cancel/preview")
async def preview_bulk_cancel(
    body: RegistrationBulkCancelFilter,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationBulkCancelPreview:
    """Read-only: return the rows that would be cancelled by the given filter."""
    tenant_id = current_user.require_tenant_id()

    # Get total count first (cheap aggregate)
    count_stmt = _apply_filter(
        select(func.count(TrainingRegistration.id)),
        tenant_id=tenant_id,
        filter_=body,
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    # Pull the rows + their training name for the label, capped.
    rows_stmt = (
        _apply_filter(
            select(TrainingRegistration),
            tenant_id=tenant_id,
            filter_=body,
        )
        .options(
            joinedload(TrainingRegistration.placement).joinedload(ProgramYearTraining.training).load_only(Training.name)
        )
        .order_by(TrainingRegistration.created_at.desc())
        .limit(MAX_BULK_CANCEL)
    )
    rows: Sequence[TrainingRegistration] = (await db.execute(rows_stmt)).unique().scalars().all()

    # Sum of credit-note value (positive — credit notes will be the negation)
    total_credit_value = sum((Decimal(str(r.total or 0)) for r in rows), Decimal(0))

    # Top-10 groupings
    ip_counter: Counter[str] = Counter(r.originating_ip or "(unknown)" for r in rows)
    email_counter: Counter[str] = Counter(r.contact_email for r in rows)

    items = [
        RegistrationBulkCancelPreviewItem(
            registration_id=r.id,
            created_at=r.created_at,
            billing_email=r.contact_email,
            originating_ip=r.originating_ip,
            invoice_total=str(r.total or 0),
            invoice_status=r.status,
            label=(r.placement.training.name if r.placement and r.placement.training else "—"),
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
    body: RegistrationBulkCancelFilter,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> RegistrationBulkCancelResult:
    """Cancel each matching registration, generating one credit note per."""
    tenant_id = current_user.require_tenant_id()

    # Cap enforcement on the confirm path. The preview can return any
    # count (with ``truncated=true``); only confirm refuses to act. The
    # cap applies to the FILTER result before the optional id subset is
    # intersected — that way an admin can't sidestep the cap by sending a
    # 400-row id list against a 600-row filter.
    count_stmt = _apply_filter(
        select(func.count(TrainingRegistration.id)),
        tenant_id=tenant_id,
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

    # Pull matching registrations + their invoice + their attendees in one
    # query so the orchestrator can iterate without N+1. Per-row checkbox
    # deselection (``registration_ids``) narrows further, but the filter
    # always remains the safety net.
    rows_stmt = (
        _apply_filter_with_id_subset(
            select(TrainingRegistration),
            tenant_id=tenant_id,
            filter_=body,
        )
        .options(
            joinedload(TrainingRegistration.attendees),
        )
        .order_by(TrainingRegistration.created_at)
    )
    registrations: Sequence[TrainingRegistration] = (await db.execute(rows_stmt)).unique().scalars().all()

    if not registrations:
        return RegistrationBulkCancelResult(
            cancelled=0, credit_notes_created=0, emails_sent=0, refunds_initiated=0, errors=[]
        )

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        # Defensive — a tenant-admin call always has a real tenant.
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Pull all linked invoices in one query, indexed by training_registration_id.
    reg_ids = [r.id for r in registrations]
    inv_stmt = select(TrainingInvoice).where(
        TrainingInvoice.training_registration_id.in_(reg_ids),
        TrainingInvoice.tenant_id == tenant_id,
    )
    invoices_by_reg: dict[UUID, TrainingInvoice] = {}
    for inv in (await db.execute(inv_stmt)).scalars():
        # Multiple invoices per registration is unexpected (the original +
        # any prior credit note); we cancel the original only — the credit
        # note shouldn't be cancelled. Pick the first non-credit-note row.
        if inv.training_registration_id and inv.template_type != "credit_note":
            existing = invoices_by_reg.get(inv.training_registration_id)
            if existing is None or existing.status == "cancelled":
                invoices_by_reg[inv.training_registration_id] = inv

    # ── Mutations (in a single transaction) ──
    cancelled = 0
    credit_notes_for_email: list[tuple[TrainingRegistration, TrainingInvoice, TrainingInvoice]] = []
    payment_links_to_deactivate: list[tuple[UUID, TrainingInvoice]] = []
    refund_candidates: list[tuple[UUID, TrainingInvoice]] = []
    errors: list[BulkCancelError] = []

    reason = body.reason.strip()

    for reg in registrations:
        invoice = invoices_by_reg.get(reg.id)
        if invoice is None:
            errors.append(
                BulkCancelError(
                    registration_id=reg.id,
                    error="No original invoice found for this registration; skipped.",
                )
            )
            continue
        if invoice.status not in CANCELLABLE_STATUSES:
            errors.append(
                BulkCancelError(
                    registration_id=reg.id,
                    error=f"Invoice status '{invoice.status}' is not cancellable; skipped.",
                )
            )
            continue

        # 1. Cancel original invoice
        invoice.status = "cancelled"

        # 2. Generate credit note
        cn_number = await generate_training_invoice_number(db, tenant_id)
        credit_note = build_credit_note(invoice, tenant_id, cn_number, reason)
        db.add(credit_note)

        # 3. Cancel registration + clean up attendee bridges
        reg.status = "cancelled"

        # Find every attendee linked via this registration's bridge rows
        bridge_stmt = select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.registration_id == reg.id,
            TrainingRegistrationAttendee.tenant_id == tenant_id,
        )
        bridges = (await db.execute(bridge_stmt)).scalars().all()
        attendee_ids = [b.attendee_id for b in bridges]
        for bridge in bridges:
            await db.delete(bridge)

        # Re-activate any non-active attendees and write history
        if attendee_ids:
            att_stmt = select(TrainingAttendee).where(
                TrainingAttendee.id.in_(attendee_ids),
                TrainingAttendee.tenant_id == tenant_id,
            )
            attendees = (await db.execute(att_stmt)).scalars().all()
        else:
            attendees = []

        notes = f"invoice={invoice.invoice_number}; credit_note={cn_number}; reason={reason} (bulk)"
        for attendee in attendees:
            attendee.status = "active"
            db.add(
                TrainingAttendeeHistory(
                    tenant_id=tenant_id,
                    attendee_id=attendee.id,
                    event_type="cancelled",
                    placement_id=reg.placement_id,
                    registration_id=reg.id,
                    source_type="registration",
                    source_id=reg.id,
                    notes=notes,
                    created_by=current_user.user_id,
                )
            )
            CustomerEventService.record_for_attendee(
                db,
                attendee,
                event_type=CustomerEventType.TRAINING_CANCELLED,
                created_by=current_user.user_id,
                notes=notes,
                meta={
                    "registration_id": str(reg.id),
                    "placement_id": str(reg.placement_id) if reg.placement_id else None,
                    "invoice_number": invoice.invoice_number,
                    "credit_note_number": cn_number,
                    "reason": reason,
                    "bulk": True,
                },
            )

        cancelled += 1
        credit_notes_for_email.append((reg, invoice, credit_note))

        if invoice.template_type == "credit_card" and invoice.stripe_payment_link_id:
            payment_links_to_deactivate.append((reg.id, invoice))
        if (
            invoice.template_type == "credit_card" and getattr(invoice, "stripe_payment_intent_id", None)
            # Original invoice's status BEFORE we flipped it to "cancelled".
            # ``build_credit_note`` snapshotted everything we need; original
            # was paid iff total non-zero in ledger AND payment intent exists.
            # Conservative check: only refund when the credit note exists
            # (we just built it) AND the original carries a payment intent.
        ):
            refund_candidates.append((reg.id, invoice))

    await db.commit()

    # ── Best-effort post-commit side-effects ──

    refunds_initiated = 0
    for reg_id, invoice in payment_links_to_deactivate:
        try:
            await deactivate_training_payment_link(invoice, tenant)
        except Exception as exc:  # pragma: no cover — defensive
            logger.warning("Bulk-cancel: payment-link deactivate failed for %s: %s", reg_id, exc)
            errors.append(BulkCancelError(registration_id=reg_id, error=f"deactivate: {exc}"))

    for reg_id, invoice in refund_candidates:
        try:
            await refund_training_payment(db, tenant, invoice)
            refunds_initiated += 1
        except Exception as exc:
            logger.warning("Bulk-cancel: refund failed for %s: %s", reg_id, exc)
            errors.append(BulkCancelError(registration_id=reg_id, error=f"refund: {exc}"))

    emails_sent = 0
    for reg, _original, credit_note in credit_notes_for_email:
        try:
            await send_training_invoice_email(db, invoice=credit_note, registration=reg, tenant=tenant)
            emails_sent += 1
        except Exception as exc:
            logger.warning("Bulk-cancel: credit-note email failed for %s: %s", reg.id, exc)
            errors.append(BulkCancelError(registration_id=reg.id, error=f"email: {exc}"))

    return RegistrationBulkCancelResult(
        cancelled=cancelled,
        credit_notes_created=cancelled,
        emails_sent=emails_sent,
        refunds_initiated=refunds_initiated,
        errors=errors,
    )
