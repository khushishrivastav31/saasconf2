"""Training attendees — full profile endpoint (registrations + offers + portal account)."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import read_pii
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


@router.get("/{attendee_id}/profile")
async def get_attendee_profile(
    attendee_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get full attendee profile with all registrations, offers, and portal account info."""
    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(TrainingAttendee)
        .options(selectinload(TrainingAttendee.history))
        .where(TrainingAttendee.id == attendee_id, TrainingAttendee.tenant_id == tenant_id)
    )
    att = result.scalars().unique().first()
    if not att:
        raise NotFoundError("Attendee not found")

    portal_info = None
    if att.portal_user_id:
        pu = await db.get(PortalUser, att.portal_user_id)
        if pu:
            portal_info = {
                "id": str(pu.id),
                "email": read_pii(pu, "email"),
                "is_active": pu.is_active,
                "has_password": pu.password_hash is not None,
                "email_verified": pu.email_verified_at is not None,
                "last_login_at": pu.last_login_at.isoformat() if pu.last_login_at else None,
                "created_at": pu.created_at.isoformat() if pu.created_at else None,
            }

    ra_result = await db.execute(
        select(TrainingRegistrationAttendee).where(TrainingRegistrationAttendee.attendee_id == att.id)
    )
    reg_att_links = ra_result.scalars().all()
    reg_ids = list({ra.registration_id for ra in reg_att_links})

    registrations = []
    if reg_ids:
        reg_result = await db.execute(
            select(TrainingRegistration)
            .where(TrainingRegistration.id.in_(reg_ids))
            .order_by(TrainingRegistration.created_at.desc())
        )
        regs = reg_result.scalars().unique().all()

        placement_ids_p = {r.placement_id for r in regs if r.placement_id}
        placement_map: dict[UUID, dict] = {}
        if placement_ids_p:
            pl_result = await db.execute(
                select(ProgramYearTraining)
                .options(
                    joinedload(ProgramYearTraining.training),
                    joinedload(ProgramYearTraining.location),
                )
                .where(ProgramYearTraining.id.in_(placement_ids_p))
            )
            for p in pl_result.scalars().unique().all():
                placement_map[p.id] = {
                    "training_name": p.training.name if p.training else "Unknown",
                    "start_date": p.start_date.isoformat() if p.start_date else None,
                    "location_name": p.location.name if p.location else None,
                    "location_city": p.location.city if p.location else None,
                    "location_country": p.location.country if p.location else None,
                }

        for reg in regs:
            pi = placement_map.get(reg.placement_id, {}) if reg.placement_id else {}
            ra = next((r for r in reg_att_links if r.registration_id == reg.id), None)

            registrations.append(
                {
                    "registration_id": str(reg.id),
                    "status": reg.status,
                    "training_name": pi.get("training_name", "Unknown"),
                    "training_date": pi.get("start_date"),
                    "location_name": pi.get("location_name"),
                    "location_city": pi.get("location_city"),
                    "location_country": pi.get("location_country"),
                    "contact_first_name": reg.contact_first_name,
                    "contact_last_name": reg.contact_last_name,
                    "contact_email": reg.contact_email,
                    "contact_phone": reg.contact_phone,
                    "company_name": reg.company_name,
                    "street": reg.street,
                    "postal_code": reg.postal_code,
                    "city": reg.city,
                    "country": reg.country,
                    "vat_number": reg.vat_number,
                    "payment_method": reg.payment_method,
                    "po_number": reg.po_number,
                    "discount_code": reg.discount_code,
                    "subtotal": str(reg.subtotal) if reg.subtotal else None,
                    "vat_amount": str(reg.vat_amount) if reg.vat_amount else None,
                    "total": str(reg.total) if reg.total else None,
                    "currency": reg.currency,
                    "exam_mode": ra.exam_mode if ra else None,
                    "exam_language": ra.exam_language if ra else None,
                    "extra_time": ra.extra_time if ra else False,
                    "notes": reg.notes,
                    "created_at": reg.created_at.isoformat() if reg.created_at else None,
                }
            )

    offer_links = []
    oa_result = await db.execute(
        select(OfferAttendee).where(OfferAttendee.attendee_id == att.id, OfferAttendee.tenant_id == tenant_id)
    )
    for oa in oa_result.scalars().all():
        offer_result = await db.execute(
            select(CustomerOffer.offer_number, CustomerOffer.customer_id).where(CustomerOffer.id == oa.offer_id)
        )
        offer_row = offer_result.first()
        offer_number = offer_row[0] if offer_row else "—"

        training_name = "—"
        if oa.placement_id:
            tn_result = await db.execute(
                select(Training.name)
                .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
                .where(ProgramYearTraining.id == oa.placement_id)
            )
            tn = tn_result.scalar_one_or_none()
            if tn:
                training_name = tn

        offer_links.append(
            {
                "offer_number": offer_number,
                "training_name": training_name,
                "exam_mode": oa.exam_mode,
                "exam_language": oa.exam_language,
                "extra_time": oa.extra_time,
                "certification": oa.certification,
                "comments": oa.comments,
            }
        )

    history_placement_ids = {h.placement_id for h in att.history if h.placement_id}
    training_names: dict[UUID, str] = {}
    if history_placement_ids:
        tn_result = await db.execute(
            select(ProgramYearTraining.id, Training.name, ProgramYearTraining.start_date)
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(history_placement_ids))
        )
        for pid, tname, sdate in tn_result.all():
            date_str = sdate.strftime("%d.%m.%Y") if sdate else ""
            training_names[pid] = f"{tname} ({date_str})" if date_str else tname

    effective_status = att.status
    if att.status == "parked" and portal_info is not None and portal_info["is_active"] is False:
        effective_status = "inactive"

    return {
        "id": str(att.id),
        "first_name": att.first_name,
        "last_name": att.last_name,
        "email": att.email,
        "status": effective_status,
        "notes": att.notes,
        "portal_user_id": str(att.portal_user_id) if att.portal_user_id else None,
        "portal_account": portal_info,
        "registrations": registrations,
        "offer_links": offer_links,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "history": [
            {
                "id": str(h.id),
                "event_type": h.event_type,
                "placement_id": str(h.placement_id) if h.placement_id else None,
                "training_name": training_names.get(h.placement_id, "—") if h.placement_id else "—",
                "source_type": h.source_type,
                "notes": h.notes,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in att.history
        ],
    }
