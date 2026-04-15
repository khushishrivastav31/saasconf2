"""Training invoice replacement — billing correction (1:1 with conference pattern)."""

import logging
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.training_invoice_number import generate_training_invoice_number
from app.core.training_registration_emails import send_training_invoice_email
from app.core.training_stripe_helper import create_training_payment_link, deactivate_training_payment_link
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice

from ._invoice_helpers import CANCELLABLE_STATUSES, build_credit_note, invoice_to_dict

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["training-invoices"])


class ReplaceTrainingInvoiceRequest(BaseModel):
    reason: str
    recipient_name: str | None = None
    recipient_email: str | None = None
    recipient_address_line1: str | None = None
    recipient_city: str | None = None
    recipient_postal_code: str | None = None
    recipient_country: str | None = None
    recipient_vat_number: str | None = None
    po_number: str | None = None


@router.post("/{invoice_id}/replace")
async def replace_training_invoice(
    invoice_id: UUID,
    data: ReplaceTrainingInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Replace a training invoice with corrected billing information.

    1:1 with conference replace flow:
    - Cancel old invoice → credit note
    - New invoice with corrected billing (same amounts/line items)
    - Status inheritance: paid → paid, sent/overdue → sent
    - Send emails
    """
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id, TrainingInvoice.tenant_id == current_user.tenant_id
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")
    if inv.status not in CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot replace invoice with status '{inv.status}'. Must be sent, overdue, or paid.",
        )
    if inv.template_type == "credit_note":
        raise HTTPException(status_code=422, detail="Cannot replace a credit note.")

    old_was_paid = inv.status == "paid"

    # 1. Cancel old invoice
    inv.status = "cancelled"

    # 2. Credit note
    cn_number = await generate_training_invoice_number(db, current_user.tenant_id)
    credit_note = build_credit_note(inv, current_user.tenant_id, cn_number, data.reason)
    db.add(credit_note)

    # 3. Replacement invoice (same amounts, corrected billing)
    new_number = await generate_training_invoice_number(db, current_user.tenant_id)
    new_status = "paid" if old_was_paid else "sent"
    new_issue_date = inv.issue_date if old_was_paid else date.today()
    new_due_date = (
        inv.due_date if old_was_paid else (date.today() + timedelta(days=30) if not inv.due_date else inv.due_date)
    )

    new_inv = TrainingInvoice(
        tenant_id=current_user.tenant_id,
        training_registration_id=inv.training_registration_id,
        offer_id=inv.offer_id,
        invoice_number=new_number,
        template_type=inv.template_type,
        status=new_status,
        issue_date=new_issue_date,
        due_date=new_due_date,
        recipient_name=data.recipient_name or inv.recipient_name,
        recipient_email=data.recipient_email or inv.recipient_email,
        recipient_address_line1=data.recipient_address_line1
        if data.recipient_address_line1 is not None
        else inv.recipient_address_line1,
        recipient_city=data.recipient_city if data.recipient_city is not None else inv.recipient_city,
        recipient_postal_code=data.recipient_postal_code
        if data.recipient_postal_code is not None
        else inv.recipient_postal_code,
        recipient_country=data.recipient_country if data.recipient_country is not None else inv.recipient_country,
        recipient_vat_number=data.recipient_vat_number
        if data.recipient_vat_number is not None
        else inv.recipient_vat_number,
        po_number=data.po_number if data.po_number is not None else inv.po_number,
        payment_method=inv.payment_method,
        stripe_payment_intent_id=inv.stripe_payment_intent_id if old_was_paid else None,
        line_items=inv.line_items,
        subtotal=inv.subtotal,
        tax_rate=inv.tax_rate,
        tax_amount=inv.tax_amount,
        total=inv.total,
        currency=inv.currency,
        language=inv.language,
        notes=f"Replacement for {inv.invoice_number}. Reason: {data.reason}",
    )
    db.add(new_inv)

    # 4. Deactivate old Stripe payment link (always, even if paid — prevents double charges)
    if inv.template_type == "credit_card" and inv.stripe_payment_link_id:
        try:
            tenant = await db.get(Tenant, current_user.tenant_id)
            if tenant:
                await deactivate_training_payment_link(inv, tenant)
        except Exception as exc:
            logger.warning("Failed to deactivate old payment link during replace: %s", exc)

    await db.commit()
    await db.refresh(inv)
    await db.refresh(credit_note)
    await db.refresh(new_inv)

    # 5. New Stripe payment link if needed
    if new_status == "sent" and new_inv.template_type == "credit_card":
        try:
            tenant_obj = await db.get(Tenant, current_user.tenant_id)
            if tenant_obj:
                link_id, link_url = await create_training_payment_link(db, tenant_obj, new_inv)
                new_inv.stripe_payment_link_id = link_id
                new_inv.stripe_payment_link_url = link_url
                await db.commit()
                await db.refresh(new_inv)
        except Exception as exc:
            logger.warning("Failed to create Stripe payment link for replacement invoice: %s", exc)

    # 6. Send emails
    try:
        tenant_obj = await db.get(Tenant, current_user.tenant_id)
        if tenant_obj and new_inv.recipient_email:
            await send_training_invoice_email(
                db, new_inv, None, tenant_obj, payment_link_url=new_inv.stripe_payment_link_url
            )
    except Exception as exc:
        logger.warning("Failed to send replacement invoice email: %s", exc)

    return {
        "cancelled_invoice": invoice_to_dict(inv),
        "credit_note": invoice_to_dict(credit_note),
        "new_invoice": invoice_to_dict(new_inv),
    }
