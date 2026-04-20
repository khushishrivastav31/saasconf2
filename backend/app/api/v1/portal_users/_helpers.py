"""Shared helpers for the tenant-level portal_users router."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import read_pii
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.customer_event import ACTOR_ADMIN, DOMAIN_PORTAL, CustomerEvent, CustomerEventType
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.registration import Registration
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.services.customer_event_service import CustomerEventService


async def get_portal_user(db: AsyncSession, user_id: UUID, tenant_id: UUID | None) -> PortalUser:
    """Get portal user by ID, ensuring tenant isolation.

    ``tenant_id`` accepts ``None`` so ``CurrentUser.tenant_id`` passes through
    directly; a ``None`` value matches no row and still raises ``NotFoundError``.
    """
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id, PortalUser.tenant_id == tenant_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundError("Portal user not found")
    return user


def portal_user_to_dict(user: PortalUser) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": read_pii(user, "email"),
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": read_pii(user, "phone"),
        "pronouns": user.pronouns,
        "title": user.title,
        "company": user.company,
        "bio": user.bio,
        "social_links": user.social_links or {},
        "address_line_1": user.address_line_1,
        "address_line_2": user.address_line_2,
        "city": user.city,
        "postal_code": user.postal_code,
        "country": user.country,
        "is_active": user.is_active,
        "has_password": user.password_hash is not None,
        "email_verified": user.email_verified_at is not None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


async def has_active_training_assignment(db: AsyncSession, user_id: UUID, tenant_id: UUID) -> bool:
    """True if user is attached to a non-parked attendee on an active training."""
    reg_q = (
        select(func.count(TrainingRegistrationAttendee.id))
        .join(TrainingAttendee, TrainingRegistrationAttendee.attendee_id == TrainingAttendee.id)
        .join(TrainingRegistration, TrainingRegistrationAttendee.registration_id == TrainingRegistration.id)
        .join(ProgramYearTraining, TrainingRegistration.placement_id == ProgramYearTraining.id)
        .where(
            TrainingAttendee.portal_user_id == user_id,
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.status != "parked",
            TrainingRegistration.status != "cancelled",
            ProgramYearTraining.is_active.is_(True),
        )
    )
    if ((await db.execute(reg_q)).scalar() or 0) > 0:
        return True

    offer_q = (
        select(func.count(OfferAttendee.id))
        .join(TrainingAttendee, OfferAttendee.attendee_id == TrainingAttendee.id)
        .join(ProgramYearTraining, OfferAttendee.placement_id == ProgramYearTraining.id)
        .join(CustomerOffer, OfferAttendee.offer_id == CustomerOffer.id)
        .where(
            TrainingAttendee.portal_user_id == user_id,
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.status != "parked",
            CustomerOffer.status == "accepted",
            ProgramYearTraining.is_active.is_(True),
        )
    )
    return ((await db.execute(offer_q)).scalar() or 0) > 0


async def has_active_conference_assignment(db: AsyncSession, user: PortalUser, tenant_id: UUID) -> bool:
    """True if the portal user is attached to an active conference-side record.

    A conference-side commitment is:
    * a CFPPaper (main_speaker) with a non-terminal status (not ``draft`` /
      ``rejected``) authored by a CFPApplicant linked to this portal_user, OR
    * a Registration on an active conference whose ``email_hash`` matches the
      portal user and whose status is not ``cancelled``.
    """
    paper_q = (
        select(func.count(CFPPaper.id))
        .join(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id)
        .where(
            CFPApplicant.portal_user_id == user.id,
            CFPApplicant.tenant_id == tenant_id,
            CFPPaper.status.notin_([PaperStatus.DRAFT.value, PaperStatus.REJECTED.value]),
        )
    )
    if ((await db.execute(paper_q)).scalar() or 0) > 0:
        return True

    if user.email_hash:
        reg_q = (
            select(func.count(Registration.id))
            .join(Conference, Registration.conference_id == Conference.id)
            .where(
                Registration.tenant_id == tenant_id,
                Registration.email_hash == user.email_hash,
                Registration.status != "cancelled",
                Conference.is_active.is_(True),
            )
        )
        if ((await db.execute(reg_q)).scalar() or 0) > 0:
            return True

    return False


async def has_active_assignment(db: AsyncSession, user: PortalUser, tenant_id: UUID) -> tuple[bool, str | None]:
    """Return ``(has_active, reason)`` — reason identifies which side blocks deactivation."""
    if await has_active_training_assignment(db, user.id, tenant_id):
        return True, "training"
    if await has_active_conference_assignment(db, user, tenant_id):
        return True, "conference"
    return False, None


async def write_history(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    portal_user_id: UUID,
    event_type: CustomerEventType,
    created_by: UUID | None,
    notes: str | None = None,
    meta: dict[str, Any] | None = None,
) -> CustomerEvent | None:
    """Record a portal-domain customer_events row for an admin action.

    Thin wrapper around :meth:`CustomerEventService.record` — resolves the
    ``subject_email_hash`` from the portal user (identity-map hit when the
    handler already loaded it via ``get_portal_user``). Phase 6 of the
    unified customer architecture: the legacy ``portal_user_history``
    insert is gone; ``customer_events`` is now the only sink.
    """
    pu = await db.get(PortalUser, portal_user_id)
    if pu is None or not pu.email_hash:
        return None
    return CustomerEventService.record(
        db,
        tenant_id=tenant_id,
        portal_user_id=portal_user_id,
        subject_email_hash=pu.email_hash,
        domain=DOMAIN_PORTAL,
        event_type=event_type,
        actor_kind=ACTOR_ADMIN,
        created_by=created_by,
        notes=notes,
        meta=meta,
    )
