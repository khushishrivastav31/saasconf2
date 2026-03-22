"""CFP Applicant Portal - Co-speaker invitation endpoints."""

from fastapi import APIRouter
from sqlalchemy import select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
)
from app.models.conference import Conference
from app.schemas.cfp_portal import (
    PortalInvitationListResponse,
    PortalInvitationResponse,
)

router = APIRouter()


@router.get("/portal/invitations", response_model=PortalInvitationListResponse)
async def list_invitations(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalInvitationListResponse:
    """List co-speaker invitations for the current applicant."""
    result = await db.execute(
        select(CFPPaperCospeaker)
        .where(CFPPaperCospeaker.applicant_id == current.applicant_id)
        .order_by(CFPPaperCospeaker.invited_at.desc())
    )
    cospeaker_rows = result.scalars().all()

    # Batch-load all related data to avoid N+1 queries
    paper_ids = list({row.paper_id for row in cospeaker_rows})
    papers_map: dict = {}
    speakers_map: dict = {}
    cfps_map: dict = {}
    conf_names_map: dict = {}

    if paper_ids:
        # Batch-load papers
        papers_result = await db.execute(select(CFPPaper).where(CFPPaper.id.in_(paper_ids)))
        papers_map = {p.id: p for p in papers_result.scalars().all()}

        # Batch-load main speakers
        speaker_ids = list({p.main_speaker_id for p in papers_map.values() if p.main_speaker_id})
        if speaker_ids:
            speakers_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(speaker_ids)))
            speakers_map = {s.id: s for s in speakers_result.scalars().all()}

        # Batch-load CFPs
        cfp_ids = list({p.cfp_id for p in papers_map.values() if p.cfp_id})
        if cfp_ids:
            cfps_result = await db.execute(select(CallForPapers).where(CallForPapers.id.in_(cfp_ids)))
            cfps_map = {c.id: c for c in cfps_result.scalars().all()}

            # Batch-load conference names via conference_cfps
            conf_result = await db.execute(
                select(ConferenceCFP.cfp_id, Conference.name)
                .join(Conference, Conference.id == ConferenceCFP.conference_id)
                .where(ConferenceCFP.cfp_id.in_(cfp_ids))
            )
            for cfp_id, conf_name in conf_result.all():
                conf_names_map.setdefault(cfp_id, conf_name)

    items = []
    for row in cospeaker_rows:
        paper = papers_map.get(row.paper_id)
        if not paper:
            continue

        main_speaker = speakers_map.get(paper.main_speaker_id)
        cfp = cfps_map.get(paper.cfp_id)
        conference_name = conf_names_map.get(paper.cfp_id)

        items.append(
            PortalInvitationResponse(
                paper_id=paper.id,
                paper_title=paper.title,
                cfp_title=cfp.title if cfp else None,
                conference_name=conference_name,
                main_speaker_first_name=main_speaker.first_name if main_speaker else "Unknown",
                main_speaker_last_name=main_speaker.last_name if main_speaker else "",
                main_speaker_email=main_speaker.email if main_speaker else "",
                invitation_status=row.invitation_status,
                invited_at=row.invited_at,
            )
        )

    return PortalInvitationListResponse(items=items, total=len(items))


@router.post("/portal/invitations/{paper_id}/accept")
async def accept_invitation(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Accept a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == current.applicant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Invitation not found")

    if row.invitation_status != CospeakerInvitationStatus.PENDING.value:
        raise ValidationError("Invitation has already been responded to")

    row.invitation_status = CospeakerInvitationStatus.ACCEPTED.value
    row.responded_at = utcnow()
    await db.commit()

    return {"message": "Invitation accepted"}


@router.post("/portal/invitations/{paper_id}/decline")
async def decline_invitation(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Decline a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == current.applicant_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise NotFoundError("Invitation not found")

    if row.invitation_status != CospeakerInvitationStatus.PENDING.value:
        raise ValidationError("Invitation has already been responded to")

    row.invitation_status = CospeakerInvitationStatus.DECLINED.value
    row.responded_at = utcnow()
    await db.commit()

    return {"message": "Invitation declined"}
