"""One-shot backfill — emit ``customer_events`` rows for existing CFP papers + conference registrations.

The unified customer timeline only populates forward from the commit that
wired the CFP + Registration writers (``cfp/shared.py::_record_paper_customer_event``
and ``registrations/core.py``). Existing papers and registrations that
pre-date that commit are invisible to the ``/portal-users/:id/history``
timeline until this script runs.

What it emits:

* For every :class:`CFPPaper` (tenant-wide, all statuses except pure-draft-
  never-submitted): one ``cfp.submitted`` row per speaker (main + every
  cospeaker, deduped by applicant.id, skipping applicants with no
  ``email_hash``) dated at ``submitted_at`` (fallback ``created_at``).
  If ``status == accepted``: additionally a ``cfp.accepted`` row dated at
  ``updated_at``. If ``status == rejected``: a ``cfp.rejected`` row.
* For every :class:`Registration` with an ``email_hash``: one
  ``registration.registered`` row dated at ``created_at``, with
  ``conference_name`` + ``booking_option_name`` + ``company_name`` meta.
  If ``status == cancelled``: additionally a ``registration.cancelled``
  row dated at ``updated_at``.

Idempotent: inspects existing ``customer_events`` keyed on
``(subject_email_hash, event_type, related_entity_id)`` and skips rows
that are already there. Safe to re-run.

Usage:

    cd backend && venv/bin/python -m scripts.backfill_conference_customer_events
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import joinedload, selectinload

from app.config import get_settings
from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.conference import Conference
from app.models.customer_event import (
    ACTOR_SYSTEM,
    DOMAIN_CFP,
    DOMAIN_REGISTRATION,
    CustomerEvent,
    CustomerEventType,
)
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

Stats = dict[str, int]


async def _existing_keys(db: AsyncSession, tenant_id: UUID, domain: str) -> set[tuple[str, str, UUID]]:
    """Return the set of already-recorded ``(subject_email_hash, event_type, related_entity_id)`` for a tenant+domain."""
    result = await db.execute(
        select(CustomerEvent.subject_email_hash, CustomerEvent.event_type, CustomerEvent.related_entity_id).where(
            CustomerEvent.tenant_id == tenant_id,
            CustomerEvent.domain == domain,
            CustomerEvent.related_entity_id.isnot(None),
        )
    )
    return {(row[0], row[1], row[2]) for row in result.all()}


def _paper_events(paper: CFPPaper) -> list[tuple[CustomerEventType, datetime]]:
    """Which (event_type, timestamp) pairs to emit for this paper's status."""
    submitted_at = paper.submitted_at or paper.created_at
    out: list[tuple[CustomerEventType, datetime]] = []
    # Any status other than pure-draft-never-submitted implies a submit happened at some point.
    submitted = paper.status != PaperStatus.DRAFT.value or paper.submitted_at is not None
    if submitted:
        out.append((CustomerEventType.CFP_SUBMITTED, submitted_at))
    if paper.status == PaperStatus.ACCEPTED.value:
        out.append((CustomerEventType.CFP_ACCEPTED, paper.updated_at or submitted_at))
    if paper.status == PaperStatus.REJECTED.value:
        out.append((CustomerEventType.CFP_REJECTED, paper.updated_at or submitted_at))
    return out


async def _backfill_cfp_papers(db: AsyncSession, tenant_id: UUID) -> Stats:
    existing = await _existing_keys(db, tenant_id, DOMAIN_CFP)
    stats: Stats = {"papers_scanned": 0, "events_inserted": 0, "events_skipped": 0}

    papers_result = await db.execute(
        select(CFPPaper)
        .where(CFPPaper.tenant_id == tenant_id)
        .options(
            joinedload(CFPPaper.main_speaker),
            selectinload(CFPPaper.cospeaker_associations).joinedload(CFPPaperCospeaker.applicant),
        )
    )
    papers = papers_result.unique().scalars().all()

    # Conference name lookup: cfp_id -> name
    cfp_ids = {p.cfp_id for p in papers}
    conf_map: dict[UUID, str] = {}
    if cfp_ids:
        conf_result = await db.execute(
            select(ConferenceCFP.cfp_id, Conference.name)
            .join(Conference, Conference.id == ConferenceCFP.conference_id)
            .where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        conf_map = {row[0]: row[1] for row in conf_result.all()}

    for paper in papers:
        stats["papers_scanned"] += 1
        events = _paper_events(paper)
        if not events:
            continue

        # Dedupe speakers by applicant.id, drop missing email_hash.
        applicants: list[CFPApplicant] = []
        if paper.main_speaker is not None:
            applicants.append(paper.main_speaker)
        applicants.extend(assoc.applicant for assoc in paper.cospeaker_associations if assoc.applicant is not None)
        seen: set[UUID] = set()
        unique_applicants: list[CFPApplicant] = []
        for a in applicants:
            if a.id in seen or not a.email_hash:
                continue
            seen.add(a.id)
            unique_applicants.append(a)

        meta: dict[str, object] = {"paper_id": str(paper.id), "paper_title": paper.title}
        conference_name = conf_map.get(paper.cfp_id)
        if conference_name:
            meta["conference_name"] = conference_name

        for event_type, ts in events:
            for applicant in unique_applicants:
                email_hash = applicant.email_hash
                assert email_hash is not None  # filtered out above
                key = (email_hash, event_type.value, paper.id)
                if key in existing:
                    stats["events_skipped"] += 1
                    continue
                db.add(
                    CustomerEvent(
                        tenant_id=tenant_id,
                        portal_user_id=applicant.portal_user_id,
                        subject_email_hash=email_hash,
                        domain=DOMAIN_CFP,
                        event_type=event_type.value,
                        actor_kind=ACTOR_SYSTEM,
                        created_by=None,
                        meta=dict(meta),
                        related_entity_type="cfp_paper",
                        related_entity_id=paper.id,
                        created_at=ts,
                    )
                )
                existing.add(key)
                stats["events_inserted"] += 1
    return stats


async def _backfill_registrations(db: AsyncSession, tenant_id: UUID) -> Stats:
    existing = await _existing_keys(db, tenant_id, DOMAIN_REGISTRATION)
    stats: Stats = {"registrations_scanned": 0, "events_inserted": 0, "events_skipped": 0}

    reg_result = await db.execute(
        select(Registration, BillingProfile.company_name, BookingOption.name, Conference.name)
        .join(BillingProfile, Registration.billing_profile_id == BillingProfile.id)
        .join(BookingOption, Registration.booking_option_id == BookingOption.id)
        .join(Conference, Registration.conference_id == Conference.id)
        .where(Registration.tenant_id == tenant_id)
    )
    rows = reg_result.all()

    for reg, company_name, booking_option_name, conference_name in rows:
        stats["registrations_scanned"] += 1
        email_hash = reg.email_hash
        if not email_hash:
            continue

        meta = {
            "registration_id": str(reg.id),
            "conference_name": conference_name,
            "booking_option_name": booking_option_name,
            "company_name": company_name,
        }

        events: list[tuple[CustomerEventType, datetime]] = [
            (CustomerEventType.REGISTRATION_REGISTERED, reg.created_at),
        ]
        if reg.status == RegistrationStatus.CANCELLED.value:
            events.append((CustomerEventType.REGISTRATION_CANCELLED, reg.updated_at or reg.created_at))

        for event_type, ts in events:
            key = (email_hash, event_type.value, reg.id)
            if key in existing:
                stats["events_skipped"] += 1
                continue
            db.add(
                CustomerEvent(
                    tenant_id=tenant_id,
                    portal_user_id=None,
                    subject_email_hash=email_hash,
                    domain=DOMAIN_REGISTRATION,
                    event_type=event_type.value,
                    actor_kind=ACTOR_SYSTEM,
                    created_by=None,
                    meta=dict(meta),
                    related_entity_type="registration",
                    related_entity_id=reg.id,
                    created_at=ts,
                )
            )
            existing.add(key)
            stats["events_inserted"] += 1
    return stats


async def backfill_tenant(db: AsyncSession, tenant_id: UUID) -> dict[str, Stats]:
    """Run both backfills for a single tenant under super-admin context."""
    # SET LOCAL does not accept bound parameters in Postgres — use set_config() instead.
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    await db.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)").bindparams(tid=str(tenant_id)))
    cfp = await _backfill_cfp_papers(db, tenant_id)
    reg = await _backfill_registrations(db, tenant_id)
    return {"cfp": cfp, "registration": reg}


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with Session() as db:
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        tenants = (await db.execute(select(Tenant.id, Tenant.name))).all()

    totals = {"cfp_inserted": 0, "cfp_skipped": 0, "reg_inserted": 0, "reg_skipped": 0}

    for tenant_id, tenant_name in tenants:
        async with Session() as db:
            stats = await backfill_tenant(db, tenant_id)
            await db.commit()
        cfp = stats["cfp"]
        reg = stats["registration"]
        logger.info(
            "tenant=%s papers=%d cfp_inserted=%d cfp_skipped=%d regs=%d reg_inserted=%d reg_skipped=%d",
            tenant_name,
            cfp["papers_scanned"],
            cfp["events_inserted"],
            cfp["events_skipped"],
            reg["registrations_scanned"],
            reg["events_inserted"],
            reg["events_skipped"],
        )
        totals["cfp_inserted"] += cfp["events_inserted"]
        totals["cfp_skipped"] += cfp["events_skipped"]
        totals["reg_inserted"] += reg["events_inserted"]
        totals["reg_skipped"] += reg["events_skipped"]

    logger.info(
        "Backfill complete — cfp_inserted=%d cfp_skipped=%d reg_inserted=%d reg_skipped=%d",
        totals["cfp_inserted"],
        totals["cfp_skipped"],
        totals["reg_inserted"],
        totals["reg_skipped"],
    )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
