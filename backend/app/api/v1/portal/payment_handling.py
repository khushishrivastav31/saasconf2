"""
Payment Handling API

Public endpoints for Stripe PaymentIntent lifecycle management
during the checkout flow. No authentication required.
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import DbSessionDep

from .registration import resolve_tenant_and_conference

logger = logging.getLogger(__name__)
router = APIRouter()


class CreatePaymentIntentRequest(BaseModel):
    """Request to create PaymentIntent before registration."""

    total: float


class CreatePaymentIntentResponse(BaseModel):
    """Response with PaymentIntent details."""

    payment_intent_id: str
    client_secret: str
    publishable_key: str


@router.post("/{tenant_slug}/conferences/{conference_slug}/create-payment-intent")
async def create_payment_intent_preview(
    tenant_slug: str,
    conference_slug: str,
    data: CreatePaymentIntentRequest,
    db: DbSessionDep,
) -> CreatePaymentIntentResponse:
    """
    Create Stripe PaymentIntent immediately (before registration submission).

    Used for payment-first flow: user selects credit card -> Stripe form appears immediately.
    This creates the PaymentIntent with the current order total, which can be updated
    if the user changes their order.

    No authentication required - publicly accessible endpoint.

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        data: Payment intent request with total amount
        db: Database session

    Returns:
        CreatePaymentIntentResponse with client_secret for Stripe Elements

    Raises:
        HTTPException: If Stripe not configured or validation fails
    """
    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    publishable_key = stripe_settings.get("publishable_key")
    secret_key = stripe_settings.get("secret_key")

    if not secret_key or not publishable_key:
        raise HTTPException(status_code=400, detail="Stripe keys not configured")

    # Validate amount
    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    # Create PaymentIntent
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.create(
            amount=int(data.total * 100),  # Convert to cents
            currency=(conference.currency or "EUR").lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(conference.tenant_id),
                "conference_id": str(conference.id),
                "preview": "true",  # Mark as preview (not linked to invoice yet)
            },
        )

        if not payment_intent.client_secret:
            raise HTTPException(status_code=500, detail="Failed to create payment intent")

        logger.info(f"Created preview PaymentIntent {payment_intent.id} for {data.total} {conference.currency}")

        return CreatePaymentIntentResponse(
            payment_intent_id=payment_intent.id,
            client_secret=payment_intent.client_secret,
            publishable_key=publishable_key,
        )

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent creation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


class UpdatePaymentIntentRequest(BaseModel):
    """Request to update PaymentIntent amount."""

    total: float


@router.put("/{tenant_slug}/conferences/{conference_slug}/update-payment-intent/{payment_intent_id}")
async def update_payment_intent_amount(
    tenant_slug: str,
    conference_slug: str,
    payment_intent_id: str,
    data: UpdatePaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """
    Update PaymentIntent amount when order total changes.

    Used when user modifies their order (adds/removes attendees) after PaymentIntent
    was created. Stripe allows updating the amount as long as payment hasn't been confirmed.

    No authentication required - publicly accessible endpoint.

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        payment_intent_id: Stripe PaymentIntent ID
        data: Update request with new total
        db: Database session

    Returns:
        Success confirmation

    Raises:
        HTTPException: If Stripe not configured or update fails
    """
    # Resolve tenant and conference
    _tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Validate Stripe is enabled
    stripe_settings = conference.settings.get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled for this conference")

    secret_key = stripe_settings.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    # Validate amount
    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    # Update PaymentIntent
    try:
        import stripe

        stripe.api_key = secret_key

        payment_intent = stripe.PaymentIntent.modify(
            payment_intent_id,
            amount=int(data.total * 100),  # Convert to cents
        )

        logger.info(f"Updated PaymentIntent {payment_intent_id} to {data.total} {conference.currency}")

        return {
            "success": True,
            "payment_intent_id": payment_intent.id,
            "amount": data.total,
            "currency": conference.currency,
        }

    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent update failed for {payment_intent_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e
