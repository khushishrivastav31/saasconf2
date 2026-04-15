"""Training invoices admin endpoints."""

import logging
from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.api.v1.trainings._invoice_helpers import (
    CANCELLABLE_STATUSES,
    build_credit_note,
    get_training_names,
    invoice_to_dict,
)
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.training_invoice_pdf import generate_training_invoice_pdf
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.offer_placement import OfferPlacement
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_invoice import TrainingInvoice
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["training-invoices"])

# Backward-compatible aliases (used by attendees.py, offer_invoicing.py)
_CANCELLABLE_STATUSES = CANCELLABLE_STATUSES
_invoice_to_dict = invoice_to_dict
_get_training_names = get_training_names
_build_credit_note = build_credit_note


@router.get("")
async def list_training_invoices(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    template_type: str | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List training invoices with filtering and pagination."""
    query = (
        select(TrainingInvoice)
        .where(TrainingInvoice.tenant_id == current_user.tenant_id)
        .options(joinedload(TrainingInvoice.registration))
    )

    if status:
        query = query.where(TrainingInvoice.status == status)
    if template_type:
        query = query.where(TrainingInvoice.template_type == template_type)
    if search:
        query = query.where(
            func.lower(TrainingInvoice.recipient_name).contains(search.lower())
            | func.lower(TrainingInvoice.invoice_number).contains(search.lower())
            | func.lower(TrainingInvoice.recipient_email).contains(search.lower())
        )
    if date_from:
        query = query.where(TrainingInvoice.issue_date >= date.fromisoformat(date_from))
    if date_to:
        query = query.where(TrainingInvoice.issue_date <= date.fromisoformat(date_to))

    count_q = select(func.count()).select_from(query.with_only_columns(TrainingInvoice.id).subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(TrainingInvoice.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    invoices = result.scalars().unique().all()

    reg_ids = {inv.training_registration_id for inv in invoices if inv.training_registration_id}
    training_info = await _get_training_names(db, reg_ids)

    # Fetch offer numbers for offer-linked invoices
    offer_ids = {inv.offer_id for inv in invoices if inv.offer_id}
    offer_numbers: dict[UUID, str] = {}
    if offer_ids:
        on_result = await db.execute(
            select(CustomerOffer.id, CustomerOffer.offer_number).where(CustomerOffer.id.in_(offer_ids))
        )
        offer_numbers = {oid: onum for oid, onum in on_result.all()}

    items = []
    for inv in invoices:
        training_name = "—"
        if inv.training_registration_id:
            training_name = training_info.get(inv.training_registration_id, "—")
        elif inv.offer_id:
            training_name = offer_numbers.get(inv.offer_id, "—")
        d = _invoice_to_dict(inv, training_name)
        items.append(d)

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/by-customer/{customer_id}")
async def list_invoices_by_customer(
    customer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """List training invoices linked to a customer's offers."""
    # Get all offer IDs for this customer
    offer_result = await db.execute(
        select(CustomerOffer.id).where(
            CustomerOffer.customer_id == customer_id,
            CustomerOffer.tenant_id == current_user.tenant_id,
        )
    )
    offer_ids = [oid for (oid,) in offer_result.all()]

    if not offer_ids:
        return {"items": []}

    # Get invoices linked to these offers
    inv_result = await db.execute(
        select(TrainingInvoice)
        .where(
            TrainingInvoice.offer_id.in_(offer_ids),
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
        .order_by(TrainingInvoice.created_at.desc())
    )
    invoices = inv_result.scalars().all()

    # Build offer number map
    on_result = await db.execute(
        select(CustomerOffer.id, CustomerOffer.offer_number).where(CustomerOffer.id.in_(offer_ids))
    )
    offer_numbers = {oid: onum for oid, onum in on_result.all()}

    items = []
    for inv in invoices:
        d = _invoice_to_dict(inv)
        d["offer_number"] = offer_numbers.get(inv.offer_id, "—") if inv.offer_id else "—"
        items.append(d)

    return {"items": items}


@router.get("/pending")
async def get_pending_invoicing(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Return uninvoiced registrations and accepted offers with placements."""
    tenant_id = current_user.tenant_id

    # ── Uninvoiced registrations ──────────────────────────────────────────────
    invoiced_reg_ids = select(TrainingInvoice.training_registration_id).where(
        TrainingInvoice.training_registration_id.is_not(None),
        TrainingInvoice.tenant_id == tenant_id,
    )
    reg_result = await db.execute(
        select(TrainingRegistration)
        .where(
            TrainingRegistration.tenant_id == tenant_id,
            TrainingRegistration.status != "cancelled",
            ~TrainingRegistration.id.in_(invoiced_reg_ids),
        )
        .options(joinedload(TrainingRegistration.attendees))
        .order_by(TrainingRegistration.created_at.desc())
    )
    regs = reg_result.scalars().unique().all()

    # Enrich with training info
    reg_placement_ids = {r.placement_id for r in regs}
    training_info: dict[UUID, dict] = {}
    if reg_placement_ids:
        t_result = await db.execute(
            select(
                ProgramYearTraining.id,
                Training.name,
                ProgramYearTraining.start_date,
            )
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(reg_placement_ids))
        )
        for pid, tname, sdate in t_result.all():
            training_info[pid] = {"name": tname, "start_date": sdate.isoformat() if sdate else None}

    uninvoiced_registrations = []
    for reg in regs:
        pinfo = training_info.get(reg.placement_id, {})
        uninvoiced_registrations.append(
            {
                "id": str(reg.id),
                "placement_id": str(reg.placement_id),
                "training_name": pinfo.get("name", "Unknown"),
                "training_date": pinfo.get("start_date"),
                "contact_first_name": reg.contact_first_name,
                "contact_last_name": reg.contact_last_name,
                "contact_email": reg.contact_email,
                "company_name": reg.company_name,
                "status": reg.status,
                "payment_method": reg.payment_method,
                "total": str(reg.total) if reg.total else None,
                "currency": reg.currency,
                "attendee_count": len(reg.attendees),
                "created_at": reg.created_at.isoformat() if reg.created_at else None,
            }
        )

    # ── Accepted offers with placements ───────────────────────────────────────
    offer_result = await db.execute(
        select(CustomerOffer).where(
            CustomerOffer.tenant_id == tenant_id,
            CustomerOffer.status == "accepted",
        )
    )
    offers = offer_result.scalars().unique().all()
    offer_ids = [o.id for o in offers]

    # Get placement IDs per offer via OfferPlacement join table (works for both open and inhouse)
    offer_placement_map: dict[UUID, list[UUID]] = {oid: [] for oid in offer_ids}
    if offer_ids:
        op_result = await db.execute(
            select(OfferPlacement.offer_id, OfferPlacement.placement_id).where(OfferPlacement.offer_id.in_(offer_ids))
        )
        for oid, pid in op_result.all():
            offer_placement_map[oid].append(pid)

    # Also check direct FK (ProgramYearTraining.offer_id) for placements not in join table
    if offer_ids:
        direct_result = await db.execute(
            select(ProgramYearTraining.offer_id, ProgramYearTraining.id).where(
                ProgramYearTraining.offer_id.in_(offer_ids)
            )
        )
        for oid, pid in direct_result.all():
            if pid not in offer_placement_map[oid]:
                offer_placement_map[oid].append(pid)

    all_placement_ids: set[UUID] = set()
    for pids in offer_placement_map.values():
        all_placement_ids.update(pids)

    # Load placement details
    placement_details: dict[UUID, dict] = {}
    if all_placement_ids:
        pd_result = await db.execute(
            select(
                ProgramYearTraining.id,
                Training.name,
                ProgramYearTraining.start_date,
                ProgramYearTraining.placement_type,
            )
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(all_placement_ids))
        )
        for pid, tname, sdate, ptype in pd_result.all():
            placement_details[pid] = {
                "name": tname,
                "start_date": sdate.isoformat() if sdate else None,
                "placement_type": ptype,
            }
            # Also populate training_info for later use
            training_info[pid] = {"name": tname, "start_date": sdate.isoformat() if sdate else None}

    # Placement → has_attendees, has_registrations, has_invoices, attendee_count
    placement_status: dict[UUID, dict] = {
        pid: {"has_attendees": False, "attendee_count": 0, "has_registrations": False, "has_invoices": False}
        for pid in all_placement_ids
    }
    if all_placement_ids:
        # Offer attendees per placement
        att_q = await db.execute(
            select(OfferAttendee.placement_id, func.count(OfferAttendee.id))
            .where(OfferAttendee.placement_id.in_(all_placement_ids))
            .group_by(OfferAttendee.placement_id)
        )
        for pid, cnt in att_q.all():
            placement_status[pid]["has_attendees"] = True
            placement_status[pid]["attendee_count"] = cnt

        # Registrations + invoices per placement — only for inhouse/hybrid placements
        # (for open placements, registrations may come from the portal and are unrelated to the offer)
        inhouse_pids = {
            pid for pid, pd in placement_details.items() if pd.get("placement_type") in ("inhouse", "hybrid")
        }
        if inhouse_pids:
            reg_q = await db.execute(
                select(TrainingRegistration.placement_id)
                .where(TrainingRegistration.placement_id.in_(inhouse_pids))
                .distinct()
            )
            for (pid,) in reg_q.all():
                placement_status[pid]["has_registrations"] = True

            inv_q = await db.execute(
                select(TrainingRegistration.placement_id)
                .join(TrainingInvoice, TrainingInvoice.training_registration_id == TrainingRegistration.id)
                .where(TrainingRegistration.placement_id.in_(inhouse_pids))
                .distinct()
            )
            for (pid,) in inv_q.all():
                placement_status[pid]["has_invoices"] = True

    # Check which offers already have invoices (non-cancelled) — use subtotal (net, excl. VAT)
    offer_invoice_stats: dict[UUID, dict] = {}
    if offer_ids:
        oi_result = await db.execute(
            select(
                TrainingInvoice.offer_id,
                func.count(TrainingInvoice.id),
                func.coalesce(func.sum(TrainingInvoice.subtotal), 0),
            )
            .where(
                TrainingInvoice.offer_id.in_(offer_ids),
                TrainingInvoice.status != "cancelled",
                TrainingInvoice.template_type != "credit_note",
            )
            .group_by(TrainingInvoice.offer_id)
        )
        for oid, cnt, net_amount in oi_result.all():
            offer_invoice_stats[oid] = {"count": cnt, "total": float(net_amount)}

    accepted_offers = []
    for offer in offers:
        pids = offer_placement_map.get(offer.id, [])
        if not pids:
            continue

        inv_stats = offer_invoice_stats.get(offer.id, {"count": 0, "total": 0})

        # Skip fully invoiced offers (invoiced net >= quoted net)
        offer_net = float(offer.training_price or 0) + float(offer.certification_price or 0)
        if inv_stats["count"] > 0 and inv_stats["total"] >= offer_net - 0.01:
            continue

        placements_data = []
        for pid in pids:
            pd = placement_details.get(pid, {})
            ps = placement_status.get(pid, {})
            placements_data.append(
                {
                    "id": str(pid),
                    "training_name": pd.get("name", "Unknown"),
                    "start_date": pd.get("start_date"),
                    "placement_type": pd.get("placement_type", "unknown"),
                    "has_attendees": ps.get("has_attendees", False),
                    "attendee_count": ps.get("attendee_count", 0),
                    "has_registrations": ps.get("has_registrations", False),
                    "has_invoices": ps.get("has_invoices", False),
                }
            )
        accepted_offers.append(
            {
                "id": str(offer.id),
                "offer_number": offer.offer_number,
                "customer_name": offer.customer.name if offer.customer else "—",
                "status": offer.status,
                "attendees": offer.attendees,
                "training_price": str(offer.training_price) if offer.training_price else None,
                "certification_price": str(offer.certification_price) if offer.certification_price else None,
                "currency": offer.currency,
                "po_number": offer.po_number,
                "created_at": offer.created_at.isoformat() if offer.created_at else None,
                "invoice_count": inv_stats["count"],
                "invoiced_total": str(inv_stats["total"]),
                "placements": placements_data,
            }
        )

    return {
        "uninvoiced_registrations": uninvoiced_registrations,
        "accepted_offers": accepted_offers,
    }


@router.get("/{invoice_id}")
async def get_training_invoice(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get a single training invoice (full details including line items and address)."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    return {
        "id": str(inv.id),
        "training_registration_id": str(inv.training_registration_id) if inv.training_registration_id else None,
        "invoice_number": inv.invoice_number,
        "template_type": inv.template_type,
        "status": inv.status,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "recipient_name": inv.recipient_name,
        "recipient_email": inv.recipient_email,
        "recipient_address_line1": inv.recipient_address_line1,
        "recipient_city": inv.recipient_city,
        "recipient_postal_code": inv.recipient_postal_code,
        "recipient_country": inv.recipient_country,
        "recipient_vat_number": inv.recipient_vat_number,
        "payment_method": inv.payment_method,
        "line_items": inv.line_items,
        "subtotal": str(inv.subtotal) if inv.subtotal else None,
        "tax_rate": str(inv.tax_rate) if inv.tax_rate else None,
        "tax_amount": str(inv.tax_amount) if inv.tax_amount else None,
        "total": str(inv.total) if inv.total else None,
        "currency": inv.currency,
        "notes": inv.notes,
        "language": inv.language,
        "related_invoice_id": str(inv.related_invoice_id) if inv.related_invoice_id else None,
        "offer_id": str(inv.offer_id) if inv.offer_id else None,
        "stripe_payment_link_url": inv.stripe_payment_link_url,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


@router.get("/{invoice_id}/pdf")
async def download_training_invoice_pdf(
    invoice_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> Response:
    """Download training invoice as PDF."""
    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise NotFoundError("Tenant not found")

    pdf_bytes = await generate_training_invoice_pdf(inv, tenant, db)

    filename = f"Invoice-{inv.invoice_number or 'DRAFT'}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class StatusUpdateRequest(BaseModel):
    status: str


@router.patch("/{invoice_id}/status")
async def update_training_invoice_status(
    invoice_id: UUID,
    data: StatusUpdateRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update training invoice status."""
    valid_statuses = {"draft", "sent", "paid", "overdue", "cancelled"}
    if data.status not in valid_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status: {data.status}")

    result = await db.execute(
        select(TrainingInvoice).where(
            TrainingInvoice.id == invoice_id,
            TrainingInvoice.tenant_id == current_user.tenant_id,
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Invoice not found")

    inv.status = data.status
    await db.commit()

    return {"id": str(inv.id), "status": inv.status}
