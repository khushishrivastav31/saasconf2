"""Training invoices admin endpoints."""

import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["training-invoices"])

_CANCELLABLE_STATUSES = {"sent", "overdue", "paid"}


def _invoice_to_dict(inv: TrainingInvoice, training_name: str = "—") -> dict:
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
        "stripe_payment_link_url": inv.stripe_payment_link_url,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


async def _get_training_names(db: DbSessionDep, reg_ids: set[UUID]) -> dict[UUID, str]:
    if not reg_ids:
        return {}
    result = await db.execute(
        select(TrainingRegistration.id, Training.name)
        .join(ProgramYearTraining, TrainingRegistration.placement_id == ProgramYearTraining.id)
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .where(TrainingRegistration.id.in_(reg_ids))
    )
    return {rid: tname for rid, tname in result.all()}


@router.get("")
async def list_training_invoices(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    template_type: str | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List training invoices with filtering and pagination."""
    query = (
        select(TrainingInvoice)
        .where(TrainingInvoice.tenant_id == current_user.tenant_id)
        .options(joinedload(TrainingInvoice.registration))
    )

    if status:
        query = query.where(TrainingInvoice.status == status)
    if template_type:
        query = query.where(TrainingInvoice.template_type == template_type)
    if search:
        query = query.where(
            func.lower(TrainingInvoice.recipient_name).contains(search.lower())
            | func.lower(TrainingInvoice.invoice_number).contains(search.lower())
            | func.lower(TrainingInvoice.recipient_email).contains(search.lower())
        )
    if date_from:
        query = query.where(TrainingInvoice.issue_date >= date.fromisoformat(date_from))
    if date_to:
        query = query.where(TrainingInvoice.issue_date <= date.fromisoformat(date_to))

    count_q = select(func.count()).select_from(query.with_only_columns(TrainingInvoice.id).subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(TrainingInvoice.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    invoices = result.scalars().unique().all()

    reg_ids = {inv.training_registration_id for inv in invoices if inv.training_registration_id}
    training_info = await _get_training_names(db, reg_ids)

    items = [
        _invoice_to_dict(
            inv,
            training_info.get(inv.training_registration_id, "—") if inv.training_registration_id else "—",
        )
        for inv in invoices
    ]

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{invoice_id}")
async def get_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get a single training invoice (full details including line items and address)."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    return {
        "id": str(inv.id),
        "training_registration_id": str(inv.training_registration_id) if inv.training_registration_id else None,
        "invoice_number": inv.invoice_number,
        "template_type": inv.template_type,
        "status": inv.status,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "recipient_name": inv.recipient_name,
        "recipient_email": inv.recipient_email,
        "recipient_address_line1": inv.recipient_address_line1,
        "recipient_city": inv.recipient_city,
        "recipient_postal_code": inv.recipient_postal_code,
        "recipient_country": inv.recipient_country,
        "recipient_vat_number": inv.recipient_vat_number,
        "payment_method": inv.payment_method,
        "line_items": inv.line_items,
        "subtotal": str(inv.subtotal) if inv.subtotal else None,
        "tax_rate": str(inv.tax_rate) if inv.tax_rate else None,
        "tax_amount": str(inv.tax_amount) if inv.tax_amount else None,
        "total": str(inv.total) if inv.total else None,
        "currency": inv.currency,
        "notes": inv.notes,
        "language": inv.language,
        "related_invoice_id": str(inv.related_invoice_id) if inv.related_invoice_id else None,
        "stripe_payment_link_url": inv.stripe_payment_link_url,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


@router.get("/{invoice_id}/pdf")
async def download_training_invoice_pdf(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Download training invoice as PDF."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    from app.core.training_invoice_pdf import generate_training_invoice_pdf

    pdf_bytes = await generate_training_invoice_pdf(inv, tenant, db)

    filename = f"Invoice-{inv.invoice_number or 'DRAFT'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class StatusUpdateRequest(BaseModel):
    status: str


@router.patch("/{invoice_id}/status")
async def update_training_invoice_status(
    invoice_id: UUID,
    data: StatusUpdateRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update training invoice status."""
    valid_statuses = {"draft", "sent", "paid", "overdue", "cancelled"}
    if data.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status: {data.status}")

    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    inv.status = data.status
    await db.commit()

    return {"id": str(inv.id), "status": inv.status}


@router.post("/{invoice_id}/resend")
async def resend_training_invoice_email(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Resend training invoice email."""
    result = await db.execute(
        select(TrainingInvoice)
        .options(joinedload(TrainingInvoice.registration))
        .where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalars().unique().first()
    if not inv:
        raise NotFoundError("Invoice not found")

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    from app.core.training_registration_emails import send_training_invoice_email

    success = await send_training_invoice_email(
        db, inv, inv.registration, tenant, payment_link_url=inv.stripe_payment_link_url
    )

    return {"success": success}


def _build_credit_note(
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


@router.post("/{invoice_id}/cancel")
async def cancel_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Cancel a training invoice and create a credit note."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    if inv.status not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot cancel invoice with status '{inv.status}'. Must be sent, overdue, or paid.",
        )
    if inv.template_type == "credit_note":
        raise HTTPException(status_code=422, detail="Cannot cancel a credit note.")

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    from app.core.training_stripe_helper import deactivate_training_payment_link, refund_training_payment

    # Deactivate Stripe payment link (best-effort)
    if inv.template_type == "credit_card":
        await deactivate_training_payment_link(inv, tenant)

    # Issue Stripe refund if the invoice was paid via Stripe (best-effort)
    if inv.status == "paid" and inv.template_type == "credit_card" and inv.stripe_payment_intent_id:
        try:
            await refund_training_payment(db, tenant, inv)
        except Exception as exc:
            logger.warning("Failed to refund Stripe payment for training invoice %s: %s", inv.id, exc)

    inv.status = "cancelled"

    from app.core.training_invoice_number import generate_training_invoice_number

    credit_note_number = await generate_training_invoice_number(db, current_user.tenant_id)
    credit_note = _build_credit_note(inv, current_user.tenant_id, credit_note_number)
    db.add(credit_note)
    await db.commit()
    await db.refresh(inv)
    await db.refresh(credit_note)

    return {
        "cancelled_invoice": _invoice_to_dict(inv),
        "credit_note": _invoice_to_dict(credit_note),
    }


@router.post("/{invoice_id}/mark-paid")
async def mark_training_invoice_paid(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Manually mark a bank transfer training invoice as paid."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    if inv.template_type != "bank_transfer":
        raise HTTPException(status_code=422, detail="Only bank transfer invoices can be manually marked as paid.")
    if inv.status not in {"sent", "overdue"}:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot mark invoice with status '{inv.status}' as paid.",
        )

    inv.status = "paid"
    await db.commit()
    await db.refresh(inv)

    return _invoice_to_dict(inv)


@router.post("/{invoice_id}/reopen")
async def reopen_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reopen a paid, cancelled, or overdue training invoice back to sent."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    if inv.status not in {"paid", "cancelled", "overdue"}:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot reopen invoice with status '{inv.status}'.",
        )

    inv.status = "sent"
    await db.commit()
    await db.refresh(inv)

    return _invoice_to_dict(inv)


@router.delete("/{invoice_id}")
async def delete_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Delete a draft training invoice."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
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


# ── Create invoice ────────────────────────────────────────────────────────────


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


@router.post("")
async def create_training_invoice(
    data: CreateTrainingInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Manually create a training invoice."""
    valid_statuses = {"draft", "sent"}
    if data.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status: {data.status}. Use draft or sent.")

    invoice_number = data.invoice_number
    if data.status == "sent" and not invoice_number:
        from app.core.training_invoice_number import generate_training_invoice_number

        invoice_number = await generate_training_invoice_number(db, current_user.tenant_id)

    issue_date = date.fromisoformat(data.issue_date) if data.issue_date else None
    due_date = date.fromisoformat(data.due_date) if data.due_date else None

    reg_id: UUID | None = None
    if data.training_registration_id:
        reg_id = UUID(data.training_registration_id)

    inv = TrainingInvoice(
        tenant_id=current_user.tenant_id,
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

    # For sent credit card invoices: create Stripe payment link and send email
    if inv.status == "sent":
        tenant: Tenant | None = None
        payment_link_url: str | None = None

        if inv.template_type == "credit_card":
            tenant = await db.get(Tenant, current_user.tenant_id)
            if tenant:
                try:
                    from app.core.training_stripe_helper import create_training_payment_link

                    link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
                    inv.stripe_payment_link_id = link_id
                    inv.stripe_payment_link_url = payment_link_url
                    await db.commit()
                    await db.refresh(inv)
                except Exception as exc:
                    logger.warning("Failed to create Stripe payment link for training invoice %s: %s", inv.id, exc)

        if inv.recipient_email:
            if tenant is None:
                tenant = await db.get(Tenant, current_user.tenant_id)
            if tenant:
                from app.core.training_registration_emails import send_training_invoice_email

                await send_training_invoice_email(db, inv, None, tenant, payment_link_url=payment_link_url)

    return _invoice_to_dict(inv)


# ── Replace invoice ───────────────────────────────────────────────────────────


class ReplaceTrainingInvoiceRequest(BaseModel):
    recipient_name: str | None = None
    recipient_email: str | None = None
    recipient_address_line1: str | None = None
    recipient_city: str | None = None
    recipient_postal_code: str | None = None
    recipient_country: str | None = None
    recipient_vat_number: str | None = None
    line_items: list[dict] | None = None
    subtotal: float | None = None
    tax_rate: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    notes: str | None = None
    reason: str | None = None


@router.post("/{invoice_id}/replace")
async def replace_training_invoice(
    invoice_id: UUID,
    data: ReplaceTrainingInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Replace a training invoice: cancel it, create a credit note, and issue a corrected invoice."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    if inv.status not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot replace invoice with status '{inv.status}'. Must be sent, overdue, or paid.",
        )
    if inv.template_type == "credit_note":
        raise HTTPException(status_code=422, detail="Cannot replace a credit note.")

    # Cancel original
    inv.status = "cancelled"

    from app.core.training_invoice_number import generate_training_invoice_number

    # Create credit note
    credit_note_number = await generate_training_invoice_number(db, current_user.tenant_id)
    credit_note = _build_credit_note(inv, current_user.tenant_id, credit_note_number, data.reason)
    db.add(credit_note)

    # Create replacement invoice (overriding fields from request)
    new_number = await generate_training_invoice_number(db, current_user.tenant_id)
    new_inv = TrainingInvoice(
        tenant_id=current_user.tenant_id,
        training_registration_id=inv.training_registration_id,
        invoice_number=new_number,
        template_type=inv.template_type,
        status="sent",
        issue_date=date.today(),
        due_date=inv.due_date,
        recipient_name=data.recipient_name if data.recipient_name is not None else inv.recipient_name,
        recipient_email=data.recipient_email if data.recipient_email is not None else inv.recipient_email,
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
        payment_method=inv.payment_method,
        line_items=data.line_items if data.line_items is not None else inv.line_items,
        subtotal=Decimal(str(data.subtotal)) if data.subtotal is not None else inv.subtotal,
        tax_rate=Decimal(str(data.tax_rate)) if data.tax_rate is not None else inv.tax_rate,
        tax_amount=Decimal(str(data.tax_amount)) if data.tax_amount is not None else inv.tax_amount,
        total=Decimal(str(data.total)) if data.total is not None else inv.total,
        currency=inv.currency,
        language=inv.language,
        notes=data.notes if data.notes is not None else inv.notes,
    )
    db.add(new_inv)
    await db.commit()
    await db.refresh(inv)
    await db.refresh(credit_note)
    await db.refresh(new_inv)

    return {
        "cancelled_invoice": _invoice_to_dict(inv),
        "credit_note": _invoice_to_dict(credit_note),
        "new_invoice": _invoice_to_dict(new_inv),
    }


# ── Stripe sync ──────────────────────────────────────────────────────────────


@router.post("/sync-stripe")
async def sync_training_stripe_payments(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Bulk-check Stripe for completed payments on pending credit card invoices."""
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    from app.core.training_stripe_helper import (
        find_payment_intent_for_training_invoice,
        get_training_stripe_client,
    )

    client = get_training_stripe_client(tenant)
    if not client:
        return {"total_checked": 0, "updated_to_paid": 0, "errors": [], "message": "Stripe not configured"}

    # Fetch all pending credit card invoices
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.tenant_id == current_user.tenant_id,
            TrainingInvoice.template_type == "credit_card",
            TrainingInvoice.status.in_(["sent", "overdue"]),
        )
    )
    invoices = result.scalars().all()

    total_checked = 0
    updated_to_paid = 0
    errors: list[dict] = []

    for inv in invoices:
        total_checked += 1
        try:
            pi = await find_payment_intent_for_training_invoice(inv, client, log_prefix="[SYNC] ")
            if pi and pi.status == "succeeded":
                inv.status = "paid"
                inv.stripe_payment_intent_id = pi.id
                updated_to_paid += 1
                logger.info("Sync: training invoice %s updated to paid (PI %s)", inv.invoice_number, pi.id)
        except Exception as exc:
            logger.warning("Sync: error checking invoice %s: %s", inv.id, exc)
            errors.append(
                {
                    "invoice_id": str(inv.id),
                    "invoice_number": inv.invoice_number or "DRAFT",
                    "error": str(exc),
                }
            )

    await db.commit()

    return {
        "total_checked": total_checked,
        "updated_to_paid": updated_to_paid,
        "errors": errors,
    }
