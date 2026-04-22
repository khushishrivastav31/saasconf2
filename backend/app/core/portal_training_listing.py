"""Build the ``/portal/unified/my-trainings`` payload.

Extracted from ``portal_auth.py`` so that file stays under the 600 LOC
pre-commit ceiling. UNIONs two sources for a portal user:

  * Portal registrations — ``TrainingRegistrationAttendee`` rows
    pointing at one of the user's ``TrainingAttendee`` identities.
  * Offer attendances — ``OfferAttendee`` rows pointing at the same
    identities, filtered to ``CustomerOffer.status == "accepted"``.

Each item carries a stable ``id`` + ``source`` so the frontend can
route detail lookups to the right backend path.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.security.pii_crypto import hash_email, read_pii
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import PlacementTrainer, ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee


async def build_my_trainings_payload(db: AsyncSession, user: PortalUser) -> dict:
    """Return ``{"items": [...]}`` for the given portal user."""
    att_result = await db.execute(select(TrainingAttendee).where(TrainingAttendee.portal_user_id == user.id))
    attendees = att_result.scalars().all()
    attendee_ids = [a.id for a in attendees]

    if not attendee_ids:
        user_email_pt = (read_pii(user, "email") or "").lower()
        att_result2 = await db.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == user.tenant_id,
                TrainingAttendee.email_hash == hash_email(user_email_pt),
            )
        )
        attendees = att_result2.scalars().all()
        attendee_ids = [a.id for a in attendees]

    if not attendee_ids:
        return {"items": []}

    items: list[dict] = []
    placement_ids_seen: set = set()
    trainer_cache: dict = {}

    async def _trainers_for(placement_id) -> list[str]:
        if placement_id in trainer_cache:
            return trainer_cache[placement_id]
        tr_result = await db.execute(
            select(PlacementTrainer)
            .options(joinedload(PlacementTrainer.trainer))
            .where(PlacementTrainer.placement_id == placement_id)
        )
        names: list[str] = []
        for pt in tr_result.scalars().unique().all():
            if pt.trainer:
                names.append(f"{pt.trainer.first_name} {pt.trainer.last_name}")
        trainer_cache[placement_id] = names
        return names

    # Source 1: portal registrations → TrainingRegistrationAttendee links
    ra_result = await db.execute(
        select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.attendee_id.in_(attendee_ids),
        )
    )
    reg_ids = list({ra.registration_id for ra in ra_result.scalars().all()})

    if reg_ids:
        reg_result = await db.execute(
            select(TrainingRegistration)
            .options(
                joinedload(TrainingRegistration.placement).joinedload(ProgramYearTraining.training),
                joinedload(TrainingRegistration.placement).joinedload(ProgramYearTraining.location),
            )
            .where(TrainingRegistration.id.in_(reg_ids))
            .order_by(TrainingRegistration.created_at.desc())
        )
        for reg in reg_result.scalars().unique().all():
            placement = reg.placement
            training = placement.training if placement else None
            location = placement.location if placement else None
            trainer_names = await _trainers_for(placement.id) if placement else []
            if placement:
                placement_ids_seen.add(placement.id)
            items.append(
                {
                    "id": str(reg.id),
                    "source": "registration",
                    "registration_id": str(reg.id),
                    "status": reg.status,
                    "training_name": training.name if training else "Unknown",
                    "training_description": training.description if training else None,
                    "training_duration": training.duration if training else None,
                    "start_date": placement.start_date.isoformat() if placement and placement.start_date else None,
                    "location_name": location.name if location else None,
                    "location_city": location.city if location else None,
                    "location_country": location.country if location else None,
                    "trainers": trainer_names,
                    "exam_mode": None,
                    "exam_language": None,
                    "currency": reg.currency,
                    "total": str(reg.total) if reg.total else None,
                    "payment_method": reg.payment_method,
                    "registered_at": reg.created_at.isoformat() if reg.created_at else None,
                }
            )

    # Source 2: offer attendances on accepted offers
    oa_result = await db.execute(select(OfferAttendee).where(OfferAttendee.attendee_id.in_(attendee_ids)))
    offer_attendees = list(oa_result.scalars().all())

    if offer_attendees:
        offer_ids = list({oa.offer_id for oa in offer_attendees})
        offer_map_result = await db.execute(select(CustomerOffer).where(CustomerOffer.id.in_(offer_ids)))
        offer_map = {o.id: o for o in offer_map_result.scalars().all()}

        placement_ids_needed = {
            oa.placement_id
            for oa in offer_attendees
            if oa.placement_id
            and offer_map.get(oa.offer_id) is not None
            and offer_map[oa.offer_id].status == "accepted"
        }
        placement_map = {}
        if placement_ids_needed:
            placement_result = await db.execute(
                select(ProgramYearTraining)
                .options(
                    joinedload(ProgramYearTraining.training),
                    joinedload(ProgramYearTraining.location),
                )
                .where(ProgramYearTraining.id.in_(placement_ids_needed))
            )
            placement_map = {p.id: p for p in placement_result.scalars().unique().all()}

        for oa in offer_attendees:
            offer = offer_map.get(oa.offer_id)
            if offer is None or offer.status != "accepted":
                continue
            placement = placement_map.get(oa.placement_id) if oa.placement_id else None
            if placement and placement.id in placement_ids_seen:
                # Already surfaced via a portal registration — dedup.
                continue
            training = placement.training if placement else None
            location = placement.location if placement else None
            trainer_names = await _trainers_for(placement.id) if placement else []
            items.append(
                {
                    "id": str(oa.id),
                    "source": "offer",
                    "offer_attendee_id": str(oa.id),
                    "offer_id": str(oa.offer_id),
                    "offer_number": offer.offer_number,
                    "status": offer.status,
                    "training_name": training.name if training else "Unknown",
                    "training_description": training.description if training else None,
                    "training_duration": training.duration if training else None,
                    "start_date": placement.start_date.isoformat() if placement and placement.start_date else None,
                    "location_name": location.name if location else None,
                    "location_city": location.city if location else None,
                    "location_country": location.country if location else None,
                    "trainers": trainer_names,
                    "exam_mode": oa.exam_mode,
                    "exam_language": oa.exam_language,
                    "currency": offer.currency,
                    "total": None,
                    "payment_method": None,
                    "registered_at": oa.created_at.isoformat() if oa.created_at else None,
                }
            )

    # Most recent first; portal registrations use their own created_at,
    # offer rows use the offer attendee's created_at. Falling back to
    # start_date then empty string keeps sort stable.
    def _sort_key(item: dict) -> str:
        return item.get("registered_at") or item.get("start_date") or ""

    items.sort(key=_sort_key, reverse=True)

    return {"items": items}
