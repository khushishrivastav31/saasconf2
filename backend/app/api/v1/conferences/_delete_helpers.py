"""Shared helpers for conference deletion and delete-preview endpoints."""

from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import func, select

from app.core.dependencies import DbSessionDep
from app.models.associations import ConferenceCFP, ConferenceLocation, ConferenceVolunteer
from app.models.cfp import CFPPaper
from app.models.invoice import Invoice
from app.models.sponsor import Sponsor


@dataclass
class ConferenceDeleteData:
    """All data needed for conference deletion or delete-preview.

    Contains both entity IDs (needed by the actual delete) and aggregate
    counts (needed by the preview).
    """

    # Entity IDs linked to this conference
    sponsor_ids: list[str] = field(default_factory=list)
    invoice_ids: list[str] = field(default_factory=list)
    cfp_ids: list[UUID] = field(default_factory=list)
    paper_ids: list[str] = field(default_factory=list)

    # Orphaned applicant IDs (applicants whose papers exist only in this conference's CFPs)
    orphaned_applicant_ids: list[UUID] = field(default_factory=list)

    # IDs of entities exclusively linked to this conference (will be deleted)
    exclusive_vol_ids: list[UUID] = field(default_factory=list)
    exclusive_loc_ids: list[UUID] = field(default_factory=list)
    exclusive_cfp_ids: list[UUID] = field(default_factory=list)

    # Total linked counts (includes shared entities that will only be unlinked)
    total_vols: int = 0
    total_locs: int = 0
    total_cfps: int = 0

    # Direct child counts
    invoice_count: int = 0
    paper_count: int = 0
    sponsor_count: int = 0
    orphaned_applicant_count: int = 0


async def compute_conference_delete_data(
    db: DbSessionDep,
    conference_id: UUID,
) -> ConferenceDeleteData:
    """Compute all data needed for conference deletion (or preview).

    Runs the shared queries that both ``delete_conference`` and
    ``delete_conference_preview`` need: collecting entity IDs, finding
    orphaned applicants, finding exclusively-linked entities, and
    computing aggregate counts.
    """
    data = ConferenceDeleteData()

    # --- Sponsor IDs & count ---
    sponsor_ids_result = await db.execute(select(Sponsor.id).where(Sponsor.conference_id == conference_id))
    sponsor_id_values = sponsor_ids_result.scalars().all()
    data.sponsor_ids = [str(sid) for sid in sponsor_id_values]
    data.sponsor_count = len(data.sponsor_ids)

    # --- Invoice IDs & count ---
    invoice_ids_result = await db.execute(select(Invoice.id).where(Invoice.conference_id == conference_id))
    invoice_id_values = invoice_ids_result.scalars().all()
    data.invoice_ids = [str(iid) for iid in invoice_id_values]
    data.invoice_count = len(data.invoice_ids)

    # --- CFP IDs linked to this conference ---
    cfp_ids_result = await db.execute(select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id == conference_id))
    data.cfp_ids = list(cfp_ids_result.scalars().all())

    # --- Paper IDs for those CFPs ---
    if data.cfp_ids:
        paper_ids_result = await db.execute(select(CFPPaper.id).where(CFPPaper.cfp_id.in_(data.cfp_ids)))
        data.paper_ids = [str(pid) for pid in paper_ids_result.scalars().all()]
    data.paper_count = len(data.paper_ids)

    # --- Orphaned applicants ---
    if data.cfp_ids:
        applicant_ids_in_conf_result = await db.execute(
            select(CFPPaper.main_speaker_id).where(CFPPaper.cfp_id.in_(data.cfp_ids)).distinct()
        )
        applicant_ids_in_conf = list(applicant_ids_in_conf_result.scalars().all())

        if applicant_ids_in_conf:
            applicants_with_other_papers = await db.execute(
                select(CFPPaper.main_speaker_id)
                .where(CFPPaper.main_speaker_id.in_(applicant_ids_in_conf))
                .where(~CFPPaper.cfp_id.in_(data.cfp_ids))
                .distinct()
            )
            applicants_with_other_papers_ids = set(applicants_with_other_papers.scalars().all())
            data.orphaned_applicant_ids = [
                aid for aid in applicant_ids_in_conf if aid not in applicants_with_other_papers_ids
            ]

    data.orphaned_applicant_count = len(data.orphaned_applicant_ids)

    # --- Total linked counts ---
    data.total_vols = (
        await db.execute(select(func.count()).where(ConferenceVolunteer.conference_id == conference_id))
    ).scalar() or 0

    data.total_locs = (
        await db.execute(select(func.count()).where(ConferenceLocation.conference_id == conference_id))
    ).scalar() or 0

    data.total_cfps = (
        await db.execute(select(func.count()).where(ConferenceCFP.conference_id == conference_id))
    ).scalar() or 0

    # --- Exclusively-linked entities ---
    # Volunteers only in this conference
    exclusive_vol_ids_q = (
        select(ConferenceVolunteer.volunteer_id)
        .where(ConferenceVolunteer.conference_id == conference_id)
        .where(
            ~ConferenceVolunteer.volunteer_id.in_(
                select(ConferenceVolunteer.volunteer_id).where(ConferenceVolunteer.conference_id != conference_id)
            )
        )
    )
    data.exclusive_vol_ids = list((await db.execute(exclusive_vol_ids_q)).scalars().all())

    # Locations only in this conference
    exclusive_loc_ids_q = (
        select(ConferenceLocation.location_id)
        .where(ConferenceLocation.conference_id == conference_id)
        .where(
            ~ConferenceLocation.location_id.in_(
                select(ConferenceLocation.location_id).where(ConferenceLocation.conference_id != conference_id)
            )
        )
    )
    data.exclusive_loc_ids = list((await db.execute(exclusive_loc_ids_q)).scalars().all())

    # CFPs only in this conference
    exclusive_cfp_ids_q = (
        select(ConferenceCFP.cfp_id)
        .where(ConferenceCFP.conference_id == conference_id)
        .where(
            ~ConferenceCFP.cfp_id.in_(select(ConferenceCFP.cfp_id).where(ConferenceCFP.conference_id != conference_id))
        )
    )
    data.exclusive_cfp_ids = list((await db.execute(exclusive_cfp_ids_q)).scalars().all())

    return data
