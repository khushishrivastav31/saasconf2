"""Stripe PaymentIntent helpers for the public training-registration flow.

Two endpoints — create a preview intent the moment the user picks the
credit-card option, update it as the cart total shifts (add/remove
attendees, toggle exams). Both are unauthenticated but require the
tenant's training-portal + Stripe config to be on.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.dependencies import DbSessionDep

from ._helpers import resolve_tenant

router = APIRouter()


class _PaymentIntentRequest(BaseModel):
    total: float
    currency: str = "EUR"


@router.post("/{tenant_slug}/trainings/create-payment-intent")
async def create_training_payment_intent(
    tenant_slug: str,
    data: _PaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """Create Stripe PaymentIntent for training registration (no auth)."""
    import stripe as stripe_lib

    tenant = await resolve_tenant(db, tenant_slug)
    finance = (tenant.settings or {}).get("training_finance", {})
    stripe_cfg = finance.get("stripe", {})

    if not stripe_cfg.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled")

    secret_key = stripe_cfg.get("secret_key")
    publishable_key = stripe_cfg.get("publishable_key")
    if not secret_key or not publishable_key:
        raise HTTPException(status_code=400, detail="Stripe keys not configured")

    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    try:
        stripe_lib.api_key = secret_key
        pi = stripe_lib.PaymentIntent.create(
            amount=int(data.total * 100),
            currency=data.currency.lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(tenant.id),
                "context": "training",
                "preview": "true",
            },
        )
        return {
            "payment_intent_id": pi.id,
            "client_secret": pi.client_secret,
            "publishable_key": publishable_key,
        }
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e


@router.put("/{tenant_slug}/trainings/update-payment-intent/{payment_intent_id}")
async def update_training_payment_intent(
    tenant_slug: str,
    payment_intent_id: str,
    data: _PaymentIntentRequest,
    db: DbSessionDep,
) -> dict:
    """Update Stripe PaymentIntent amount (no auth)."""
    import stripe as stripe_lib

    tenant = await resolve_tenant(db, tenant_slug)
    finance = (tenant.settings or {}).get("training_finance", {})
    stripe_cfg = finance.get("stripe", {})

    if not stripe_cfg.get("is_enabled"):
        raise HTTPException(status_code=400, detail="Stripe is not enabled")

    secret_key = stripe_cfg.get("secret_key")
    if not secret_key:
        raise HTTPException(status_code=400, detail="Stripe secret key not configured")

    if data.total <= 0:
        raise HTTPException(status_code=400, detail="Total must be greater than 0")

    try:
        stripe_lib.api_key = secret_key
        pi = stripe_lib.PaymentIntent.modify(
            payment_intent_id,
            amount=int(data.total * 100),
        )
        return {"success": True, "payment_intent_id": pi.id, "amount": data.total}
    except stripe_lib.error.StripeError as e:
        raise HTTPException(status_code=500, detail=f"Stripe error: {e!s}") from e
