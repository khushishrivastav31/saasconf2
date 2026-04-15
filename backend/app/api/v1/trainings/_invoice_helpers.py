"""Shared helpers for training invoice endpoints."""

import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from app.api.v1.trainings.constants import (  # noqa: F401 — re-exported
    CANCELLABLE_STATUSES,
    INVOICE_STATUSES,
    TEMPLATE_TYPES,
)
from app.core.dependencies import DbSessionDep
from app.core.exceptions import NotFoundError
from app.core.training_registration_emails import send_training_invoice_email
from app.core.training_stripe_helper import create_training_payment_link
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

logger = logging.getLogger(__name__)


# ── Shared helpers ────────────────────────────────────────────────────────────


def invoice_to_dict(inv: TrainingInvoice, training_name: str = "—") -> dict:
    """Serialize a TrainingInvoice to a dict for API responses."""
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "template_type": inv.template_type,
        "status": inv.status,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "recipient_name": inv.recipient_name,
        "recipient_email": inv.recipient_email,
        "training_name": training_name,
        "payment_method": inv.payment_method,
        "subtotal": str(inv.subtotal) if inv.subtotal else None,
        "tax_amount": str(inv.tax_amount) if inv.tax_amount else None,
        "total": str(inv.total) if inv.total else None,
        "currency": inv.currency,
        "related_invoice_id": str(inv.related_invoice_id) if inv.related_invoice_id else None,
        "offer_id": str(inv.offer_id) if inv.offer_id else None,
        "stripe_payment_link_url": inv.stripe_payment_link_url,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


async def get_training_names(db: DbSessionDep, reg_ids: set[UUID]) -> dict[UUID, str]:
    """Batch-load training names for a set of registration IDs."""
    if not reg_ids:
        return {}
    result = await db.execute(
        select(TrainingRegistration.id, Training.name)
        .join(ProgramYearTraining, TrainingRegistration.placement_id == ProgramYearTraining.id)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .where(TrainingRegistration.id.in_(reg_ids))
    )
    return {rid: tname for rid, tname in result.all()}


async def get_invoice_or_404(db: DbSessionDep, invoice_id: UUID, tenant_id: UUID) -> TrainingInvoice:
    """Load a training invoice or raise NotFoundError."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    return inv


def build_credit_note(
    original: TrainingInvoice,
    tenant_id: UUID,
    credit_note_number: str,
    reason: str | None = None,
) -> TrainingInvoice:
    """Build a credit note TrainingInvoice from an original invoice."""
    negated_items = []
    for item in original.line_items or []:
        negated_item = dict(item)
        negated_item["total"] = -abs(float(item.get("total", 0)))
        negated_item["unit_price"] = -abs(float(item.get("unit_price", 0)))
        negated_items.append(negated_item)

    notes_text = f"Credit note for invoice {original.invoice_number}"
    if reason:
        notes_text += f". Reason: {reason}"

    return TrainingInvoice(
        tenant_id=tenant_id,
        training_registration_id=original.training_registration_id,
        related_invoice_id=original.id,
        invoice_number=credit_note_number,
        template_type="credit_note",
        status="sent",
        issue_date=date.today(),
        due_date=None,
        recipient_name=original.recipient_name,
        recipient_email=original.recipient_email,
        recipient_address_line1=original.recipient_address_line1,
        recipient_city=original.recipient_city,
        recipient_postal_code=original.recipient_postal_code,
        recipient_country=original.recipient_country,
        recipient_vat_number=original.recipient_vat_number,
        payment_method=original.payment_method,
        line_items=negated_items,
        subtotal=-abs(original.subtotal) if original.subtotal else Decimal("0.00"),
        tax_rate=original.tax_rate,
        tax_amount=-abs(original.tax_amount) if original.tax_amount else Decimal("0.00"),
        total=-abs(original.total) if original.total else Decimal("0.00"),
        currency=original.currency,
        language=original.language,
        notes=notes_text,
    )


async def send_invoice_with_link(
    db: DbSessionDep,
    inv: TrainingInvoice,
    tenant_id: UUID,
) -> str | None:
    """Create Stripe payment link (if credit_card) and send email. Returns payment_link_url or None."""
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        return None

    payment_link_url: str | None = None

    if inv.template_type == "credit_card":
        try:
            link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
            inv.stripe_payment_link_id = link_id
            inv.stripe_payment_link_url = payment_link_url
        except Exception as exc:
            logger.warning("Failed to create Stripe payment link for invoice %s: %s", inv.id, exc)

    if inv.recipient_email:
        try:
            await send_training_invoice_email(db, inv, None, tenant, payment_link_url=payment_link_url)
        except Exception as exc:
            logger.warning("Failed to send invoice email %s: %s", inv.id, exc)

    return payment_link_url
