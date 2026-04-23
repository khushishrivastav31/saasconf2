"""Cancel a public-portal training registration.

Replaces the *Deactivate* action on parked attendees and also surfaces in the
Attendee list for active portal-origin attendees. One Cancel click ==
one booking:

    - attendee.status stays / becomes ``active`` (never ``inactive``)
    - TrainingRegistrationAttendee bridge row is deleted (mirrors park)
    - TrainingRegistration.status and its TrainingInvoice.status flip to
      ``cancelled``
    - A credit-note TrainingInvoice is generated (negated totals,
      related_invoice_id pointing back to the original) and emailed via
      ``send_training_invoice_email``. The email path inherits the
      accounting-email CC guard introduced alongside ``tenants.accounting_email``.
    - A ``cancelled`` history event + a ``CustomerEventType.TRAINING_CANCELLED``
      customer event are recorded.

Blocked with a clear 400 when:
    - attendee has an OfferAttendee row (offer-origin — financial path differs)
    - no resolvable TrainingRegistration (missing bridge and no registration_id
      on the park history)
    - the registration has more than one attendee (use the Invoices view
      to cancel the whole registration — one Cancel click must map to one
      booking, never cascade surprise-delete co-attendees)
    - the invoice status is not in ``CANCELLABLE_STATUSES`` (e.g. draft)
"""

import logging
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.email.trainings import send_training_invoice_email
from app.core.exceptions import NotFoundError, ValidationError
from app.core.training_invoice_number import generate_training_invoice_number
from app.core.training_stripe_helper import deactivate_training_payment_link
from app.models.customer_event import CustomerEventType
from app.models.offer_attendee import OfferAttendee
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.services.customer_event_service import CustomerEventService

from .._invoice_helpers import CANCELLABLE_STATUSES, build_credit_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


class CancelAttendeeRequest(BaseModel):
    reason: str | None = None


async def _has_offer_origin(db: DbSessionDep, attendee_id: UUID) -> bool:
    """Offer-origin attendees aren't cancellable via this endpoint."""
    result = await db.execute(
        select(func.count()).select_from(OfferAttendee).where(OfferAttendee.attendee_id == attendee_id)
    )
    return (result.scalar() or 0) > 0


async def _resolve_registration(
    db: DbSessionDep, attendee: TrainingAttendee, tenant_id: UUID
) -> TrainingRegistration | None:
    """Return the single TrainingRegistration this attendee's booking points at.

    - Active attendees: walk ``TrainingRegistrationAttendee.attendee_id``.
    - Parked attendees: the bridge row is gone, so read ``registration_id``
      off the most recent ``parked`` history entry. This column was added
      in migration 212 and is back-populated for pre-existing rows where
      placement + email-hash uniquely identify the registration.
    """
    target_reg_id: UUID | None
    if attendee.status != "parked":
        bridge_result = await db.execute(
            select(TrainingRegistrationAttendee.registration_id).where(
                TrainingRegistrationAttendee.attendee_id == attendee.id,
                TrainingRegistrationAttendee.tenant_id == tenant_id,
            )
        )
        reg_ids = [rid for rid in bridge_result.scalars().all() if rid is not None]
        if len(reg_ids) != 1:
            # 0 = active but never portal-registered; >1 = ambiguous, shouldn't
            # happen in practice but refuse rather than guess.
            return None
        target_reg_id = reg_ids[0]
    else:
        hist_result = await db.execute(
            select(TrainingAttendeeHistory.registration_id)
            .where(
                TrainingAttendeeHistory.attendee_id == attendee.id,
                TrainingAttendeeHistory.event_type == "parked",
                TrainingAttendeeHistory.tenant_id == tenant_id,
                TrainingAttendeeHistory.registration_id.is_not(None),
            )
            .order_by(TrainingAttendeeHistory.created_at.desc())
            .limit(1)
        )
        target_reg_id = hist_result.scalar_one_or_none()
        if target_reg_id is None:
            return None

    reg_load = await db.execute(
        select(TrainingRegistration).where(
            TrainingRegistration.id == target_reg_id,
            TrainingRegistration.tenant_id == tenant_id,
        )
    )
    return reg_load.scalar_one_or_none()


async def _count_registration_attendees(db: DbSessionDep, registration_id: UUID) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(TrainingRegistrationAttendee)
        .where(TrainingRegistrationAttendee.registration_id == registration_id)
    )
    return result.scalar() or 0


async def batch_cancellable_attendee_ids(
    db: DbSessionDep, attendees: list[TrainingAttendee], tenant_id: UUID
) -> set[UUID]:
    """Return the subset of attendee ids that are currently cancellable.

    Used by the list endpoint to drive the Cancel-button visible state in
    one pass — O(constant) queries for the whole page instead of O(N).
    """
    if not attendees:
        return set()

    att_ids = [a.id for a in attendees]

    # 1. Offer-origin disqualifies.
    offer_rows = await db.execute(select(OfferAttendee.attendee_id).where(OfferAttendee.attendee_id.in_(att_ids)))
    has_offer: set[UUID] = {row[0] for row in offer_rows.all()}

    # 2. Active attendees → registration_id via the bridge table.
    bridge_rows = await db.execute(
        select(
            TrainingRegistrationAttendee.attendee_id,
            TrainingRegistrationAttendee.registration_id,
        ).where(
            TrainingRegistrationAttendee.attendee_id.in_(att_ids),
            TrainingRegistrationAttendee.tenant_id == tenant_id,
        )
    )
    attendee_to_reg: dict[UUID, UUID] = {}
    reg_bridge_counts: dict[UUID, int] = {}
    for att_id, reg_id in bridge_rows.all():
        # If an attendee has multiple bridge rows, keep them off the happy
        # path (ambiguous which registration to cancel).
        attendee_to_reg[att_id] = attendee_to_reg.get(att_id, reg_id)
        reg_bridge_counts[reg_id] = reg_bridge_counts.get(reg_id, 0) + 1

    # 3. Parked attendees → registration_id via the most-recent ``parked``
    #    history row. Only consider parked attendees that didn't already
    #    resolve via a (stale) bridge row.
    parked_ids = [a.id for a in attendees if a.status == "parked" and a.id not in attendee_to_reg]
    if parked_ids:
        hist_rows = await db.execute(
            select(
                TrainingAttendeeHistory.attendee_id,
                TrainingAttendeeHistory.registration_id,
                TrainingAttendeeHistory.created_at,
            ).where(
                TrainingAttendeeHistory.attendee_id.in_(parked_ids),
                TrainingAttendeeHistory.event_type == "parked",
                TrainingAttendeeHistory.registration_id.is_not(None),
                TrainingAttendeeHistory.tenant_id == tenant_id,
            )
        )
        latest_per_attendee: dict[UUID, tuple] = {}
        for att_id, reg_id, created_at in hist_rows.all():
            prior = latest_per_attendee.get(att_id)
            if prior is None or created_at > prior[1]:
                latest_per_attendee[att_id] = (reg_id, created_at)
        for att_id, (reg_id, _) in latest_per_attendee.items():
            attendee_to_reg[att_id] = reg_id

    reg_ids = list({r for r in attendee_to_reg.values()})
    if not reg_ids:
        return set()

    # 4. Invoice status per registration (1:1).
    inv_rows = await db.execute(
        select(TrainingInvoice.training_registration_id, TrainingInvoice.status, TrainingInvoice.template_type).where(
            TrainingInvoice.training_registration_id.in_(reg_ids)
        )
    )
    invoice_by_reg: dict[UUID, tuple[str, str]] = {}
    for reg_id, status, template_type in inv_rows.all():
        if reg_id is None:
            continue
        invoice_by_reg[reg_id] = (status, template_type)

    cancellable: set[UUID] = set()
    for att in attendees:
        if att.id in has_offer:
            continue
        reg_id = attendee_to_reg.get(att.id)
        if reg_id is None:
            continue
        # Multi-attendee block — only for active attendees; parked attendees
        # left zero siblings behind when they were parked.
        if att.status != "parked" and reg_bridge_counts.get(reg_id, 0) > 1:
            continue
        if att.status == "parked" and reg_bridge_counts.get(reg_id, 0) > 0:
            continue
        inv = invoice_by_reg.get(reg_id)
        if inv is None:
            continue
        status, template_type = inv
        if template_type == "credit_note":
            continue
        if status not in CANCELLABLE_STATUSES:
            continue
        cancellable.add(att.id)

    return cancellable


async def is_attendee_cancellable(db: DbSessionDep, attendee: TrainingAttendee, tenant_id: UUID) -> bool:
    """Used by the Attendee list response to drive the UI disabled-state.

    Cheap precheck (no mutations, no joins into invoices beyond the 1:1 on
    the registration). Returns True only when all of:
        - attendee has no OfferAttendee row
        - there's exactly one resolvable registration
        - the registration still has exactly one attendee (for parked
          attendees that's the attendee we're looking at; for active it's
          the count of bridge rows)
        - the registration has an invoice in a CANCELLABLE state
    """
    if await _has_offer_origin(db, attendee.id):
        return False
    reg = await _resolve_registration(db, attendee, tenant_id)
    if reg is None:
        return False
    if attendee.status != "parked":
        if await _count_registration_attendees(db, reg.id) > 1:
            return False
    # Load the invoice via the 1:1 relationship (eager-loaded by the model)
    inv_result = await db.execute(select(TrainingInvoice).where(TrainingInvoice.training_registration_id == reg.id))
    inv = inv_result.scalar_one_or_none()
    if inv is None:
        return False
    if inv.template_type == "credit_note":
        return False
    return inv.status in CANCELLABLE_STATUSES


@router.post("/{attendee_id}/cancel")
async def cancel_attendee_registration(
    attendee_id: UUID,
    data: CancelAttendeeRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Cancel a public-portal booking.

    End state: attendee ``active``, registration + original invoice
    ``cancelled``, credit note created + emailed. No Stripe refund is
    issued automatically — operators handle refunds out of band, same as
    the existing ``/invoices/{id}/replace`` flow.
    """
    tenant_id = current_user.require_tenant_id()

    att_result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == tenant_id,
        )
    )
    attendee = att_result.scalar_one_or_none()
    if not attendee:
        raise NotFoundError("Attendee not found")

    if await _has_offer_origin(db, attendee.id):
        raise ValidationError("Cancellation is only available for attendees registered via the public portal.")

    registration = await _resolve_registration(db, attendee, tenant_id)
    if registration is None:
        raise ValidationError(
            "No public-portal registration resolvable for this attendee. "
            "If they were parked before this feature existed, cancel the "
            "invoice directly from the Invoices view."
        )

    # Multi-attendee block (user-chosen semantic: one Cancel = one booking).
    # For a parked attendee the bridge row is already gone, so the count
    # reflects co-attendees that are still registered alongside them; if
    # there are any, refuse and point to the Invoices view.
    remaining = await _count_registration_attendees(db, registration.id)
    if attendee.status != "parked" and remaining > 1:
        raise ValidationError(
            "This attendee shares a registration with others. Cancel the "
            "whole registration from the Invoices view instead."
        )
    if attendee.status == "parked" and remaining > 0:
        raise ValidationError(
            "This attendee was parked from a registration that still has "
            "other attendees. Cancel the whole registration from the "
            "Invoices view instead."
        )

    inv_result = await db.execute(
        select(TrainingInvoice).where(TrainingInvoice.training_registration_id == registration.id)
    )
    invoice = inv_result.scalar_one_or_none()
    if invoice is None:
        raise ValidationError("This registration has no invoice to cancel.")
    if invoice.template_type == "credit_note":
        raise ValidationError("The invoice for this registration is already a credit note.")
    if invoice.status not in CANCELLABLE_STATUSES:
        raise ValidationError(
            f"Cannot cancel an invoice with status '{invoice.status}'. Must be sent, overdue, or paid."
        )

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        # Defensive — tenant should always exist for an authenticated call.
        raise NotFoundError("Tenant not found")

    # --- Mutations -----------------------------------------------------

    # 1. Cancel the original invoice
    invoice.status = "cancelled"

    # 2. Build + add credit note (negated totals, related_invoice_id pointing back)
    reason = (data.reason or "Registration cancelled").strip() or "Registration cancelled"
    cn_number = await generate_training_invoice_number(db, tenant_id)
    credit_note = build_credit_note(invoice, tenant_id, cn_number, reason)
    db.add(credit_note)

    # 3. Remove the per-attendee bridge (only for active attendees — the
    #    parked case already deleted it during park).
    if attendee.status != "parked":
        bridge_result = await db.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.attendee_id == attendee.id,
                TrainingRegistrationAttendee.registration_id == registration.id,
                TrainingRegistrationAttendee.tenant_id == tenant_id,
            )
        )
        bridge = bridge_result.scalar_one_or_none()
        if bridge is not None:
            await db.delete(bridge)

    # 4. Flip registration + attendee status
    registration.status = "cancelled"
    attendee.status = "active"

    # 5. History + customer event
    notes = f"invoice={invoice.invoice_number}; credit_note={cn_number}; reason={reason}"
    db.add(
        TrainingAttendeeHistory(
            tenant_id=tenant_id,
            attendee_id=attendee.id,
            event_type="cancelled",
            placement_id=registration.placement_id,
            registration_id=registration.id,
            source_type="registration",
            source_id=registration.id,
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
            "registration_id": str(registration.id),
            "placement_id": str(registration.placement_id) if registration.placement_id else None,
            "invoice_number": invoice.invoice_number,
            "credit_note_number": cn_number,
            "reason": reason,
        },
    )

    # 6. Deactivate Stripe payment link (prevents post-cancel charges).
    if invoice.template_type == "credit_card" and invoice.stripe_payment_link_id:
        try:
            await deactivate_training_payment_link(invoice, tenant)
        except Exception as exc:
            logger.warning("Failed to deactivate Stripe payment link on cancel: %s", exc)

    await db.commit()
    await db.refresh(invoice)
    await db.refresh(credit_note)
    await db.refresh(attendee)

    # 7. Email the credit note. If sending fails (or the accounting-email
    #    guard fires), we still return success for the ledger-side state
    #    change; the operator will see the email log. Surfacing a 422 here
    #    would be misleading since the cancel itself already committed.
    try:
        await send_training_invoice_email(db, invoice=credit_note, registration=registration, tenant=tenant)
    except Exception as exc:
        logger.warning("Failed to send credit-note email on cancel: %s", exc)

    return {
        "attendee_id": str(attendee.id),
        "attendee_status": attendee.status,
        "registration_id": str(registration.id),
        "invoice_number": invoice.invoice_number,
        "credit_note_number": cn_number,
    }
