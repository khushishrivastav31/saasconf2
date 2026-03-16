"""Shared helper functions for CFP sub-modules."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.attachment_urls import batch_get_attachment_urls, get_latest_attachment_url
from app.core.dependencies import DbSessionDep
from app.models.associations import ConferenceCFP
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
from app.models.review import PaperReview, ReviewQuestion, ReviewStatus
from app.models.settings import SessionType, UserRole, UserRoleAssignment
from app.schemas.cfp import (
    ApplicantResponse,
    CospeakerResponse,
    PaperCommentResponse,
    PaperResponse,
    PaperReviewSummary,
    TopicResponse,
)

MODULE_CODE = "cfp"


async def _get_applicant_picture_url(db: DbSessionDep, applicant_id: UUID, tenant_id: UUID) -> str | None:
    """Get the picture download URL for an applicant, if one exists."""
    return await get_latest_attachment_url(db, applicant_id, "applicant_picture", tenant_id)


async def _get_applicant_video_url(db: DbSessionDep, applicant_id: UUID, tenant_id: UUID) -> str | None:
    """Get the video download URL for an applicant, if one exists."""
    return await get_latest_attachment_url(db, applicant_id, "applicant_video", tenant_id)


async def _batch_get_attachment_urls(
    db: DbSessionDep,
    entity_ids: list[UUID],
    entity_type: str,
    tenant_id: UUID,
) -> dict[UUID, str]:
    """Batch-fetch the most recent attachment URL per entity in a single query.

    Returns a mapping of entity_id -> download URL.
    """
    return await batch_get_attachment_urls(db, entity_ids, entity_type, tenant_id)


async def _get_paper_video_url(db: DbSessionDep, paper_id: UUID, tenant_id: UUID) -> str | None:
    """Get the video download URL for a paper."""
    return await get_latest_attachment_url(db, paper_id, "paper_video", tenant_id)


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
        selectinload(CFPPaper.comments)
        .selectinload(CFPPaperComment.committee_member)
        .selectinload(CFPCommitteeMember.applicant),
    ]


async def _reload_paper(db, paper_id: UUID, tenant_id: UUID) -> CFPPaper:
    """Re-query a paper with all eager loads after commit."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(CFPPaper.id == paper_id, CFPPaper.tenant_id == tenant_id)
    )
    return result.scalar_one()


SPEAKER_ROLE = "Speaker"


async def _sync_speaker_role(
    db: DbSessionDep,
    paper: CFPPaper,
    tenant_id: UUID,
    new_status: str,
    old_status: str,
    assigned_by: UUID | None = None,
) -> None:
    """Auto-assign or remove the 'Speaker' role when a paper changes status.

    - Accepted → assign Speaker role to main speaker + co-speakers
    - Away from accepted → remove Speaker role if user has no other accepted papers
    """
    was_accepted = old_status == PaperStatus.ACCEPTED.value
    now_accepted = new_status == PaperStatus.ACCEPTED.value

    if was_accepted == now_accepted:
        return  # No change in acceptance

    # Get the conference_id from the paper's CFP
    cfp_result = await db.execute(select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == paper.cfp_id))
    conference_id = cfp_result.scalar_one_or_none()
    if not conference_id:
        return

    # Find the Speaker role for this conference
    role_result = await db.execute(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.name == SPEAKER_ROLE,
        )
    )
    speaker_role = role_result.scalar_one_or_none()
    if not speaker_role:
        return

    # Collect all speaker applicant IDs (main + co-speakers)
    speaker_ids = set()
    if paper.main_speaker_id:
        speaker_ids.add(paper.main_speaker_id)
    cospeaker_result = await db.execute(
        select(CFPPaperCospeaker.applicant_id).where(
            CFPPaperCospeaker.paper_id == paper.id,
        )
    )
    speaker_ids.update(cospeaker_result.scalars().all())

    if not speaker_ids:
        return

    if now_accepted:
        # Assign Speaker role to all speakers who don't already have it
        existing_result = await db.execute(
            select(UserRoleAssignment.applicant_id).where(
                UserRoleAssignment.user_role_id == speaker_role.id,
                UserRoleAssignment.applicant_id.in_(speaker_ids),
            )
        )
        already_assigned = set(existing_result.scalars().all())
        for applicant_id in speaker_ids - already_assigned:
            db.add(
                UserRoleAssignment(
                    tenant_id=tenant_id,
                    user_role_id=speaker_role.id,
                    applicant_id=applicant_id,
                    assigned_by=assigned_by,
                )
            )
    else:
        # Remove Speaker role — but only if user has no OTHER accepted papers
        for applicant_id in speaker_ids:
            other_accepted = await db.execute(
                select(func.count())
                .select_from(CFPPaper)
                .where(
                    CFPPaper.tenant_id == tenant_id,
                    CFPPaper.status == PaperStatus.ACCEPTED.value,
                    CFPPaper.id != paper.id,
                    (
                        (CFPPaper.main_speaker_id == applicant_id)
                        | CFPPaper.id.in_(
                            select(CFPPaperCospeaker.paper_id).where(
                                CFPPaperCospeaker.applicant_id == applicant_id,
                            )
                        )
                    ),
                )
            )
            if (other_accepted.scalar() or 0) == 0:
                assignment_result = await db.execute(
                    select(UserRoleAssignment).where(
                        UserRoleAssignment.user_role_id == speaker_role.id,
                        UserRoleAssignment.applicant_id == applicant_id,
                    )
                )
                assignment = assignment_result.scalar_one_or_none()
                if assignment:
                    await db.delete(assignment)


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
        cospeakers_responses.append(
            CospeakerResponse(
                applicant=applicant_response,
                invitation_status=assoc.invitation_status,
                invited_at=assoc.invited_at,
                responded_at=assoc.responded_at,
            )
        )

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
        st_result = await db.execute(select(SessionType).where(SessionType.id == paper.session_type_id))
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

    # Count submitted reviews that flagged this paper as "must have"
    must_have_result = await db.execute(
        select(func.count()).where(
            PaperReview.paper_id == paper.id,
            PaperReview.tenant_id == tenant_id,
            PaperReview.must_have.is_(True),
            PaperReview.status == ReviewStatus.SUBMITTED.value,
        )
    )
    must_have_count = must_have_result.scalar() or 0

    # Build lightweight review summaries (submitted reviews only)
    reviews_result = await db.execute(
        select(PaperReview)
        .where(
            PaperReview.paper_id == paper.id,
            PaperReview.tenant_id == tenant_id,
            PaperReview.status == ReviewStatus.SUBMITTED.value,
        )
        .order_by(PaperReview.submitted_at)
    )
    reviews = list(reviews_result.scalars().all())

    # Batch-load all committee members to avoid N+1
    rev_member_ids = list({rev.committee_member_id for rev in reviews})
    rev_members_map: dict = {}
    if rev_member_ids:
        rev_member_result = await db.execute(
            select(CFPCommitteeMember)
            .options(selectinload(CFPCommitteeMember.applicant))
            .where(CFPCommitteeMember.id.in_(rev_member_ids))
        )
        rev_members_map = {m.id: m for m in rev_member_result.scalars().all()}

    review_summaries = []
    for rev in reviews:
        member = rev_members_map.get(rev.committee_member_id)
        review_summaries.append(
            PaperReviewSummary(
                reviewer_first_name=member.applicant.first_name if member and member.applicant else None,
                reviewer_last_name=member.applicant.last_name if member and member.applicant else None,
                total_score=rev.total_score,
                internal_comment=rev.internal_comment,
                must_have=rev.must_have,
            )
        )

    # Compute maximum possible review score from conference review criteria
    max_review_score: float | None = None
    conf_id_result = await db.execute(
        select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == paper.cfp_id).limit(1)
    )
    conference_id = conf_id_result.scalar_one_or_none()
    if conference_id:
        questions_result = await db.execute(
            select(ReviewQuestion).where(
                ReviewQuestion.conference_id == conference_id,
                ReviewQuestion.tenant_id == tenant_id,
                ReviewQuestion.is_active.is_(True),
                ReviewQuestion.count_in_score.is_(True),
            )
        )
        total_max_weighted = 0.0
        total_weight = 0.0
        for q in questions_result.scalars().all():
            if not q.score_scale or not q.score_scale.options:
                continue
            max_val = max(
                (o.numeric_value for o in q.score_scale.options if o.numeric_value is not None and not o.is_unsure),
                default=None,
            )
            if max_val is not None:
                total_max_weighted += max_val * q.weight
                total_weight += q.weight
        if total_weight > 0:
            max_review_score = total_max_weighted / total_weight

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
        form_variant_id=paper.form_variant_id,
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
        must_have_count=must_have_count,
        max_review_score=max_review_score,
        review_summaries=review_summaries,
        submitted_at=paper.submitted_at,
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )
