"""Create training invoices from accepted offers."""

import logging
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.trainings._invoice_helpers import invoice_to_dict
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import read_pii
from app.core.training_invoice_number import generate_training_invoice_number
from app.core.training_registration_emails import send_training_invoice_email
from app.core.training_stripe_helper import create_training_payment_link
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.offer_placement import OfferPlacement
from app.models.tenant import Tenant
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/offers/{offer_id}", tags=["offer-invoicing"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class PlacementLineItem(BaseModel):
    placement_id: str
    training_price: float = 0
    certification_price: float = 0
    include: bool = True


class CreateOfferInvoiceRequest(BaseModel):
    placements: list[PlacementLineItem]
    template_type: str = "bank_transfer"
    issue_date: str | None = None
    due_date: str | None = None
    tax_rate: float | None = None
    notes: str | None = None
    status: str = "draft"


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _load_offer(db: DbSessionDep, offer_id: UUID, tenant_id: UUID) -> CustomerOffer:
    result = await db.execute(
        select(CustomerOffer)
        .options(joinedload(CustomerOffer.customer))
        .where(CustomerOffer.id == offer_id, CustomerOffer.tenant_id == tenant_id)
    )
    offer = result.scalars().first()
    if not offer:
        raise NotFoundError("Offer not found")
    return offer


async def _load_placement_details(db: DbSessionDep, offer_id: UUID, tenant_id: UUID) -> list[dict]:
    """Load placements linked to the offer with training info + attendees."""
    # Get placement IDs via join table
    op_result = await db.execute(select(OfferPlacement.placement_id).where(OfferPlacement.offer_id == offer_id))
    placement_ids = [pid for (pid,) in op_result.all()]

    # Also check direct FK
    direct_result = await db.execute(select(ProgramYearTraining.id).where(ProgramYearTraining.offer_id == offer_id))
    for (pid,) in direct_result.all():
        if pid not in placement_ids:
            placement_ids.append(pid)

    if not placement_ids:
        return []

    # Load placement + training info
    p_result = await db.execute(
        select(ProgramYearTraining)
        .options(joinedload(ProgramYearTraining.training))
        .where(ProgramYearTraining.id.in_(placement_ids))
        .order_by(ProgramYearTraining.start_date)
    )
    placements = p_result.scalars().unique().all()

    # Load attendees per placement
    att_result = await db.execute(
        select(OfferAttendee)
        .where(
            OfferAttendee.offer_id == offer_id,
            OfferAttendee.placement_id.in_(placement_ids),
        )
        .order_by(OfferAttendee.created_at)
    )
    attendees_by_placement: dict[UUID, list[OfferAttendee]] = {}
    for att in att_result.scalars().all():
        attendees_by_placement.setdefault(att.placement_id, []).append(att)

    result = []
    for p in placements:
        atts = attendees_by_placement.get(p.id, [])
        cert_count = sum(1 for a in atts if a.certification)
        result.append(
            {
                "id": str(p.id),
                "training_name": p.training.name if p.training else "Unknown",
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "placement_type": p.placement_type,
                "attendee_count": len(atts),
                "certification_count": cert_count,
                "attendees": [
                    {
                        "first_name": a.first_name,
                        "last_name": a.last_name,
                        "email": a.email,
                        "certification": a.certification,
                        "exam_mode": a.exam_mode,
                        "exam_language": a.exam_language,
                        "extra_time": a.extra_time,
                    }
                    for a in atts
                ],
            }
        )
    return result


def _format_date(d: str | None) -> str:
    if not d:
        return ""
    try:
        return date.fromisoformat(d).strftime("%d.%m.%Y")
    except ValueError:
        return d


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/invoice-preview")
async def get_offer_invoice_preview(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get pre-populated data for creating an invoice from an offer."""
    offer = await _load_offer(db, offer_id, current_user.require_tenant_id())
    customer: Customer = offer.customer

    placements = await _load_placement_details(db, offer_id, current_user.require_tenant_id())

    # Get primary contact email from customer.contact_persons or customer.email
    contact_email = read_pii(customer, "email")
    if customer.contact_persons:
        for cp in customer.contact_persons:
            if isinstance(cp, dict) and cp.get("email"):
                contact_email = cp["email"]
                break

    # Default VAT rate from tenant settings (customer's country or tenant's country)
    tenant = await db.get(Tenant, current_user.require_tenant_id())
    finance = ((tenant.settings or {}) if tenant else {}).get("training_finance", {})
    vat_rates: dict = finance.get("vat_rates", {})
    company_info = finance.get("company_info", {})
    tenant_country = (company_info.get("country", "") or "").upper()

    # Use customer country rate, fall back to tenant country rate
    customer_country = (customer.country or "").upper()
    default_vat_rate = float(vat_rates.get(customer_country, 0)) or float(vat_rates.get(tenant_country, 0))

    # Default dates
    from datetime import timedelta

    today = date.today()
    default_issue_date = today.isoformat()
    default_due_date = (today + timedelta(days=30)).isoformat()

    # Offer quoted total (training_price + certification_price from offer)
    offer_total = float(offer.training_price or 0) + float(offer.certification_price or 0)

    # Already invoiced amount — net/subtotal (excl. VAT) since offer prices are always net
    inv_result = await db.execute(
        select(func.coalesce(func.sum(TrainingInvoice.subtotal), 0)).where(
            TrainingInvoice.offer_id == offer_id,
            TrainingInvoice.tenant_id == current_user.require_tenant_id(),
            TrainingInvoice.status != "cancelled",
            TrainingInvoice.template_type != "credit_note",
        )
    )
    already_invoiced = float(inv_result.scalar() or 0)

    return {
        "offer_number": offer.offer_number,
        "customer_name": customer.name,
        "recipient_name": customer.name,
        "recipient_email": contact_email,
        "recipient_address_line1": customer.address_line1,
        "recipient_city": customer.city,
        "recipient_postal_code": customer.postal_code,
        "recipient_country": customer.country,
        "recipient_vat_number": read_pii(customer, "vat_number"),
        "currency": offer.currency,
        "po_number": offer.po_number,
        "suggested_training_price": float(offer.training_price) if offer.training_price else 0,
        "suggested_certification_price": float(offer.certification_price) if offer.certification_price else 0,
        "default_vat_rate": default_vat_rate,
        "default_issue_date": default_issue_date,
        "default_due_date": default_due_date,
        "offer_total": offer_total,
        "already_invoiced": already_invoiced,
        "placements": placements,
    }


@router.post("/invoice")
async def create_offer_invoice(
    offer_id: UUID,
    data: CreateOfferInvoiceRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Create a training invoice from an accepted offer."""
    offer = await _load_offer(db, offer_id, current_user.require_tenant_id())

    if offer.status != "accepted":
        raise HTTPException(status_code=422, detail="Only accepted offers can be invoiced.")

    if data.status not in ("draft", "sent"):
        raise HTTPException(status_code=422, detail="Status must be draft or sent.")

    customer: Customer = offer.customer
    placements = await _load_placement_details(db, offer_id, current_user.require_tenant_id())
    placement_map = {p["id"]: p for p in placements}

    # Build line items + notes from selected placements
    line_items: list[dict] = []
    notes_lines: list[str] = []
    subtotal = Decimal("0.00")

    included = [p for p in data.placements if p.include]
    if not included:
        raise HTTPException(status_code=422, detail="At least one training must be selected.")

    for item in included:
        pdata = placement_map.get(item.placement_id)
        if not pdata:
            continue

        training_name = pdata["training_name"]
        formatted_date = _format_date(pdata["start_date"])
        att_count = pdata["attendee_count"]
        cert_count = pdata["certification_count"]

        # Training line item
        if att_count > 0 and item.training_price > 0:
            training_total = Decimal(str(item.training_price)) * att_count
            line_items.append(
                {
                    "description": f"{training_name} — {formatted_date} ({att_count} attendee{'s' if att_count != 1 else ''})",
                    "quantity": att_count,
                    "unit_price": f"{item.training_price:.2f}",
                    "total": f"{training_total:.2f}",
                }
            )
            subtotal += training_total

        # Certification line item
        if cert_count > 0 and item.certification_price > 0:
            cert_total = Decimal(str(item.certification_price)) * cert_count
            line_items.append(
                {
                    "description": f"Certification Exam — {training_name} ({cert_count} attendee{'s' if cert_count != 1 else ''})",
                    "quantity": cert_count,
                    "unit_price": f"{item.certification_price:.2f}",
                    "total": f"{cert_total:.2f}",
                }
            )
            subtotal += cert_total

        # Attendee notes for this placement
        notes_lines.append(f"\n{training_name} — {formatted_date}:")
        for att in pdata["attendees"]:
            name = f"{att['first_name']} {att['last_name']}"
            email = att.get("email") or ""
            exam_info = ""
            if att.get("certification") and att.get("exam_mode"):
                exam_info = f" | Exam: {att['exam_mode']}"
                if att.get("exam_language"):
                    exam_info += f" ({att['exam_language']})"
                if att.get("extra_time"):
                    exam_info += " +extra time"
            notes_lines.append(f"  - {name} ({email}){exam_info}")

    # Calculate tax
    tax_rate = Decimal(str(data.tax_rate)) if data.tax_rate is not None else Decimal("0.00")
    tax_amount = subtotal * tax_rate / 100
    total = subtotal + tax_amount

    # Build notes
    all_notes = f"Invoice for offer {offer.offer_number}"
    if data.notes:
        all_notes += f"\n{data.notes}"
    all_notes += "\n\nAttendees:" + "".join(notes_lines)

    # Invoice number
    invoice_number = None
    if data.status == "sent":
        invoice_number = await generate_training_invoice_number(db, current_user.require_tenant_id())

    issue_date = (
        date.fromisoformat(data.issue_date) if data.issue_date else (date.today() if data.status == "sent" else None)
    )
    due_date = date.fromisoformat(data.due_date) if data.due_date else None

    # Get contact email
    contact_email = read_pii(customer, "email")
    if customer.contact_persons:
        for cp in customer.contact_persons:
            if isinstance(cp, dict) and cp.get("email"):
                contact_email = cp["email"]
                break

    inv = TrainingInvoice(
        tenant_id=current_user.require_tenant_id(),
        offer_id=offer.id,
        training_registration_id=None,
        invoice_number=invoice_number,
        template_type=data.template_type,
        status=data.status,
        issue_date=issue_date,
        due_date=due_date,
        recipient_name=customer.name,
        recipient_email=contact_email,
        recipient_address_line1=customer.address_line1,
        recipient_city=customer.city,
        recipient_postal_code=customer.postal_code,
        recipient_country=customer.country,
        recipient_vat_number=read_pii(customer, "vat_number"),
        payment_method=data.template_type.replace("_", " "),
        po_number=offer.po_number,
        line_items=line_items,
        subtotal=subtotal,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=total,
        currency=offer.currency,
        notes=all_notes,
        language="en",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)

    # Send email + create Stripe link if sent and credit_card
    if inv.status == "sent":
        tenant = await db.get(Tenant, current_user.require_tenant_id())
        payment_link_url: str | None = None

        if inv.template_type == "credit_card" and tenant:
            try:
                link_id, payment_link_url = await create_training_payment_link(db, tenant, inv)
                inv.stripe_payment_link_id = link_id
                inv.stripe_payment_link_url = payment_link_url
                await db.commit()
                await db.refresh(inv)
            except Exception as exc:
                logger.warning("Failed to create Stripe payment link for offer invoice %s: %s", inv.id, exc)

        if inv.recipient_email and tenant:
            try:
                await send_training_invoice_email(db, inv, None, tenant, payment_link_url=payment_link_url)
            except Exception as exc:
                logger.warning("Failed to send offer invoice email %s: %s", inv.id, exc)

    return {"invoice": invoice_to_dict(inv)}
