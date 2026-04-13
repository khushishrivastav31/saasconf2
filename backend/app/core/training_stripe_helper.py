"""Stripe helpers for training invoices.

Mirrors stripe_helper.py but reads Stripe config from
tenant.settings.training_finance.stripe instead of conference.settings.stripe.
Training invoices have no InvoiceEvent model so the payment link ID is stored
directly on the TrainingInvoice row rather than looked up via event logs.
"""

import logging
from datetime import datetime

import stripe
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice

logger = logging.getLogger(__name__)


def get_training_stripe_client(tenant: Tenant) -> stripe.StripeClient | None:
    """Return an initialised Stripe client for the tenant's training Stripe config.

    Returns None if Stripe is not enabled or the secret key is missing.
    """
    finance = (tenant.settings or {}).get("training_finance", {})
    stripe_cfg = finance.get("stripe", {})

    if not stripe_cfg.get("is_enabled"):
        return None

    secret_key = stripe_cfg.get("secret_key")
    if not secret_key:
        return None

    return stripe.StripeClient(api_key=secret_key)


async def create_training_payment_link(
    db: AsyncSession,
    tenant: Tenant,
    invoice: TrainingInvoice,
) -> tuple[str, str]:
    """Create a Stripe payment link for a training invoice.

    Stores the payment link ID and URL on the invoice object (caller must commit).

    Args:
        db: Database session (unused currently — kept for future event logging)
        tenant: Tenant with training_finance.stripe settings
        invoice: TrainingInvoice to create the link for

    Returns:
        Tuple of (payment_link_id, payment_link_url)

    Raises:
        ValidationError: If Stripe is not configured or the API call fails
    """
    if invoice.template_type != "credit_card":
        raise ValidationError("Payment links are only supported for credit_card invoices")

    if not invoice.total or not invoice.currency:
        raise ValidationError("Invoice must have a total and currency to create a payment link")

    client = get_training_stripe_client(tenant)
    if not client:
        raise ValidationError("Stripe is not enabled for this tenant's training configuration")

    idempotency_key = f"training-invoice-{invoice.id}-payment-link-{datetime.utcnow().isoformat()}"

    try:
        payment_link = client.payment_links.create(
            {
                "line_items": [
                    {
                        "price_data": {
                            "currency": invoice.currency.lower(),
                            "product_data": {"name": f"Invoice {invoice.invoice_number or 'DRAFT'}"},
                            "unit_amount": int(invoice.total * 100),
                        },
                        "quantity": 1,
                    }
                ],
                "metadata": {
                    "system": "saasconf",
                    "training_invoice_id": str(invoice.id),
                },
                "payment_intent_data": {
                    "metadata": {
                        "system": "saasconf",
                        "tenant_id": str(invoice.tenant_id),
                        "training_invoice_id": str(invoice.id),
                        "invoice_number": invoice.invoice_number or "DRAFT",
                        "template_type": invoice.template_type,
                    }
                },
            },
            {"idempotency_key": idempotency_key},
        )

        logger.info(
            "Created Stripe payment link %s for training invoice %s",
            payment_link.id,
            invoice.invoice_number or invoice.id,
        )
        return (payment_link.id, payment_link.url)

    except stripe.StripeError as e:
        logger.error("Stripe payment link creation failed for training invoice %s: %s", invoice.id, e)
        raise ValidationError(f"Stripe error: {e!s}") from e


async def deactivate_training_payment_link(
    invoice: TrainingInvoice,
    tenant: Tenant,
) -> bool:
    """Deactivate the Stripe payment link for a training invoice.

    Best-effort: logs a warning on failure but does not raise.

    Args:
        invoice: TrainingInvoice with stripe_payment_link_id set
        tenant: Tenant with training_finance.stripe settings

    Returns:
        True if deactivated (or not needed), False if the API call failed
    """
    if invoice.template_type != "credit_card":
        return True

    if not invoice.stripe_payment_link_id:
        return True  # No link to deactivate

    client = get_training_stripe_client(tenant)
    if not client:
        return True  # Stripe not configured — nothing to deactivate

    try:
        client.payment_links.update(invoice.stripe_payment_link_id, {"active": False})
        logger.info(
            "Deactivated Stripe payment link %s for training invoice %s",
            invoice.stripe_payment_link_id,
            invoice.invoice_number or invoice.id,
        )
        return True
    except Exception as e:
        logger.warning(
            "Failed to deactivate Stripe payment link %s for training invoice %s: %s",
            invoice.stripe_payment_link_id,
            invoice.invoice_number or invoice.id,
            e,
        )
        return False


async def refund_training_payment(
    db: AsyncSession,
    tenant: Tenant,
    invoice: TrainingInvoice,
) -> dict:
    """Issue a full Stripe refund for a paid training invoice.

    Args:
        db: Database session (unused currently — kept for future event logging)
        tenant: Tenant with training_finance.stripe settings
        invoice: TrainingInvoice with stripe_payment_intent_id set

    Returns:
        Dict with refund_id and status

    Raises:
        ValidationError: If Stripe is not configured, payment_intent_id is missing,
                         or the refund API call fails
    """
    if not invoice.stripe_payment_intent_id:
        raise ValidationError("Invoice has no Stripe payment intent ID — cannot issue refund")

    client = get_training_stripe_client(tenant)
    if not client:
        raise ValidationError("Stripe is not enabled for this tenant's training configuration")

    try:
        refund = client.refunds.create(
            {
                "payment_intent": invoice.stripe_payment_intent_id,
                "reason": "requested_by_customer",
                "metadata": {
                    "system": "saasconf",
                    "tenant_id": str(invoice.tenant_id),
                    "training_invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number or "DRAFT",
                },
            }
        )

        logger.info(
            "Issued Stripe refund %s (status=%s) for training invoice %s",
            refund.id,
            refund.status,
            invoice.invoice_number or invoice.id,
        )
        return {"refund_id": refund.id, "status": refund.status}

    except stripe.StripeError as e:
        logger.error("Stripe refund failed for training invoice %s: %s", invoice.id, e)
        raise ValidationError(f"Stripe refund error: {e!s}") from e
