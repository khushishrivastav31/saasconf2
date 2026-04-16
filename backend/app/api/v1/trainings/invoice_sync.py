"""Training invoice Stripe sync — bulk-check payments on pending credit card invoices."""

import logging

from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.training_stripe_helper import find_payment_intent_for_training_invoice, get_training_stripe_client
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["training-invoices"])


@router.post("/sync-stripe")
async def sync_training_stripe_payments(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Bulk-check Stripe for completed payments on pending credit card invoices."""
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    client = get_training_stripe_client(tenant)
    if not client:
        return {"total_checked": 0, "updated_to_paid": 0, "errors": [], "message": "Stripe not configured"}

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
                # Idempotency: skip if already marked paid (race condition with concurrent sync/mark-paid)
                if inv.status == "paid":
                    continue
                # Skip if this PI was already assigned to another invoice (double-payment guard)
                if inv.stripe_payment_intent_id and inv.stripe_payment_intent_id != pi.id:
                    logger.warning(
                        "Sync: invoice %s already has PI %s, skipping new PI %s",
                        inv.invoice_number,
                        inv.stripe_payment_intent_id,
                        pi.id,
                    )
                    continue
                inv.status = "paid"
                inv.stripe_payment_intent_id = pi.id
                updated_to_paid += 1
                logger.info("Sync: training invoice %s updated to paid (PI %s)", inv.invoice_number, pi.id)
        except Exception as exc:
            logger.warning("Sync: error checking invoice %s: %s", inv.id, exc)
            errors.append(
                {"invoice_id": str(inv.id), "invoice_number": inv.invoice_number or "DRAFT", "error": str(exc)}
            )

    await db.commit()

    return {"total_checked": total_checked, "updated_to_paid": updated_to_paid, "errors": errors}
