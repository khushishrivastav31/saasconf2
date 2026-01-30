"""Shared helper functions for CFP sub-modules."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSessionDep
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.cfp import (
    CFPApplicant,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperComment,
    CFPPaperCospeaker,
    CFPStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.settings import SessionType
from app.schemas.cfp import (
    ApplicantResponse,
    CospeakerResponse,
    PaperCommentResponse,
    PaperResponse,
    TopicResponse,
)

MODULE_CODE = "cfp"


async def _get_applicant_picture_url(db: DbSessionDep, applicant_id: UUID, tenant_id: UUID) -> str | None:
    """Get the picture download URL for an applicant, if one exists."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "applicant_picture",
            Attachment.entity_id == applicant_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/attachments/{attachment_id}/download"
    return None


async def _get_applicant_video_url(db: DbSessionDep, applicant_id: UUID, tenant_id: UUID) -> str | None:
    """Get the video download URL for an applicant, if one exists."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "applicant_video",
            Attachment.entity_id == applicant_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/attachments/{attachment_id}/download"
    return None


async def _get_paper_video_url(db: DbSessionDep, paper_id: UUID, tenant_id: UUID) -> str | None:
    """Get the video download URL for a paper."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "paper_video",
            Attachment.entity_id == paper_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/attachments/{attachment_id}/download"
    return None


def _compute_display_status(paper_status: str, cfp_status: str) -> str:
    """Compute displayable status based on CFP completion.

    For accepted/rejected papers, returns the actual status only when the CFP
    is completed.  Otherwise returns ``final_consideration`` so the user-facing
    lifeline doesn't reveal the decision prematurely.
    """
    if paper_status in (PaperStatus.REJECTED.value, PaperStatus.ACCEPTED.value):
        if cfp_status == CFPStatus.COMPLETED.value:
            return paper_status
        return PaperStatus.FINAL_CONSIDERATION.value
    return paper_status


async def _build_applicant_response(
    db: DbSessionDep,
    applicant: CFPApplicant,
    tenant_id: UUID,
) -> ApplicantResponse:
    """Build an ApplicantResponse from a CFPApplicant model."""
    picture_url = await _get_applicant_picture_url(db, applicant.id, tenant_id)
    video_url = await _get_applicant_video_url(db, applicant.id, tenant_id)
    return ApplicantResponse(
        id=applicant.id,
        tenant_id=applicant.tenant_id,
        first_name=applicant.first_name,
        last_name=applicant.last_name,
        email=applicant.email,
        phone=applicant.phone,
        title=applicant.title,
        company=applicant.company,
        bio=applicant.bio,
        allow_out_of_timeframe=applicant.allow_out_of_timeframe,
        social_links=applicant.social_links or {},
        needs_accessibility=applicant.needs_accessibility,
        accessibility_details=applicant.accessibility_details,
        agrees_to_recording=applicant.agrees_to_recording,
        picture_url=picture_url,
        video_url=video_url,
        created_at=applicant.created_at,
        updated_at=applicant.updated_at,
    )


def _paper_eager_options():
    """Standard eager-loading options for CFPPaper queries."""
    return [
        selectinload(CFPPaper.cfp),
        selectinload(CFPPaper.main_speaker),
        selectinload(CFPPaper.cospeaker_associations).selectinload(CFPPaperCospeaker.applicant),
        selectinload(CFPPaper.topics),
        selectinload(CFPPaper.comments).selectinload(
            CFPPaperComment.committee_member
        ).selectinload(CFPCommitteeMember.applicant),
    ]


async def _reload_paper(db, paper_id: UUID, tenant_id: UUID) -> CFPPaper:
    """Re-query a paper with all eager loads after commit."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(CFPPaper.id == paper_id, CFPPaper.tenant_id == tenant_id)
    )
    return result.scalar_one()


async def _build_paper_response(
    db: DbSessionDep,
    paper: CFPPaper,
    tenant_id: UUID,
) -> PaperResponse:
    """Build a PaperResponse from a CFPPaper model."""
    # Get video URL
    video_url = await _get_paper_video_url(db, paper.id, tenant_id)

    # Build main speaker response
    main_speaker_response = await _build_applicant_response(db, paper.main_speaker, tenant_id)

    # Build cospeakers responses
    cospeakers_responses = []
    for assoc in paper.cospeaker_associations:
        applicant_response = await _build_applicant_response(db, assoc.applicant, tenant_id)
        cospeakers_responses.append(CospeakerResponse(
            applicant=applicant_response,
            invitation_status=assoc.invitation_status,
            invited_at=assoc.invited_at,
            responded_at=assoc.responded_at,
        ))

    # Build topics
    topics_responses = [
        TopicResponse(
            id=t.id,
            tenant_id=t.tenant_id,
            name=t.name,
            description=t.description,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in paper.topics
    ]

    # Build comments
    comments_responses = [
        PaperCommentResponse(
            id=c.id,
            committee_member_id=c.committee_member_id,
            committee_member_first_name=c.committee_member.applicant.first_name if c.committee_member else None,
            committee_member_last_name=c.committee_member.applicant.last_name if c.committee_member else None,
            committee_member_role=c.committee_member.role if c.committee_member else None,
            content=c.content,
            created_at=c.created_at,
        )
        for c in paper.comments
    ]

    # Get session type info
    session_type_name = None
    session_type_duration = None
    if paper.session_type_id:
        st_result = await db.execute(
            select(SessionType).where(SessionType.id == paper.session_type_id)
        )
        st = st_result.scalar_one_or_none()
        if st:
            session_type_name = st.name
            session_type_duration = st.duration_minutes

    # Get conference name via ConferenceCFP association
    conference_name = None
    conf_result = await db.execute(
        select(Conference.name)
        .join(ConferenceCFP, Conference.id == ConferenceCFP.conference_id)
        .where(ConferenceCFP.cfp_id == paper.cfp_id)
        .limit(1)
    )
    conference_name = conf_result.scalar_one_or_none()

    return PaperResponse(
        id=paper.id,
        tenant_id=paper.tenant_id,
        cfp_id=paper.cfp_id,
        cfp_title=paper.cfp.title,
        cfp_status=paper.cfp.status,
        conference_name=conference_name,
        main_speaker_id=paper.main_speaker_id,
        main_speaker=main_speaker_response,
        cospeakers=cospeakers_responses,
        session_type_id=paper.session_type_id,
        session_type_name=session_type_name,
        session_type_duration=session_type_duration,
        topics=topics_responses,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
        importance=paper.importance,
        status=paper.status,
        display_status=_compute_display_status(paper.status, paper.cfp.status),
        video_url=video_url,
        comments=comments_responses,
        submitted_at=paper.submitted_at,
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )
