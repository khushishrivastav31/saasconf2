"""Training invoice operations — create, update, send, cancel, mark-paid, resend, delete."""

import logging
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.rate_limiter import limiter
from app.core.training_invoice_number import generate_training_invoice_number
from app.core.training_registration_emails import send_training_invoice_email
from app.core.training_stripe_helper import (
    create_training_payment_link,
    deactivate_training_payment_link,
    refund_training_payment,
)
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice

from ._invoice_helpers import CANCELLABLE_STATUSES, build_credit_note, invoice_to_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["training-invoices"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class UpdateDraftInvoiceRequest(BaseModel):
    template_type: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    recipient_name: str | None = None
    recipient_email: str | None = None
    recipient_address_line1: str | None = None
    recipient_city: str | None = None
    recipient_postal_code: str | None = None
    recipient_country: str | None = None
    recipient_vat_number: str | None = None
    payment_method: str | None = None
    line_items: list[dict] | None = None
    subtotal: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    currency: str | None = None
    notes: str | None = None
    po_number: str | None = None


class CreateTrainingInvoiceRequest(BaseModel):
    template_type: str = "bank_transfer"
    status: str = "draft"
    invoice_number: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    recipient_name: str
    recipient_email: str | None = None
    recipient_address_line1: str | None = None
    recipient_city: str | None = None
    recipient_postal_code: str | None = None
    recipient_country: str | None = None
    recipient_vat_number: str | None = None
    payment_method: str | None = None
    line_items: list[dict] = []
    subtotal: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    currency: str | None = "EUR"
    notes: str | None = None
    training_registration_id: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.put("/{invoice_id}")
async def update_draft_invoice(
    invoice_id: UUID,
    data: UpdateDraftInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update a draft training invoice. Only draft invoices can be edited."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.require_tenant_id(),
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.status != "draft":
        raise HTTPException(status_code=422, detail="Only draft invoices can be edited.")

    update_fields = data.model_dump(exclude_unset=True)
    if "issue_date" in update_fields:
        update_fields["issue_date"] = (
            date.fromisoformat(update_fields["issue_date"]) if update_fields["issue_date"] else None
        )
    if "due_date" in update_fields:
        update_fields["due_date"] = date.fromisoformat(update_fields["due_date"]) if update_fields["due_date"] else None
    for field in ("subtotal", "tax_rate", "tax_amount", "total"):
        if field in update_fields and update_fields[field] is not None:
            update_fields[field] = Decimal(str(update_fields[field]))
    for field, value in update_fields.items():
        setattr(inv, field, value)

    await db.commit()
    await db.refresh(inv)
    return invoice_to_dict(inv)


@router.post("/{invoice_id}/send")
async def send_draft_invoice(
    invoice_id: UUID,
    data: UpdateDraftInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Save and send a draft training invoice — assigns number, sets status to sent."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.require_tenant_id(),
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.status != "draft":
        raise HTTPException(status_code=422, detail="Only draft invoices can be sent.")

    update_fields = data.model_dump(exclude_unset=True)
    if "issue_date" in update_fields:
        update_fields["issue_date"] = (
            date.fromisoformat(update_fields["issue_date"]) if update_fields["issue_date"] else date.today()
        )
    if "due_date" in update_fields:
        update_fields["due_date"] = date.fromisoformat(update_fields["due_date"]) if update_fields["due_date"] else None
    for field in ("subtotal", "tax_rate", "tax_amount", "total"):
        if field in update_fields and update_fields[field] is not None:
            update_fields[field] = Decimal(str(update_fields[field]))
    for field, value in update_fields.items():
        setattr(inv, field, value)

    inv.invoice_number = await generate_training_invoice_number(db, current_user.require_tenant_id())
    inv.status = "sent"
    if not inv.issue_date:
        inv.issue_date = date.today()
    if not inv.due_date:
        inv.due_date = inv.issue_date + timedelta(days=30)

    # Create Stripe payment link BEFORE committing — if it fails for CC invoices,
    # the invoice stays draft so the user isn't left with an unpayable sent invoice.
    tenant = await db.get(Tenant, current_user.require_tenant_id())
    payment_link_url: str | None = None
    if inv.template_type == "credit_card" and tenant:
        try:
            link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
            inv.stripe_payment_link_id = link_id
            inv.stripe_payment_link_url = payment_link_url
        except Exception as exc:
            logger.warning("Failed to create Stripe payment link for invoice %s: %s", inv.id, exc)
            raise HTTPException(
                status_code=502,
                detail="Failed to create Stripe payment link. Invoice was not sent. Please check Stripe configuration and try again.",
            ) from exc

    await db.commit()
    await db.refresh(inv)

    # Send email (best-effort — invoice is already sent, email failure is non-fatal)
    if inv.recipient_email and tenant:
        try:
            await send_training_invoice_email(db, inv, None, tenant, payment_link_url=payment_link_url)
        except Exception as exc:
            logger.warning("Failed to send invoice email %s: %s", inv.id, exc)

    return invoice_to_dict(inv)


@router.post("/{invoice_id}/resend")
@limiter.limit("5/minute")
async def resend_training_invoice_email_endpoint(
    request: Request,
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Resend training invoice email."""
    result = await db.execute(
        select(TrainingInvoice)
        .options(joinedload(TrainingInvoice.registration))
        .where(TrainingInvoice.id == invoice_id, TrainingInvoice.tenant_id == current_user.require_tenant_id())
    )
    inv = result.scalars().unique().first()
    if not inv:
        raise NotFoundError("Invoice not found")

    tenant = await db.get(Tenant, current_user.require_tenant_id())
    if not tenant:
        raise NotFoundError("Tenant not found")

    # For credit card invoices, create a fresh payment link (old one may have expired)
    payment_link_url = inv.stripe_payment_link_url
    if inv.template_type == "credit_card" and inv.status in ("sent", "overdue"):
        try:
            # Deactivate old link if it exists
            if inv.stripe_payment_link_id:
                await deactivate_training_payment_link(inv, tenant)
            # Create new link
            link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
            inv.stripe_payment_link_id = link_id
            inv.stripe_payment_link_url = payment_link_url
            await db.commit()
            await db.refresh(inv)
        except Exception as exc:
            logger.warning("Failed to refresh Stripe payment link for invoice %s: %s", inv.id, exc)
            # Fall back to existing link URL (may still work)
            payment_link_url = inv.stripe_payment_link_url

    success = await send_training_invoice_email(db, inv, inv.registration, tenant, payment_link_url=payment_link_url)
    return {"success": success}


@router.post("/{invoice_id}/cancel")
async def cancel_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Cancel a training invoice and create a credit note."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id, TrainingInvoice.tenant_id == current_user.require_tenant_id()
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.status not in CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"Cannot cancel invoice with status '{inv.status}'. Must be sent, overdue, or paid."
        )
    if inv.template_type == "credit_note":
        raise HTTPException(status_code=422, detail="Cannot cancel a credit note.")

    tenant = await db.get(Tenant, current_user.require_tenant_id())
    if not tenant:
        raise NotFoundError("Tenant not found")

    if inv.template_type == "credit_card":
        await deactivate_training_payment_link(inv, tenant)
    if inv.status == "paid" and inv.template_type == "credit_card" and inv.stripe_payment_intent_id:
        try:
            await refund_training_payment(db, tenant, inv)
        except Exception as exc:
            logger.warning("Failed to refund Stripe payment for training invoice %s: %s", inv.id, exc)

    inv.status = "cancelled"
    cn_number = await generate_training_invoice_number(db, current_user.require_tenant_id())
    credit_note = build_credit_note(inv, current_user.require_tenant_id(), cn_number)
    db.add(credit_note)
    await db.commit()
    await db.refresh(inv)
    await db.refresh(credit_note)

    return {"cancelled_invoice": invoice_to_dict(inv), "credit_note": invoice_to_dict(credit_note)}


@router.post("/{invoice_id}/mark-paid")
async def mark_training_invoice_paid(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Manually mark a bank transfer training invoice as paid."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id, TrainingInvoice.tenant_id == current_user.require_tenant_id()
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.template_type != "bank_transfer":
        raise HTTPException(status_code=422, detail="Only bank transfer invoices can be manually marked as paid.")
    if inv.status not in {"sent", "overdue"}:
        raise HTTPException(status_code=422, detail=f"Cannot mark invoice with status '{inv.status}' as paid.")

    inv.status = "paid"
    await db.commit()
    await db.refresh(inv)
    return invoice_to_dict(inv)


@router.delete("/{invoice_id}")
async def delete_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a draft training invoice."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id, TrainingInvoice.tenant_id == current_user.require_tenant_id()
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.status != "draft":
        raise HTTPException(status_code=422, detail="Only draft invoices can be deleted.")

    await db.delete(inv)
    await db.commit()
    return {"deleted": True}


@router.post("")
async def create_training_invoice(
    data: CreateTrainingInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Manually create a training invoice."""
    if data.status not in {"draft", "sent"}:
        raise HTTPException(status_code=422, detail=f"Invalid status: {data.status}. Use draft or sent.")

    invoice_number = data.invoice_number
    if data.status == "sent" and not invoice_number:
        invoice_number = await generate_training_invoice_number(db, current_user.require_tenant_id())

    issue_date = date.fromisoformat(data.issue_date) if data.issue_date else None
    due_date = date.fromisoformat(data.due_date) if data.due_date else None
    if data.status == "sent":
        if not issue_date:
            issue_date = date.today()
        if not due_date:
            due_date = issue_date + timedelta(days=30)

    reg_id: UUID | None = None
    if data.training_registration_id:
        reg_id = UUID(data.training_registration_id)

    inv = TrainingInvoice(
        tenant_id=current_user.require_tenant_id(),
        training_registration_id=reg_id,
        invoice_number=invoice_number,
        template_type=data.template_type,
        status=data.status,
        issue_date=issue_date,
        due_date=due_date,
        recipient_name=data.recipient_name,
        recipient_email=data.recipient_email,
        recipient_address_line1=data.recipient_address_line1,
        recipient_city=data.recipient_city,
        recipient_postal_code=data.recipient_postal_code,
        recipient_country=data.recipient_country,
        recipient_vat_number=data.recipient_vat_number,
        payment_method=data.payment_method,
        line_items=data.line_items,
        subtotal=Decimal(str(data.subtotal)) if data.subtotal is not None else None,
        tax_rate=Decimal(str(data.tax_rate)) if data.tax_rate is not None else None,
        tax_amount=Decimal(str(data.tax_amount)) if data.tax_amount is not None else None,
        total=Decimal(str(data.total)) if data.total is not None else None,
        currency=data.currency,
        notes=data.notes,
        language="en",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    if inv.status == "sent":
        tenant: Tenant | None = None
        payment_link_url: str | None = None
        if inv.template_type == "credit_card":
            tenant = await db.get(Tenant, current_user.require_tenant_id())
            if tenant:
                try:
                    link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
                    inv.stripe_payment_link_id = link_id
                    inv.stripe_payment_link_url = payment_link_url
                    await db.commit()
                    await db.refresh(inv)
                except Exception as exc:
                    logger.warning("Failed to create Stripe payment link for training invoice %s: %s", inv.id, exc)
        if inv.recipient_email:
            if tenant is None:
                tenant = await db.get(Tenant, current_user.require_tenant_id())
            if tenant:
                await send_training_invoice_email(db, inv, None, tenant, payment_link_url=payment_link_url)

    return invoice_to_dict(inv)
