"""Stripe webhook endpoints for payment notifications."""

import logging
from uuid import UUID

import stripe
from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.invoice_events import InvoiceEventType, log_invoice_event
from app.db.session import get_db
from app.models.conference import Conference
from app.models.invoice import Invoice

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stripe", tags=["stripe"])


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
):
    """
    Handle Stripe webhook events.

    This endpoint receives payment notifications from Stripe and:
    - Verifies webhook signature for security
    - Updates invoice status when payments succeed/fail
    - Logs all events to invoice_events table

    Events handled:
    - payment_intent.succeeded - Payment completed successfully
    - payment_intent.payment_failed - Payment attempt failed
    - charge.succeeded - Charge completed (includes charge_id)

    No authentication required - Stripe signature verification provides security.
    """
    # Get raw body for signature verification
    payload = await request.body()

    # Extract invoice_id from metadata to get webhook secret
    try:
        event_dict = stripe.Event.construct_from(
            values=await request.json(),
            key=stripe.api_key,
        )
    except Exception as e:
        logger.error(f"Invalid Stripe webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload") from e

    # Extract invoice_id from metadata
    metadata = {}
    if event_dict.data.object.get("metadata"):
        metadata = event_dict.data.object.metadata
    elif hasattr(event_dict.data.object, "payment_intent"):
        # For charge events, get metadata from payment_intent
        try:
            pi = stripe.PaymentIntent.retrieve(event_dict.data.object.payment_intent)
            metadata = pi.metadata
        except Exception:
            pass

    invoice_id_str = metadata.get("invoice_id")
    if not invoice_id_str:
        logger.warning(f"Webhook event {event_dict.id} missing invoice_id in metadata")
        return {"status": "ignored", "reason": "no invoice_id"}

    try:
        invoice_id = UUID(invoice_id_str)
    except ValueError as e:
        logger.error(f"Invalid invoice_id in webhook metadata: {invoice_id_str}")
        raise HTTPException(status_code=400, detail="Invalid invoice_id") from e

    # Get invoice and conference to retrieve webhook secret
    async for db in get_db():
        result = await db.execute(select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.events)))
        invoice = result.scalar_one_or_none()

        if not invoice:
            logger.error(f"Invoice {invoice_id} not found for webhook event {event_dict.id}")
            raise HTTPException(status_code=404, detail="Invoice not found")

        # Get conference and webhook secret
        conf_result = await db.execute(select(Conference).where(Conference.id == invoice.conference_id))
        conference = conf_result.scalar_one_or_none()

        if not conference:
            logger.error(f"Conference not found for invoice {invoice_id}")
            raise HTTPException(status_code=404, detail="Conference not found")

        stripe_settings = conference.settings.get("stripe", {})
        webhook_secret = stripe_settings.get("webhook_secret")

        # Verify signature if webhook secret is configured
        if webhook_secret and stripe_signature:
            try:
                event = stripe.Webhook.construct_event(
                    payload=payload,
                    sig_header=stripe_signature,
                    secret=webhook_secret,
                )
            except stripe.error.SignatureVerificationError as e:
                logger.error(f"Invalid webhook signature: {e}")
                raise HTTPException(status_code=400, detail="Invalid signature") from e
        else:
            # No signature verification if secret not configured (development mode)
            if not webhook_secret:
                logger.warning(
                    f"Webhook secret not configured for conference {conference.id} - skipping signature verification"
                )
            event = event_dict

        # Handle the event
        event_type = event.type
        event_obj = event.data.object

        logger.info(f"Processing Stripe webhook: {event_type} for invoice {invoice_id}")

        # Handle payment_intent.succeeded
        if event_type == "payment_intent.succeeded":
            payment_intent = event_obj

            # Update invoice status
            invoice.status = "paid"
            if not invoice.stripe_payment_intent_id:
                invoice.stripe_payment_intent_id = payment_intent.id

            # Log event
            await log_invoice_event(
                db=db,
                invoice_id=invoice.id,
                tenant_id=invoice.tenant_id,
                event_type=InvoiceEventType.PAYMENT_SUCCEEDED,
                status="succeeded",
                user=None,  # Webhook, no user
                stripe_object_id=payment_intent.id,
                stripe_object_type="payment_intent",
                amount=float(payment_intent.amount) / 100,
                currency=payment_intent.currency.upper(),
                metadata={
                    "payment_method": payment_intent.payment_method,
                    "webhook_event_id": event.id,
                },
            )

            await db.commit()
            logger.info(f"Invoice {invoice_id} marked as paid from webhook")

        # Handle charge.succeeded (to capture charge_id)
        elif event_type == "charge.succeeded":
            charge = event_obj

            # Update charge_id if not already set
            if not invoice.stripe_charge_id:
                invoice.stripe_charge_id = charge.id
                await db.commit()

            logger.info(f"Updated invoice {invoice_id} with charge_id {charge.id}")

        # Handle payment_intent.payment_failed
        elif event_type == "payment_intent.payment_failed":
            payment_intent = event_obj

            # Log failure
            await log_invoice_event(
                db=db,
                invoice_id=invoice.id,
                tenant_id=invoice.tenant_id,
                event_type=InvoiceEventType.PAYMENT_FAILED,
                status="failed",
                user=None,
                stripe_object_id=payment_intent.id,
                stripe_object_type="payment_intent",
                amount=float(payment_intent.amount) / 100,
                currency=payment_intent.currency.upper(),
                error_message=payment_intent.last_payment_error.get("message")
                if payment_intent.last_payment_error
                else None,
                metadata={
                    "failure_code": payment_intent.last_payment_error.get("code")
                    if payment_intent.last_payment_error
                    else None,
                    "webhook_event_id": event.id,
                },
            )

            await db.commit()
            logger.info(f"Logged payment failure for invoice {invoice_id}")

        else:
            logger.info(f"Unhandled webhook event type: {event_type}")

        return {"status": "success", "event_type": event_type}
