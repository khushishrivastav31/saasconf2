"""Stripe payment and refund helpers with full event logging."""

import logging
from datetime import datetime
from decimal import Decimal

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUser
from app.core.exceptions import ValidationError
from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.user import User

logger = logging.getLogger(__name__)


def get_stripe_client(conference: Conference) -> stripe.StripeClient | None:  # type: ignore[return-value]
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
    return stripe  # type: ignore[return-value]


async def deactivate_payment_link_for_invoice(
    invoice: Invoice,
    conference: Conference,
) -> bool:
    """Deactivate Stripe payment link for an invoice.

    Finds the payment link ID from invoice events and deactivates it via Stripe API.
    Best-effort operation - logs warnings on failure but does not raise exceptions.

    Args:
        invoice: Invoice with events relationship loaded
        conference: Conference with Stripe settings

    Returns:
        True if deactivation succeeded or was not needed, False if failed
    """
    if invoice.template_type != "credit_card":
        return True  # Not a credit card invoice, nothing to deactivate

    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled") or not stripe_settings.get("secret_key"):
        return True  # Stripe not configured

    # Find payment link ID from events
    payment_link_event = next(
        (e for e in invoice.events if e.event_type == InvoiceEventType.PAYMENT_LINK_CREATED),
        None,
    )

    if not payment_link_event or not payment_link_event.stripe_object_id:
        return True  # No payment link found

    try:
        stripe.api_key = stripe_settings["secret_key"]
        stripe.PaymentLink.modify(payment_link_event.stripe_object_id, active=False)
        logger.info(
            f"Deactivated Stripe payment link {payment_link_event.stripe_object_id} "
            f"for invoice {invoice.invoice_number or invoice.id}"
        )
        return True
    except Exception as e:
        logger.warning(
            f"Failed to deactivate Stripe payment link for invoice {invoice.invoice_number or invoice.id}: {e}"
        )
        return False


async def create_payment_link(
    db: AsyncSession,
    conference: Conference,
    invoice: Invoice,
    current_user: User | CurrentUser,
) -> tuple[str | None, str]:
    """Create Stripe payment link for invoice with full event logging.

    Args:
        db: Database session
        conference: Conference with Stripe settings
        invoice: Invoice to create payment for
        current_user: User or CurrentUser creating the link

    Returns:
        Tuple of (payment_intent_id, payment_link_url). Note: payment_intent_id is None
        until customer completes payment (PaymentIntent is created by Stripe on payment).

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
        # Create Payment Link
        # NOTE: Payment Links create their own PaymentIntent when customer pays
        # We use payment_intent_data to pass metadata to the auto-created PaymentIntent
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
            },
            payment_intent_data={
                "metadata": {
                    "system": "saasconf",
                    "tenant_id": str(invoice.tenant_id),
                    "conference_id": str(invoice.conference_id),
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number or "DRAFT",
                    "template_type": invoice.template_type,
                }
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
                "payment_link_id": payment_link.id,
                "payment_link_url": payment_link.url,
                "invoice_number": invoice.invoice_number or "DRAFT",
            },
        )

        # Return None for payment_intent_id since it will be created when customer pays
        # The sync logic will find it via metadata search
        return (None, payment_link.url)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe payment link creation failed for invoice {invoice.id}: {e}")
        raise ValidationError(f"Stripe error: {e!s}") from e


async def refund_payment(
    db: AsyncSession,
    conference: Conference,
    invoice: Invoice,
    current_user: User | CurrentUser,
    amount: Decimal | None = None,
    reason: str = "requested_by_customer",
) -> dict:
    """Issue refund for a Stripe payment with full event logging.

    Args:
        db: Database session
        conference: Conference with Stripe settings
        invoice: Invoice with payment to refund
        current_user: User or CurrentUser initiating refund
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
        refund_params: dict[str, object] = {
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

        refund = stripe.Refund.create(**refund_params, idempotency_key=idempotency_key)  # type: ignore[arg-type]

        # Log success
        success_event = await log_invoice_event(
            db=db,
            invoice_id=invoice.id,
            tenant_id=invoice.tenant_id,
            event_type=InvoiceEventType.REFUND_SUCCEEDED,
            status=refund.status or "succeeded",  # succeeded, pending, failed, cancelled
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


async def find_payment_intent_for_invoice(
    invoice: Invoice,
    stripe_client: object,
    logger_prefix: str = "",
) -> stripe.PaymentIntent | None:  # type: ignore[name-defined]
    """Find the payment intent for an invoice using multiple discovery strategies.

    Tries 3 methods in order:
    1. Retrieve stored payment_intent_id (if exists)
    2. Search Stripe API by invoice_id metadata
    3. Find via Payment Link → Checkout Session → Payment Intent traversal

    Args:
        invoice: Invoice model with events relationship loaded
        stripe_client: Initialized Stripe client
        logger_prefix: Prefix for log messages (e.g., "[SYNC]")

    Returns:
        PaymentIntent if found (succeeded or any status), None otherwise
        Updates invoice.stripe_payment_intent_id if found via search

    Side Effects:
        - Updates invoice.stripe_payment_intent_id if found via fallback methods
        - Logs discovery attempts
    """
    payment_intent = None

    # Strategy 1: Retrieve stored payment_intent_id
    if invoice.stripe_payment_intent_id:
        try:
            payment_intent = stripe_client.PaymentIntent.retrieve(invoice.stripe_payment_intent_id)  # type: ignore[attr-defined]
            logger.info(
                f"{logger_prefix}Retrieved stored payment intent {payment_intent.id} - Status: {payment_intent.status}"
            )
        except stripe.error.StripeError as e:
            logger.warning(f"{logger_prefix}Failed to retrieve PaymentIntent {invoice.stripe_payment_intent_id}: {e}")

    # Strategy 2: Search by invoice_id metadata
    if not payment_intent or payment_intent.status != "succeeded":
        pi_status = payment_intent.id if payment_intent else "None (payment link)"
        logger.info(f"{logger_prefix}Payment intent {pi_status} - searching for succeeded payment intents...")

        try:
            search_query = f'metadata["invoice_id"]:"{invoice.id}" AND status:"succeeded"'
            logger.info(f"{logger_prefix}Search query: {search_query}")

            search_results = stripe_client.PaymentIntent.search(query=search_query, limit=1)  # type: ignore[attr-defined]
            logger.info(f"{logger_prefix}Search returned {len(search_results.data)} results")

            if search_results.data:
                old_pi_id = payment_intent.id if payment_intent else "None"
                payment_intent = search_results.data[0]
                invoice.stripe_payment_intent_id = payment_intent.id
                logger.info(
                    f"{logger_prefix}Found succeeded payment intent {payment_intent.id} via search "
                    f"for invoice {invoice.id} (was {old_pi_id})"
                )
            else:
                logger.info(f"{logger_prefix}No succeeded payment intents found for invoice {invoice.id}")
        except Exception as e:
            logger.warning(f"{logger_prefix}Failed to search for payment intents for invoice {invoice.id}: {e}")

    # Strategy 3: Find via Payment Link → Checkout Session → Payment Intent
    if (not payment_intent or payment_intent.status != "succeeded") and invoice.events:
        try:
            # Find PAYMENT_LINK_CREATED event
            payment_link_event = next(
                (e for e in invoice.events if e.event_type == InvoiceEventType.PAYMENT_LINK_CREATED), None
            )

            if payment_link_event and payment_link_event.stripe_object_id:
                payment_link_id = payment_link_event.stripe_object_id
                logger.info(f"{logger_prefix}Found payment link {payment_link_id}, searching for checkout sessions...")

                # Search for checkout sessions using this payment link
                sessions = stripe_client.checkout.Session.list(payment_link=payment_link_id, limit=10)  # type: ignore[attr-defined]

                # Find completed session with payment intent
                for session in sessions.data:
                    if session.payment_intent and session.status == "complete":
                        pi = stripe_client.PaymentIntent.retrieve(session.payment_intent)  # type: ignore[attr-defined]
                        if pi.status == "succeeded":
                            payment_intent = pi
                            invoice.stripe_payment_intent_id = payment_intent.id
                            logger.info(
                                f"{logger_prefix}Found succeeded payment intent {payment_intent.id} "
                                f"via payment link {payment_link_id}"
                            )
                            break
        except Exception as e:
            logger.warning(f"{logger_prefix}Failed to search via payment link for invoice {invoice.id}: {e}")

    return payment_intent
