"""Invoice Stripe integration endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import AuthorizationError
from app.core.invoice_queries import get_invoice_with_events, refresh_invoice_with_events
from app.core.stripe_helper import find_payment_intent_for_invoice, refund_payment, validate_stripe_enabled
from app.models.invoice import Invoice
from app.schemas.invoice import InvoiceResponse

from ._helpers import build_invoice_response

MODULE_CODE = "invoices"
logger = logging.getLogger(__name__)

router = APIRouter()


async def _require_invoice_admin(db: DbSessionDep, current_user: CurrentUserDep, conference_id: UUID) -> None:
    """Check admin access: super admin, tenant admin, OR conference-specific admin."""
    from app.core.dependencies import check_conference_admin_access

    # Super admins and tenant admins have automatic access
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return

    # For regular users, check conference-specific admin access
    has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
    if not has_access:
        raise AuthorizationError("Admin access to this conference required")


@router.post(
    "/{invoice_id}/refund", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def refund_stripe_payment(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> InvoiceResponse:
    """Trigger Stripe refund for cancelled credit card invoice."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    if invoice.status != "cancelled":
        raise HTTPException(
            status_code=400, detail="Only cancelled invoices can be refunded. Cancel the invoice first."
        )
    if invoice.template_type != "credit_card":
        raise HTTPException(status_code=400, detail="Only credit card invoices can be refunded via Stripe")
    if not invoice.stripe_payment_intent_id:
        raise HTTPException(status_code=400, detail="No Stripe payment to refund")

    # Check if already refunded
    from app.core.invoice_events import InvoiceEventType

    refund_succeeded_events = [e for e in invoice.events if e.event_type == InvoiceEventType.REFUND_SUCCEEDED]
    if refund_succeeded_events:
        raise HTTPException(
            status_code=400, detail=f"Invoice already refunded on {refund_succeeded_events[0].created_at}"
        )

    # Trigger full refund
    refund_result = await refund_payment(
        db=db,
        conference=conference,
        invoice=invoice,
        current_user=current_user,
        amount=None,  # Full refund
        reason="requested_by_customer",
    )

    # Audit log
    from app.core.dependencies import get_client_ip
    from app.models.audit import AuditLog

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="invoice.refunded",
            resource_type="invoice",
            resource_id=invoice.id,
            details={
                "invoice_number": invoice.invoice_number,
                "refund_id": refund_result["refund_id"],
                "amount": float(refund_result["amount"]),
                "currency": refund_result["currency"],
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice_id)
    return build_invoice_response(invoice)


@router.post("/sync-all-payments", dependencies=[Depends(require_module(MODULE_CODE))])
async def sync_all_stripe_payments(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> dict:
    """Sync all Stripe payments for conference."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Validate Stripe enabled
    _, _secret_key = validate_stripe_enabled(conference)

    # Get all credit card invoices
    result = await db.execute(
        select(Invoice).where(
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.template_type == "credit_card",
            Invoice.status.in_(["sent", "overdue"]),
        )
    )
    invoices = list(result.scalars().all())

    updated_to_paid = 0
    for invoice in invoices:
        payment_intent = await find_payment_intent_for_invoice(conference, invoice)
        if payment_intent and payment_intent.status == "succeeded":
            invoice.status = "paid"
            invoice.stripe_payment_intent_id = payment_intent.id
            updated_to_paid += 1

    await db.commit()
    return {"total_checked": len(invoices), "updated_to_paid": updated_to_paid}


@router.post(
    "/{invoice_id}/sync-payment", response_model=InvoiceResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def sync_stripe_payment(
    conference_id: UUID,
    invoice_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> InvoiceResponse:
    """Sync single invoice payment status from Stripe."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    invoice = await get_invoice_with_events(db, invoice_id, conference_id, current_user.tenant_id)

    if invoice.template_type != "credit_card":
        raise HTTPException(status_code=400, detail="Only credit card invoices can be synced")

    payment_intent = await find_payment_intent_for_invoice(conference, invoice)
    if payment_intent and payment_intent.status == "succeeded":
        invoice.status = "paid"
        invoice.stripe_payment_intent_id = payment_intent.id

    await db.commit()
    invoice = await refresh_invoice_with_events(db, invoice_id)
    return build_invoice_response(invoice)


@router.get("/{invoice_id}/debug-stripe-search", include_in_schema=False)
async def debug_stripe_search(
    conference_id: UUID,
    invoice_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """Debug Stripe payment search (development only)."""
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(select(Invoice).where(Invoice.id == invoice_id, Invoice.conference_id == conference_id))
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    import stripe

    _, secret_key = validate_stripe_enabled(conference)
    stripe.api_key = secret_key

    search_query = f'metadata["invoice_id"]:"{invoice.id}"'
    search_results = stripe.PaymentIntent.search(query=search_query, limit=10)

    return {
        "invoice_id": str(invoice.id),
        "search_query": search_query,
        "results_found": len(search_results.data),
        "payment_intents": [{"id": pi.id, "status": pi.status, "amount": pi.amount} for pi in search_results.data],
    }
