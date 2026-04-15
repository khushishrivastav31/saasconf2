"""Attendee reassignment service — handles the full parking lot reassignment flow.

Extracted from the attendees endpoint to reduce complexity. Handles:
1. Finding old registration + invoice from park history
2. Cancelling old invoice + creating credit note
3. Creating new registration + adding attendee
4. Creating new invoice (with payment transfer if paid)
5. Cleaning up empty old registrations
"""

import logging
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.trainings._invoice_helpers import build_credit_note
from app.core.training_invoice_number import generate_training_invoice_number
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_invoice import TrainingInvoice
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

logger = logging.getLogger(__name__)


async def find_old_registration(
    db: AsyncSession,
    park_event: TrainingAttendeeHistory,
    att: TrainingAttendee,
    tenant_id: UUID,
) -> TrainingRegistration | None:
    """Find the old registration from the park event, with fallback strategies."""
    if not park_event.source_id:
        return None

    # Strategy 1: source_id is registration_id (new code)
    result = await db.execute(
        select(TrainingRegistration).where(
            TrainingRegistration.id == park_event.source_id,
            TrainingRegistration.tenant_id == tenant_id,
        )
    )
    reg = result.scalar_one_or_none()
    if reg:
        return reg

    # Strategy 2: find by contact email + placement
    if park_event.placement_id:
        result2 = await db.execute(
            select(TrainingRegistration).where(
                TrainingRegistration.placement_id == park_event.placement_id,
                TrainingRegistration.tenant_id == tenant_id,
                TrainingRegistration.contact_email == att.email,
            )
        )
        reg = result2.scalar_one_or_none()
        if reg:
            return reg

        # Strategy 3: most recent by placement
        result3 = await db.execute(
            select(TrainingRegistration)
            .where(
                TrainingRegistration.placement_id == park_event.placement_id,
                TrainingRegistration.tenant_id == tenant_id,
            )
            .order_by(TrainingRegistration.created_at.desc())
            .limit(1)
        )
        return result3.scalar_one_or_none()

    return None


async def find_old_invoice(
    db: AsyncSession,
    registration_id: UUID,
    tenant_id: UUID,
) -> TrainingInvoice | None:
    """Find the most recent active invoice for a registration."""
    result = await db.execute(
        select(TrainingInvoice)
        .where(
            TrainingInvoice.training_registration_id == registration_id,
            TrainingInvoice.tenant_id == tenant_id,
            TrainingInvoice.status.in_(["sent", "paid", "overdue"]),
            TrainingInvoice.template_type != "credit_note",
        )
        .order_by(TrainingInvoice.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def cancel_old_invoice_with_credit_note(
    db: AsyncSession,
    old_invoice: TrainingInvoice,
    tenant_id: UUID,
    reason: str,
) -> TrainingInvoice | None:
    """Cancel old invoice and create credit note. Returns credit note or None on failure."""
    try:
        old_invoice.status = "cancelled"
        cn_number = await generate_training_invoice_number(db, tenant_id)
        credit_note = build_credit_note(old_invoice, tenant_id, cn_number, reason)
        db.add(credit_note)
        return credit_note
    except Exception as exc:
        logger.warning("Failed to cancel old invoice during reassignment: %s", exc)
        return None


async def cleanup_empty_registration(
    db: AsyncSession,
    registration: TrainingRegistration,
) -> None:
    """Delete a registration if it has no remaining attendees, unlinking invoices first."""
    remaining_q = await db.execute(
        select(func.count(TrainingRegistrationAttendee.id)).where(
            TrainingRegistrationAttendee.registration_id == registration.id
        )
    )
    if (remaining_q.scalar() or 0) == 0:
        await db.execute(
            update(TrainingInvoice)
            .where(TrainingInvoice.training_registration_id == registration.id)
            .values(training_registration_id=None)
        )
        await db.delete(registration)
        logger.info("Deleted empty old registration %s after reassignment", registration.id)


def create_new_registration(
    tenant_id: UUID,
    placement_id: UUID,
    old_registration: TrainingRegistration | None,
    att: TrainingAttendee,
) -> TrainingRegistration:
    """Create a new registration, copying billing from old registration if available."""
    return TrainingRegistration(
        tenant_id=tenant_id,
        placement_id=placement_id,
        status="registered",
        contact_first_name=old_registration.contact_first_name if old_registration else att.first_name,
        contact_last_name=old_registration.contact_last_name if old_registration else att.last_name,
        contact_email=old_registration.contact_email if old_registration else att.email,
        contact_phone=old_registration.contact_phone if old_registration else None,
        company_name=old_registration.company_name if old_registration else None,
        street=old_registration.street if old_registration else None,
        postal_code=old_registration.postal_code if old_registration else None,
        city=old_registration.city if old_registration else None,
        country=old_registration.country if old_registration else None,
        vat_number=old_registration.vat_number if old_registration else None,
        payment_method=old_registration.payment_method if old_registration else "bank_transfer",
        subtotal=old_registration.subtotal if old_registration else None,
        vat_amount=old_registration.vat_amount if old_registration else None,
        total=old_registration.total if old_registration else None,
        currency=old_registration.currency if old_registration else "EUR",
    )


async def create_replacement_invoice(
    db: AsyncSession,
    tenant_id: UUID,
    old_invoice: TrainingInvoice,
    new_registration_id: UUID,
    new_training_name: str,
    att: TrainingAttendee,
) -> TrainingInvoice | None:
    """Create a replacement invoice with payment transfer logic. Returns new invoice or None."""
    old_was_paid = old_invoice.status == "paid"
    try:
        new_number = await generate_training_invoice_number(db, tenant_id)
        today = date.today()

        # Copy line items, update first one's description
        new_line_items = []
        for item in old_invoice.line_items or []:
            new_item = dict(item)
            new_item["description"] = f"{new_training_name} (1 attendee)"
            new_line_items.append(new_item)
            break
        for item in (old_invoice.line_items or [])[1:]:
            new_line_items.append(dict(item))

        payment_note = f"Reassignment of {att.first_name} {att.last_name} to {new_training_name}"
        if old_was_paid:
            paid_date = old_invoice.issue_date.strftime("%d.%m.%Y") if old_invoice.issue_date else "unknown date"
            payment_note += (
                f"\n\nPayment transferred from cancelled invoice {old_invoice.invoice_number}."
                f"\nOriginal payment: {old_invoice.currency} {old_invoice.total} "
                f"via {old_invoice.payment_method or 'unknown'} on {paid_date}."
            )
            if old_invoice.stripe_payment_intent_id:
                payment_note += f"\nStripe Payment Intent: {old_invoice.stripe_payment_intent_id}"

        new_invoice = TrainingInvoice(
            tenant_id=tenant_id,
            training_registration_id=new_registration_id,
            invoice_number=new_number,
            template_type=old_invoice.template_type,
            status="paid" if old_was_paid else "sent",
            issue_date=today,
            due_date=today if old_was_paid else today + timedelta(days=30),
            recipient_name=old_invoice.recipient_name,
            recipient_email=old_invoice.recipient_email,
            recipient_address_line1=old_invoice.recipient_address_line1,
            recipient_city=old_invoice.recipient_city,
            recipient_postal_code=old_invoice.recipient_postal_code,
            recipient_country=old_invoice.recipient_country,
            recipient_vat_number=old_invoice.recipient_vat_number,
            payment_method=old_invoice.payment_method,
            stripe_payment_intent_id=old_invoice.stripe_payment_intent_id if old_was_paid else None,
            po_number=old_invoice.po_number,
            line_items=new_line_items,
            subtotal=old_invoice.subtotal,
            tax_rate=old_invoice.tax_rate,
            tax_amount=old_invoice.tax_amount,
            total=old_invoice.total,
            currency=old_invoice.currency,
            notes=payment_note,
            language=old_invoice.language,
        )
        db.add(new_invoice)
        return new_invoice
    except Exception as exc:
        logger.warning("Failed to create new invoice during reassignment: %s", exc)
        return None
