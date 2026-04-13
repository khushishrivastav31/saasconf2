"""Training invoice generation.

Creates a TrainingInvoice from a TrainingRegistration, including line items,
VAT, invoice number, and attendee notes.
"""

import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

from .training_invoice_number import generate_training_invoice_number

logger = logging.getLogger(__name__)


async def create_invoice_for_training_registration(
    db: AsyncSession,
    registration: TrainingRegistration,
    tenant: Tenant,
) -> TrainingInvoice | None:
    """Create an invoice for a training registration.

    Idempotent: returns existing invoice if one already exists for this registration.
    Generates line items from registration pricing, assigns invoice number,
    and sets status to 'sent' immediately.
    """
    # Idempotency: check for existing invoice
    existing = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.training_registration_id == registration.id,
            TrainingInvoice.tenant_id == tenant.id,
        )
    )
    existing_invoice = existing.scalar_one_or_none()
    if existing_invoice:
        return existing_invoice

    # Determine template type from payment method
    payment_method = registration.payment_method or "bank_transfer"
    template_type = "credit_card" if payment_method == "credit_card" else "bank_transfer"

    # Fetch placement + training + syllabus for pricing breakdown
    placement_result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training).joinedload(Training.syllabus),
        )
        .where(ProgramYearTraining.id == registration.placement_id)
    )
    placement = placement_result.scalars().unique().first()

    # Build line items
    line_items = _build_line_items(registration, placement)

    # Build attendee notes
    notes = _build_attendee_notes(registration)

    # Recipient name
    recipient_name = registration.company_name or (
        f"{registration.contact_first_name} {registration.contact_last_name}"
    )

    # Generate invoice number
    invoice_number = await generate_training_invoice_number(db, tenant.id)

    # VAT
    subtotal = Decimal(str(registration.subtotal or 0))
    vat_amount = Decimal(str(registration.vat_amount or 0))
    total = Decimal(str(registration.total or 0))
    tax_rate = None
    if subtotal and vat_amount:
        tax_rate = round(vat_amount / subtotal * 100, 2)

    invoice = TrainingInvoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        training_registration_id=registration.id,
        invoice_number=invoice_number,
        template_type=template_type,
        status="paid" if payment_method == "credit_card" and registration.payment_intent_id else "sent",
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        recipient_name=recipient_name,
        recipient_email=registration.contact_email,
        recipient_address_line1=registration.street,
        recipient_city=registration.city,
        recipient_postal_code=registration.postal_code,
        recipient_country=registration.country,
        recipient_vat_number=registration.vat_number,
        payment_method=payment_method,
        po_number=registration.po_number,
        stripe_payment_intent_id=registration.payment_intent_id,
        line_items=line_items,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=vat_amount,
        total=total,
        currency=registration.currency or "EUR",
        notes=notes,
        language=registration.language or "en",
    )

    db.add(invoice)
    await db.flush()

    logger.info(
        "Created training invoice %s for registration %s (total: %s %s)",
        invoice_number,
        registration.id,
        total,
        registration.currency,
    )

    return invoice


def _build_line_items(
    registration: TrainingRegistration,
    placement: ProgramYearTraining | None,
) -> list[dict]:
    """Build invoice line items from registration with training + exam breakdown."""
    items: list[dict] = []
    attendees = registration.attendees or []
    num_attendees = len(attendees)

    if not num_attendees:
        return items

    # Get training price from the training model
    training = placement.training if placement else None
    training_name = training.name if training else "Training"
    training_price = float(training.regular_price or 0) if training else 0

    # Training line item
    if training_price > 0:
        training_total = training_price * num_attendees
        items.append(
            {
                "description": f"{training_name} ({num_attendees} attendee{'s' if num_attendees != 1 else ''})",
                "quantity": num_attendees,
                "unit_price": f"{training_price:.2f}",
                "total": f"{training_total:.2f}",
            }
        )

    # Exam line item (from syllabus.price)
    exam_price = 0.0
    if training and training.syllabus and training.syllabus.price:
        exam_price = float(training.syllabus.price)

    if exam_price > 0:
        exam_attendees = [a for a in attendees if a.include_exam]
        num_exam = len(exam_attendees)
        if num_exam > 0:
            exam_total = exam_price * num_exam
            items.append(
                {
                    "description": f"Certification Exam ({num_exam} attendee{'s' if num_exam != 1 else ''})",
                    "quantity": num_exam,
                    "unit_price": f"{exam_price:.2f}",
                    "total": f"{exam_total:.2f}",
                }
            )

    # Fallback: if no items were created (missing training data), use stored subtotal
    if not items:
        items.append(
            {
                "description": f"Training registration ({num_attendees} attendee{'s' if num_attendees != 1 else ''})",
                "quantity": 1,
                "unit_price": f"{float(registration.subtotal or 0):.2f}",
                "total": f"{float(registration.subtotal or 0):.2f}",
            }
        )

    return items


def _build_attendee_notes(registration: TrainingRegistration) -> str:
    """Build formatted attendee list for invoice notes."""
    lines = ["Attendees:"]
    for att in registration.attendees or []:
        line = f"  - {att.first_name} {att.last_name} ({att.email})"
        if att.include_exam:
            exam_parts = []
            if att.exam_mode:
                exam_parts.append(f"Exam: {att.exam_mode}")
            if att.exam_language:
                exam_parts.append(f"Language: {att.exam_language}")
            if att.extra_time:
                exam_parts.append("Extra time")
            if exam_parts:
                line += f" [{', '.join(exam_parts)}]"
        lines.append(line)
    return "\n".join(lines)
