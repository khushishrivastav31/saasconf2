"""Invoice Stripe integration endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.core.exceptions import AuthorizationError
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.core.invoice_queries import get_invoice_with_events, refresh_invoice_with_events
from app.core.stripe_helper import find_payment_intent_for_invoice, refund_payment, validate_stripe_enabled
from app.models.audit import AuditLog
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
    """
    Bulk sync payment status for all pending credit card invoices.

    Checks all credit card invoices with payment intents that are sent/overdue,
    fetches their status from Stripe, and updates accordingly.

    Returns summary of sync operation with counts.
    """
    await _require_invoice_admin(db, current_user, conference_id)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Validate Stripe enabled and initialize client
    import stripe

    _, secret_key = validate_stripe_enabled(conference)
    stripe.api_key = secret_key

    # Get all credit card invoices with events eagerly loaded
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.events))
        .where(
            Invoice.conference_id == conference_id,
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.template_type == "credit_card",
            Invoice.status.in_(["sent", "overdue"]),
        )
    )
    invoices = list(result.scalars().all())

    logger.info(f"[SYNC] Found {len(invoices)} credit card invoices to sync for conference {conference_id}")
    for inv in invoices:
        logger.info(
            f"[SYNC] Invoice {inv.invoice_number} (ID: {inv.id}) - "
            f"Status: {inv.status}, Payment Intent: {inv.stripe_payment_intent_id or 'None (payment link)'}"
        )

    if not invoices:
        return {
            "message": "No pending credit card invoices to sync",
            "total_checked": 0,
            "updated_to_paid": 0,
            "payment_failures_logged": 0,
            "errors": [],
        }

    # Track results
    total_checked = len(invoices)
    updated_to_paid = 0
    payment_failures_logged = 0
    errors = []

    # Sync each invoice
    for invoice in invoices:
        try:
            logger.info(f"[SYNC] Processing invoice {invoice.invoice_number} (ID: {invoice.id})")

            # Find payment intent using 3-tier discovery strategy
            payment_intent = await find_payment_intent_for_invoice(
                invoice=invoice,
                stripe_client=stripe,
                logger_prefix="[SYNC] ",
            )

            # Skip if no payment intent found (customer hasn't paid yet)
            if not payment_intent:
                logger.info(f"[SYNC] No payment intent found for invoice {invoice.invoice_number} - skipping")
                continue

            old_status = invoice.status

            if payment_intent.status == "succeeded" and invoice.status != "paid":
                logger.info(
                    f"[SYNC] Updating invoice {invoice.invoice_number} status from {old_status} to paid "
                    f"(payment intent {payment_intent.id} succeeded)"
                )
                invoice.status = "paid"
                updated_to_paid += 1

                # Capture charge_id if available
                if payment_intent.latest_charge and not invoice.stripe_charge_id:
                    invoice.stripe_charge_id = payment_intent.latest_charge
                    logger.info(f"[SYNC] Captured charge_id: {payment_intent.latest_charge}")

                # Log payment succeeded event
                await log_invoice_event(
                    db=db,
                    invoice_id=invoice.id,
                    tenant_id=invoice.tenant_id,
                    event_type=InvoiceEventType.PAYMENT_SUCCEEDED,
                    status="succeeded",
                    user=current_user,
                    stripe_object_id=payment_intent.id,
                    stripe_object_type="payment_intent",
                    amount=float(payment_intent.amount) / 100,
                    currency=payment_intent.currency.upper(),
                    metadata={
                        "payment_method": payment_intent.payment_method,
                        "sync_source": "bulk",
                        "previous_invoice_status": old_status,
                    },
                )

                # Log audit
                audit = AuditLog(
                    tenant_id=current_user.tenant_id,
                    user_id=current_user.user_id,
                    action="invoice.payment_synced",
                    resource_type="invoice",
                    resource_id=invoice.id,
                    details={
                        "invoice_number": invoice.invoice_number,
                        "old_status": old_status,
                        "new_status": "paid",
                        "stripe_payment_intent_id": invoice.stripe_payment_intent_id,
                        "sync_type": "bulk",
                    },
                    ip_address=None,
                )
                db.add(audit)

            elif payment_intent.status in ("canceled", "failed"):
                logger.info(
                    f"[SYNC] Payment intent {payment_intent.id} for invoice {invoice.invoice_number} "
                    f"has status: {payment_intent.status}"
                )
                # Log failure if not already logged
                existing_failure = any(
                    e.event_type == InvoiceEventType.PAYMENT_FAILED and e.stripe_object_id == payment_intent.id
                    for e in invoice.events
                )

                if not existing_failure:
                    logger.info(f"[SYNC] Logging payment failure for invoice {invoice.invoice_number}")
                    payment_failures_logged += 1
                    await log_invoice_event(
                        db=db,
                        invoice_id=invoice.id,
                        tenant_id=invoice.tenant_id,
                        event_type=InvoiceEventType.PAYMENT_FAILED,
                        status="failed",
                        user=current_user,
                        stripe_object_id=payment_intent.id,
                        stripe_object_type="payment_intent",
                        amount=float(payment_intent.amount) / 100,
                        currency=payment_intent.currency.upper(),
                        error_message=payment_intent.last_payment_error.get("message")
                        if payment_intent.last_payment_error
                        else f"Payment {payment_intent.status}",
                        metadata={
                            "sync_source": "bulk",
                            "payment_intent_status": payment_intent.status,
                        },
                    )
            else:
                logger.info(
                    f"[SYNC] Invoice {invoice.invoice_number} payment intent {payment_intent.id} "
                    f"has status {payment_intent.status} - no action needed"
                )

        except stripe.error.StripeError as e:
            logger.error(f"[SYNC] Failed to sync invoice {invoice.id}: {e}")
            errors.append({"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "error": str(e)})

    logger.info(
        f"[SYNC] Committing changes: {updated_to_paid} invoices updated to paid, "
        f"{payment_failures_logged} failures logged, {len(errors)} errors"
    )
    await db.commit()
    logger.info("[SYNC] Database commit successful")

    return {
        "message": f"Synced {total_checked} invoice(s)",
        "total_checked": total_checked,
        "updated_to_paid": updated_to_paid,
        "payment_failures_logged": payment_failures_logged,
        "errors": errors,
    }


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

    # Initialize Stripe client
    import stripe

    _, secret_key = validate_stripe_enabled(conference)
    stripe.api_key = secret_key

    payment_intent = await find_payment_intent_for_invoice(invoice, stripe, "[SYNC]")
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
