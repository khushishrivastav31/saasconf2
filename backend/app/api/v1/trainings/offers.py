"""Customer offer endpoints for training proposals."""

import logging
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, literal, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.core.html_sanitize import sanitize_html
from app.core.search import unaccent_ilike
from app.models.audit import AuditLog
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.offer_placement import OfferPlacement
from app.models.training_program import ProgramYearTraining
from app.schemas.customer_offer import (
    AddPlacementsRequest,
    CustomerOfferCreate,
    CustomerOfferResponse,
    CustomerOfferUpdate,
    OfferPlacementInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/offers", tags=["training-offers"])


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return CustomerOffer.tenant_id == current_user.require_tenant_id()


def _offer_to_response(
    offer: CustomerOffer, placements: list[ProgramYearTraining], attendee_count: int = 0
) -> CustomerOfferResponse:
    """Build a CustomerOfferResponse from an offer and its placements."""
    placement_infos = []
    for p in placements:
        placement_infos.append(
            OfferPlacementInfo(
                id=p.id,
                training_name=p.training.name if p.training else "Unknown",
                training_slug=p.training.slug if p.training else None,
                start_date=p.start_date,
                location_name=p.location.name if p.location else None,
                placement_type=p.placement_type or "open",
                program_year=p.program_year.year if p.program_year else 0,
            )
        )
    return CustomerOfferResponse(
        id=offer.id,
        tenant_id=offer.tenant_id,
        customer_id=offer.customer_id,
        customer_name=offer.customer.name if offer.customer else "Unknown",
        offer_number=offer.offer_number,
        offer_type=offer.offer_type or "inhouse",
        status=offer.status,
        attendees=offer.attendees,
        training_price=offer.training_price,
        certification_price=offer.certification_price,
        currency=offer.currency,
        comments=offer.comments,
        notes=offer.notes,
        po_number=offer.po_number,
        placements=placement_infos,
        attendee_count=attendee_count,
        created_at=offer.created_at,
        updated_at=offer.updated_at,
    )


async def _count_offer_attendees(db: DbSessionDep, offer_id: UUID) -> int:
    """Count attendees for an offer."""
    result = await db.execute(select(func.count()).where(OfferAttendee.offer_id == offer_id))
    return result.scalar() or 0


async def _load_offer_placements(db: DbSessionDep, offer_id: UUID, tenant_id: UUID) -> list[ProgramYearTraining]:
    """Load placements linked to an offer via the offer_placements join table."""
    result = await db.execute(
        select(ProgramYearTraining)
        .join(OfferPlacement, OfferPlacement.placement_id == ProgramYearTraining.id)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            joinedload(ProgramYearTraining.program_year),
        )
        .where(
            OfferPlacement.offer_id == offer_id,
            OfferPlacement.tenant_id == tenant_id,
        )
        .order_by(ProgramYearTraining.start_date)
    )
    return list(result.scalars().unique().all())


async def _generate_offer_number(db: DbSessionDep, tenant_id: UUID) -> str:
    """Generate the next sequential offer number for a tenant."""
    result = await db.execute(select(func.count()).where(CustomerOffer.tenant_id == tenant_id))
    count = result.scalar() or 0
    return f"OFF-{count + 1:04d}"


async def _validate_placements_for_offer(
    db: DbSessionDep, placement_ids: list[UUID], tenant_id: UUID
) -> list[ProgramYearTraining]:
    """Validate placements for assignment to an offer.

    - inhouse/hybrid: must not already have offer_id set (exclusive assignment)
    - open: always allowed (shared across multiple offers)
    """
    if not placement_ids:
        return []

    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            joinedload(ProgramYearTraining.program_year),
        )
        .where(
            ProgramYearTraining.id.in_(placement_ids),
            ProgramYearTraining.tenant_id == tenant_id,
        )
    )
    placements = list(result.scalars().unique().all())

    if len(placements) != len(placement_ids):
        raise ValidationError("One or more placements not found")

    for p in placements:
        # Inhouse placements are always exclusive (one customer)
        if p.placement_type == "inhouse":
            if p.offer_id is not None:
                raise ValidationError(f"Placement {p.id} is already assigned to offer {p.offer_id}")
        # Open and hybrid placements are shared (multiple customers can book)

    return placements


@router.get("/available-placements", response_model=list[OfferPlacementInfo])
async def list_available_placements(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    type: str | None = Query(None, pattern=r"^(inhouse|open)$"),
) -> list[OfferPlacementInfo]:
    """List available placements for offer assignment.

    - type=inhouse: inhouse/hybrid placements not yet assigned (exclusive)
    - type=open: all open placements (shared across offers)
    - no type: all available placements (backward compat)
    """
    query = (
        select(ProgramYearTraining)
        .options(
            joinedload(ProgramYearTraining.training),
            joinedload(ProgramYearTraining.location),
            joinedload(ProgramYearTraining.program_year),
        )
        .where(
            ProgramYearTraining.tenant_id == current_user.require_tenant_id(),
            ProgramYearTraining.is_active.is_(True),
        )
    )

    if type == "inhouse":
        # Inhouse offers: only inhouse placements (exclusive, must be unassigned)
        query = query.where(
            ProgramYearTraining.placement_type == "inhouse",
            ProgramYearTraining.offer_id.is_(None),
        )
    elif type == "open":
        # Open offers: open + hybrid placements (shared, no exclusive check)
        query = query.where(ProgramYearTraining.placement_type.in_(["open", "hybrid"]))
    else:
        # All: inhouse unassigned + open/hybrid shared
        query = query.where(
            (ProgramYearTraining.placement_type.in_(["inhouse"]) & ProgramYearTraining.offer_id.is_(None))
            | (ProgramYearTraining.placement_type.in_(["open", "hybrid"]))
        )

    result = await db.execute(query.order_by(ProgramYearTraining.start_date))
    placements = list(result.scalars().unique().all())
    return [
        OfferPlacementInfo(
            id=p.id,
            training_name=p.training.name if p.training else "Unknown",
            training_slug=p.training.slug if p.training else None,
            start_date=p.start_date,
            location_name=p.location.name if p.location else None,
            placement_type=p.placement_type or "open",
            program_year=p.program_year.year if p.program_year else 0,
        )
        for p in placements
    ]


@router.get("", response_model=dict)
async def list_offers(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    customer_id: UUID | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    """List customer offers with optional filtering and pagination."""
    base = select(CustomerOffer).options(joinedload(CustomerOffer.customer)).where(_tenant_filter(current_user))

    if customer_id:
        base = base.where(CustomerOffer.customer_id == customer_id)
    if search:
        base = base.join(Customer, CustomerOffer.customer_id == Customer.id).where(
            unaccent_ilike(CustomerOffer.offer_number, search) | unaccent_ilike(Customer.name, search)
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    items_q = base.order_by(CustomerOffer.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(items_q)
    offers = list(result.scalars().unique().all())

    # Batch-load placements and attendee counts to avoid N+1 queries
    offer_ids = [o.id for o in offers]
    placements_by_offer: dict[UUID, list[ProgramYearTraining]] = {oid: [] for oid in offer_ids}
    attendee_counts: dict[UUID, int] = {oid: 0 for oid in offer_ids}

    if offer_ids:
        # Batch placements
        pl_result = await db.execute(
            select(OfferPlacement.offer_id, ProgramYearTraining)
            .join(ProgramYearTraining, OfferPlacement.placement_id == ProgramYearTraining.id)
            .options(
                joinedload(ProgramYearTraining.training),
                joinedload(ProgramYearTraining.location),
                joinedload(ProgramYearTraining.program_year),
            )
            .where(OfferPlacement.offer_id.in_(offer_ids))
            .order_by(ProgramYearTraining.start_date)
        )
        for oid, p in pl_result.unique().all():
            placements_by_offer[oid].append(p)

        # Batch attendee counts
        ac_result = await db.execute(
            select(OfferAttendee.offer_id, func.count())
            .where(OfferAttendee.offer_id.in_(offer_ids))
            .group_by(OfferAttendee.offer_id)
        )
        for oid, cnt in ac_result.all():
            attendee_counts[oid] = cnt

    items = [
        _offer_to_response(offer, placements_by_offer.get(offer.id, []), attendee_counts.get(offer.id, 0))
        for offer in offers
    ]

    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("/{offer_id}", response_model=CustomerOfferResponse)
async def get_offer(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> CustomerOfferResponse:
    """Get a single customer offer with placement details."""
    result = await db.execute(
        select(CustomerOffer)
        .options(joinedload(CustomerOffer.customer))
        .where(CustomerOffer.id == offer_id, _tenant_filter(current_user))
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise NotFoundError("Offer not found")

    placements = await _load_offer_placements(db, offer.id, offer.tenant_id)
    ac = await _count_offer_attendees(db, offer.id)
    return _offer_to_response(offer, placements, ac)


@router.post("", response_model=CustomerOfferResponse, status_code=201)
async def create_offer(
    payload: CustomerOfferCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomerOfferResponse:
    """Create a new customer offer and link placements."""
    tenant_id = current_user.require_tenant_id()

    # Verify customer exists
    cust_result = await db.execute(
        select(Customer).where(Customer.id == payload.customer_id, Customer.tenant_id == tenant_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        raise NotFoundError("Customer not found")

    # Validate placements
    placements = await _validate_placements_for_offer(db, payload.placement_ids, tenant_id)

    # Generate offer number
    offer_number = await _generate_offer_number(db, tenant_id)

    # Sanitize comments
    comments = sanitize_html(payload.comments) if payload.comments else payload.comments

    offer = CustomerOffer(
        tenant_id=tenant_id,
        customer_id=payload.customer_id,
        offer_number=offer_number,
        offer_type=payload.offer_type,
        attendees=payload.attendees,
        training_price=payload.training_price,
        certification_price=payload.certification_price,
        currency=payload.currency,
        comments=comments,
        notes=payload.notes,
        po_number=payload.po_number,
    )
    db.add(offer)
    await db.flush()

    # Link placements to offer via join table + direct FK for inhouse/hybrid
    for p in placements:
        # Always insert into join table
        db.add(
            OfferPlacement(
                tenant_id=tenant_id,
                offer_id=offer.id,
                placement_id=p.id,
            )
        )
        # For inhouse/hybrid: also set direct FK (for calendar display)
        if p.placement_type == "inhouse":
            p.offer_id = offer.id
            p.customer_id = payload.customer_id
        # For open: do NOT set offer_id/customer_id on the placement

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="customer_offer.create",
        resource_type="customer_offer",
        resource_id=offer.id,
        details={
            "offer_number": offer_number,
            "customer_id": str(payload.customer_id),
            "placement_count": len(placements),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    # Reload offer with relationships
    result = await db.execute(
        select(CustomerOffer).options(joinedload(CustomerOffer.customer)).where(CustomerOffer.id == offer.id)
    )
    offer = result.scalar_one()
    loaded_placements = await _load_offer_placements(db, offer.id, tenant_id)
    ac = await _count_offer_attendees(db, offer.id)
    return _offer_to_response(offer, loaded_placements, ac)


@router.put("/{offer_id}", response_model=CustomerOfferResponse)
async def update_offer(
    offer_id: UUID,
    payload: CustomerOfferUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomerOfferResponse:
    """Update offer metadata (status, pricing, comments, notes)."""
    result = await db.execute(
        select(CustomerOffer)
        .options(joinedload(CustomerOffer.customer))
        .where(CustomerOffer.id == offer_id, _tenant_filter(current_user))
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise NotFoundError("Offer not found")

    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("comments"):
        update_data["comments"] = sanitize_html(update_data["comments"])

    for field, value in update_data.items():
        setattr(offer, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="customer_offer.update",
        resource_type="customer_offer",
        resource_id=offer.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(offer)

    placements = await _load_offer_placements(db, offer.id, offer.tenant_id)
    ac = await _count_offer_attendees(db, offer.id)
    return _offer_to_response(offer, placements, ac)


@router.post("/{offer_id}/placements", response_model=CustomerOfferResponse)
async def add_placements(
    offer_id: UUID,
    payload: AddPlacementsRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomerOfferResponse:
    """Add more placements to an existing offer."""
    result = await db.execute(
        select(CustomerOffer)
        .options(joinedload(CustomerOffer.customer))
        .where(CustomerOffer.id == offer_id, _tenant_filter(current_user))
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise NotFoundError("Offer not found")

    placements = await _validate_placements_for_offer(db, payload.placement_ids, offer.tenant_id)

    for p in placements:
        # Always insert into join table
        db.add(
            OfferPlacement(
                tenant_id=offer.tenant_id,
                offer_id=offer.id,
                placement_id=p.id,
            )
        )
        # For inhouse/hybrid: also set direct FK
        if p.placement_type == "inhouse":
            p.offer_id = offer.id
            p.customer_id = offer.customer_id

    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="customer_offer.add_placements",
        resource_type="customer_offer",
        resource_id=offer.id,
        details={"placement_ids": [str(pid) for pid in payload.placement_ids]},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    loaded_placements = await _load_offer_placements(db, offer.id, offer.tenant_id)
    ac = await _count_offer_attendees(db, offer.id)
    return _offer_to_response(offer, loaded_placements, ac)


@router.delete("/{offer_id}/placements/{placement_id}")
async def remove_placement(
    offer_id: UUID,
    placement_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
    delete_from_program: bool = Query(False),
) -> dict:
    """Unlink a placement from an offer. Optionally delete it from the program entirely."""
    # Verify offer
    offer_result = await db.execute(
        select(CustomerOffer).where(CustomerOffer.id == offer_id, _tenant_filter(current_user))
    )
    if not offer_result.scalar_one_or_none():
        raise NotFoundError("Offer not found")

    # Find the join table entry
    op_result = await db.execute(
        select(OfferPlacement).where(
            OfferPlacement.offer_id == offer_id,
            OfferPlacement.placement_id == placement_id,
            OfferPlacement.tenant_id == current_user.require_tenant_id(),
        )
    )
    offer_placement = op_result.scalar_one_or_none()
    if not offer_placement:
        raise NotFoundError("Placement not found on this offer")

    # Delete the join table entry
    await db.delete(offer_placement)

    # Load the actual placement for FK clearing / program deletion
    placement_result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.tenant_id == current_user.require_tenant_id(),
        )
    )
    placement = placement_result.scalar_one_or_none()

    if placement and delete_from_program:
        await db.delete(placement)
        action = "customer_offer.remove_placement_and_delete"
    else:
        # For inhouse/hybrid: clear direct FK
        if placement and placement.placement_type == "inhouse":
            placement.offer_id = None
            placement.customer_id = None
        action = "customer_offer.remove_placement"

    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action=action,
        resource_type="customer_offer",
        resource_id=offer_id,
        details={"placement_id": str(placement_id), "delete_from_program": delete_from_program},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Placement removed"}


@router.delete("/{offer_id}")
async def delete_offer(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an offer and unlink all its placements."""
    result = await db.execute(select(CustomerOffer).where(CustomerOffer.id == offer_id, _tenant_filter(current_user)))
    offer = result.scalar_one_or_none()
    if not offer:
        raise NotFoundError("Offer not found")

    # Block deletion if invoices exist (financial records must not be orphaned)
    from app.models.training_invoice import TrainingInvoice

    inv_count = await db.execute(select(func.count()).where(TrainingInvoice.offer_id == offer_id))
    if (inv_count.scalar() or 0) > 0:
        raise ValidationError("Cannot delete offer with linked invoices. Cancel or delete the invoices first.")

    # Unlink inhouse/hybrid placements (clear direct FK); join table entries cascade-delete
    placements_result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.offer_id == offer_id,
            ProgramYearTraining.tenant_id == current_user.require_tenant_id(),
        )
    )
    for p in placements_result.scalars().all():
        p.offer_id = None
        p.customer_id = None

    offer_number = offer.offer_number
    await db.delete(offer)

    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="customer_offer.delete",
        resource_type="customer_offer",
        resource_id=offer_id,
        details={"offer_number": offer_number},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Offer deleted"}
