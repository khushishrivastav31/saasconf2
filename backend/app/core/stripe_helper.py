"""Stripe payment and refund helpers with full event logging."""

import logging
from datetime import datetime
from decimal import Decimal

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.user import User

logger = logging.getLogger(__name__)


def get_stripe_client(conference: Conference) -> stripe.StripeClient | None:
    """Get initialized Stripe client for conference.

    Returns None if Stripe is not enabled or keys not configured.

    Args:
        conference: Conference with settings

    Returns:
        Stripe client if configured, None otherwise
    """
    settings = conference.settings or {}
    stripe_settings = settings.get("stripe", {})

    if not stripe_settings.get("is_enabled"):
        return None

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        return None

    # Set API key globally (note: not thread-safe for multi-tenant)
    # TODO: Use StripeClient(api_key=...) for better multi-tenant safety
    stripe.api_key = secret_key
    return stripe


async def create_payment_link(
    db: AsyncSession,
    conference: Conference,
    invoice: Invoice,
    current_user: User,
) -> tuple[str, str]:
    """Create Stripe payment link for invoice with full event logging.

    Args:
        db: Database session
        conference: Conference with Stripe settings
        invoice: Invoice to create payment for
        current_user: User creating the link

    Returns:
        Tuple of (payment_intent_id, payment_link_url)

    Raises:
        ValidationError: If Stripe not configured or API error
    """
    client = get_stripe_client(conference)
    if not client:
        raise ValidationError("Stripe is not enabled for this conference")

    if not invoice.total or not invoice.currency:
        raise ValidationError("Invoice must have total and currency")

    # Generate idempotency key
    idempotency_key = f"invoice-{invoice.id}-payment-link-{datetime.utcnow().isoformat()}"

    try:
        # Create PaymentIntent first
        payment_intent = stripe.PaymentIntent.create(
            amount=int(invoice.total * 100),  # Stripe uses cents
            currency=invoice.currency.lower(),
            description=f"Invoice {invoice.invoice_number or 'DRAFT'}",
            metadata={
                "system": "saasconf",
                "tenant_id": str(invoice.tenant_id),
                "conference_id": str(invoice.conference_id),
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number or "DRAFT",
                "template_type": invoice.template_type,
            },
            automatic_payment_methods={"enabled": True},
            idempotency_key=idempotency_key,
        )

        # Create Payment Link
        payment_link = stripe.PaymentLink.create(
            line_items=[
                {
                    "price_data": {
                        "currency": invoice.currency.lower(),
                        "product_data": {"name": f"Invoice {invoice.invoice_number or 'DRAFT'}"},
                        "unit_amount": int(invoice.total * 100),
                    },
                    "quantity": 1,
                }
            ],
            metadata={
                "system": "saasconf",
                "invoice_id": str(invoice.id),
                "payment_intent_id": payment_intent.id,
            },
        )

        # Log success
        await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.PAYMENT_LINK_CREATED,
            status="succeeded",
            user=current_user,
            stripe_object_id=payment_link.id,
            stripe_object_type="payment_link",
            stripe_idempotency_key=idempotency_key,
            amount=invoice.total,
            currency=invoice.currency,
            metadata={
                "payment_intent_id": payment_intent.id,
                "payment_link_url": payment_link.url,
                "invoice_number": invoice.invoice_number or "DRAFT",
            },
        )

        return (payment_intent.id, payment_link.url)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe payment link creation failed for invoice {invoice.id}: {e}")
        raise ValidationError(f"Stripe error: {e!s}") from e


async def refund_payment(
    db: AsyncSession,
    conference: Conference,
    invoice: Invoice,
    current_user: User,
    amount: Decimal | None = None,
    reason: str = "requested_by_customer",
) -> dict:
    """Issue refund for a Stripe payment with full event logging.

    Args:
        db: Database session
        conference: Conference with Stripe settings
        invoice: Invoice with payment to refund
        current_user: User initiating refund
        amount: Amount to refund (None for full refund)
        reason: Refund reason (duplicate, fraudulent, requested_by_customer)

    Returns:
        dict with refund details: {refund_id, status, amount, currency, event_id}

    Raises:
        ValidationError: If Stripe not configured or refund fails
    """
    client = get_stripe_client(conference)
    if not client:
        raise ValidationError("Stripe is not enabled for this conference")

    if not invoice.stripe_payment_intent_id:
        raise ValidationError("Invoice does not have a Stripe payment intent ID")

    # Generate idempotency key
    idempotency_key = f"refund-{invoice.id}-{datetime.utcnow().isoformat()}"

    try:
        # Log refund initiation
        await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.REFUND_INITIATED,
            status="pending",
            user=current_user,
            stripe_object_id=invoice.stripe_payment_intent_id,
            stripe_object_type="payment_intent",
            stripe_idempotency_key=idempotency_key,
            amount=amount or invoice.total,
            currency=invoice.currency,
            metadata={
                "refund_reason": reason,
                "invoice_number": invoice.invoice_number or "DRAFT",
            },
        )

        # Create Stripe refund
        refund_params = {
            "payment_intent": invoice.stripe_payment_intent_id,
            "reason": reason,
            "metadata": {
                "system": "saasconf",
                "tenant_id": str(invoice.tenant_id),
                "conference_id": str(invoice.conference_id),
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number or "DRAFT",
                "refund_reason": reason,
            },
        }

        if amount is not None:
            refund_params["amount"] = int(amount * 100)

        refund = stripe.Refund.create(**refund_params, idempotency_key=idempotency_key)

        # Log success
        success_event = await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.REFUND_SUCCEEDED,
            status=refund.status,  # succeeded, pending, failed, cancelled
            user=current_user,
            stripe_object_id=refund.id,
            stripe_object_type="refund",
            stripe_idempotency_key=idempotency_key,
            amount=Decimal(refund.amount) / 100,
            currency=refund.currency.upper(),
            metadata={
                "payment_intent_id": invoice.stripe_payment_intent_id,
                "charge_id": refund.charge,
                "refund_reason": reason,
            },
        )

        return {
            "refund_id": refund.id,
            "status": refund.status,
            "amount": Decimal(refund.amount) / 100,
            "currency": refund.currency.upper(),
            "event_id": str(success_event.id),
        }

    except stripe.error.StripeError as e:
        # Log failure
        await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.REFUND_FAILED,
            status="failed",
            user=current_user,
            stripe_object_id=invoice.stripe_payment_intent_id,
            stripe_object_type="payment_intent",
            stripe_idempotency_key=idempotency_key,
            amount=amount or invoice.total,
            currency=invoice.currency,
            error_message=str(e),
            metadata={
                "refund_reason": reason,
                "stripe_error_type": type(e).__name__,
            },
        )

        logger.error(f"Stripe refund failed for invoice {invoice.id}: {e}")
        raise ValidationError(f"Stripe refund failed: {e!s}") from e
