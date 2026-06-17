"""Internal helpers for the CFP portal papers endpoints.

These are intentionally module-private (leading ``_`` names on
functions, plus package-private via the ``papers`` directory). Cross-
package imports should come through ``app.api.v1.cfp_portal.papers``
which re-exports the ones actually reached from outside the package
(``_get_applicant_or_cospeaker_paper`` — used by ``reviews.py`` and
``attachments.py``).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.applicant_dependencies import CurrentApplicantDep
from app.core.attachment_urls import PORTAL_PREFIX, batch_get_attachment_urls
from app.core.email import send_cospeaker_invitation_email, send_email_background
from app.core.exceptions import NotFoundError, ValidationError
from app.core.portal_user_auto_creation import ensure_cospeaker_setup_token, provision_cospeaker_applicant
from app.core.security.pii_crypto import hash_email
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    CFPStatus,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.review import PaperReview
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.schemas.cfp_portal import (
    PortalAssignedPaperResponse,
    PortalCospeakerInput,
    PortalCospeakerResponse,
    PortalPaperResponse,
    PortalTopicResponse,
)

from ..shared import _get_paper_video_url

# ──────────────────────────────────────────────
#  Load options (shared by the auth helpers)
# ──────────────────────────────────────────────


_PAPER_RESPONSE_LOAD_OPTIONS = (
    selectinload(CFPPaper.cfp),
    selectinload(CFPPaper.main_speaker),
    selectinload(CFPPaper.form_variant),
    selectinload(CFPPaper.cospeaker_associations).selectinload(CFPPaperCospeaker.applicant),
    selectinload(CFPPaper.topics),
)


# ──────────────────────────────────────────────
#  Access / authorization
# ──────────────────────────────────────────────


async def _get_applicant_paper(db: AsyncSession, paper_id: str, applicant_id, tenant_id) -> CFPPaper:
    """Load a paper owned by the current applicant (main speaker only)."""
    # ``populate_existing`` forces re-load of relationships for any copy already in
    # the session identity map — important after post-mutation re-fetch so the
    # response reflects the committed DB state, not cached ORM state.
    result = await db.execute(
        select(CFPPaper)
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.main_speaker_id == applicant_id,
            CFPPaper.tenant_id == tenant_id,
        )
        .options(*_PAPER_RESPONSE_LOAD_OPTIONS)
        .execution_options(populate_existing=True)
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise NotFoundError("Paper not found")
    return paper


async def _get_applicant_or_cospeaker_paper(db: AsyncSession, paper_id: str, applicant_id, tenant_id) -> CFPPaper:
    """Load a paper where the applicant is main speaker or accepted co-speaker."""
    result = await db.execute(
        select(CFPPaper)
        .outerjoin(
            CFPPaperCospeaker,
            and_(
                CFPPaperCospeaker.paper_id == CFPPaper.id,
                CFPPaperCospeaker.applicant_id == applicant_id,
                CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
            ),
        )
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == tenant_id,
            or_(
                CFPPaper.main_speaker_id == applicant_id,
                CFPPaperCospeaker.applicant_id.isnot(None),
            ),
        )
        .options(*_PAPER_RESPONSE_LOAD_OPTIONS)
        .execution_options(populate_existing=True)
    )
    paper = result.scalars().unique().one_or_none()
    if not paper:
        raise NotFoundError("Paper not found")
    return paper


# ──────────────────────────────────────────────
#  Response builders
# ──────────────────────────────────────────────


async def _load_paper_list_context(db: AsyncSession, papers: list[CFPPaper], tenant_id) -> tuple[dict, dict, dict]:
    """Batch-load the cross-table context needed to render a list of portal papers.

    Returns ``(conference_by_cfp_id, session_type_name_by_id, video_url_by_paper_id)``.
    Avoids per-paper conference/session-type/attachment queries in ``list_papers``.
    """
    cfp_ids = {p.cfp_id for p in papers}
    conf_by_cfp: dict = {}
    if cfp_ids:
        conf_rows = await db.execute(
            select(ConferenceCFP.cfp_id, Conference)
            .join(Conference, Conference.id == ConferenceCFP.conference_id)
            .where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        for cfp_id, conf in conf_rows.all():
            conf_by_cfp.setdefault(cfp_id, conf)  # first conference wins, matches old .limit(1)

    session_type_ids = {p.session_type_id for p in papers if p.session_type_id}
    st_by_id: dict = {}
    if session_type_ids:
        st_rows = await db.execute(select(SessionType).where(SessionType.id.in_(session_type_ids)))
        st_by_id = {st.id: st.name for st in st_rows.scalars().all()}

    video_by_paper = await batch_get_attachment_urls(
        db, [p.id for p in papers], "paper_video", tenant_id, PORTAL_PREFIX
    )
    return conf_by_cfp, st_by_id, video_by_paper


def _render_portal_paper(
    paper: CFPPaper,
    current_applicant_id,
    *,
    conference: Conference | None,
    session_type_name: str | None,
    video_url: str | None,
) -> PortalPaperResponse:
    """Build PortalPaperResponse from eager-loaded relationships + pre-fetched context."""
    cfp = paper.cfp
    cfp_title = cfp.title if cfp else None

    conference_id = conference.id if conference else None
    conference_name = conference.name if conference else None

    form_variant_name = paper.form_variant.name if paper.form_variant else None

    is_main_speaker = not (current_applicant_id and str(paper.main_speaker_id) != str(current_applicant_id))
    main_speaker = paper.main_speaker
    main_speaker_first_name = main_speaker.first_name if main_speaker else None
    main_speaker_last_name = main_speaker.last_name if main_speaker else None

    cospeakers = [
        PortalCospeakerResponse(
            applicant_id=row.applicant.id,
            first_name=row.applicant.first_name,
            last_name=row.applicant.last_name,
            email=row.applicant.email or "",
            invitation_status=row.invitation_status,
            invited_at=row.invited_at,
            responded_at=row.responded_at,
        )
        for row in paper.cospeaker_associations
        if row.applicant is not None
    ]

    # Hide accepted/rejected status from portal users until CFP is completed.
    portal_status = paper.status
    if paper.status in (PaperStatus.ACCEPTED.value, PaperStatus.REJECTED.value):
        cfp_status = cfp.status if cfp else None
        if cfp_status != CFPStatus.COMPLETED.value:
            portal_status = PaperStatus.FINAL_CONSIDERATION.value

    topics = [PortalTopicResponse(id=t.id, name=t.name, description=t.description) for t in paper.topics]

    return PortalPaperResponse(
        id=paper.id,
        cfp_id=paper.cfp_id,
        cfp_title=cfp_title,
        conference_id=conference_id,
        conference_name=conference_name,
        session_type_id=paper.session_type_id,
        session_type_name=session_type_name,
        form_variant_id=paper.form_variant_id,
        form_variant_name=form_variant_name,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
        custom_field_answers=paper.custom_field_answers,
        status=portal_status,
        video_url=video_url,
        is_main_speaker=is_main_speaker,
        main_speaker_first_name=main_speaker_first_name,
        main_speaker_last_name=main_speaker_last_name,
        cospeakers=cospeakers,
        topics=topics,
        submitted_at=paper.submitted_at,
        created_at=paper.created_at,
        updated_at=paper.updated_at,
    )


async def _build_portal_paper_response(
    db: AsyncSession, paper: CFPPaper, current_applicant_id=None
) -> PortalPaperResponse:
    """Single-paper response builder. Expects ``paper`` loaded via ``_PAPER_RESPONSE_LOAD_OPTIONS``
    (or freshly created + refreshed — relationships auto-load on access in that case)."""
    conf_result = await db.execute(
        select(Conference)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == paper.cfp_id)
        .limit(1)
    )
    conference = conf_result.scalar_one_or_none()

    session_type_name: str | None = None
    if paper.session_type_id:
        st_result = await db.execute(select(SessionType.name).where(SessionType.id == paper.session_type_id))
        session_type_name = st_result.scalar_one_or_none()

    video_url = await _get_paper_video_url(db, paper.id, paper.tenant_id)

    return _render_portal_paper(
        paper,
        current_applicant_id,
        conference=conference,
        session_type_name=session_type_name,
        video_url=video_url,
    )


# ──────────────────────────────────────────────
#  Co-speaker sync
# ──────────────────────────────────────────────


async def _sync_cospeakers(
    db: AsyncSession,
    paper: CFPPaper,
    cospeakers: list[PortalCospeakerInput],
    current: CurrentApplicantDep,
) -> None:
    """Sync co-speakers for a paper based on structured list.

    Preserves invitation status for existing co-speakers and only sends
    invitation emails to newly added ones. Unknown emails are auto-provisioned
    rather than rejected.
    """
    if len(cospeakers) > 3:
        raise ValidationError("Maximum 3 co-speakers allowed")

    existing_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper.id))
    existing_by_applicant: dict = {row.applicant_id: row for row in existing_result.scalars().all()}

    main_speaker_email = current.applicant.email or ""

    # Deduplicate by normalised email and resolve each to a CFPApplicant (provisioning if needed)
    seen_emails: set[str] = set()
    new_applicants: list[tuple[int, CFPApplicant, str | None]] = []  # (sort_order, applicant, setup_token)
    for i, cs in enumerate(cospeakers):
        normalized = str(cs.email).strip().lower()
        if normalized in seen_emails:
            continue
        seen_emails.add(normalized)

        if normalized == main_speaker_email.lower():
            raise ValidationError("You cannot add yourself as a co-speaker")

        app_result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.tenant_id == current.tenant_id,
                CFPApplicant.email_hash == hash_email(normalized),
            )
        )
        applicant = app_result.scalar_one_or_none()
        setup_token: str | None = None

        if applicant is None:
            applicant, setup_token = await provision_cospeaker_applicant(
                db,
                tenant_id=current.tenant_id,
                first_name=cs.first_name,
                email=normalized,
            )
        elif applicant.id == current.applicant_id:
            raise ValidationError("You cannot add yourself as a co-speaker")

        new_applicants.append((i, applicant, setup_token))

    # Determine which applicant IDs to keep
    new_applicant_ids = {a.id for _, a, _ in new_applicants}

    # Delete co-speakers that are no longer in the list
    for applicant_id, row in existing_by_applicant.items():
        if applicant_id not in new_applicant_ids:
            await db.delete(row)

    # Pre-load conference info and tenant info once (only needed if there are new additions)
    conference_name: str | None = None
    conference_id: UUID | None = None
    conf_support_email: str | None = None
    tenant_slug: str | None = None
    company_name: str | None = None

    for sort_order, applicant, setup_token in new_applicants:
        existing_row = existing_by_applicant.get(applicant.id)

        if existing_row:
            # Existing co-speaker: just update sort order, preserve invitation status
            existing_row.sort_order = sort_order
        else:
            # New co-speaker: create record and send invitation
            if setup_token is None:
                # Existing applicant: issue a token iff their portal account
                # has no password yet so the invite link lands on set-password.
                setup_token = await ensure_cospeaker_setup_token(db, applicant)

            cospeaker = CFPPaperCospeaker(
                paper_id=paper.id,
                applicant_id=applicant.id,
                sort_order=sort_order,
                invitation_status=CospeakerInvitationStatus.PENDING.value,
            )
            db.add(cospeaker)

            # Load conference info on first new addition
            if conference_name is None:
                conf_result = await db.execute(
                    select(Conference)
                    .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
                    .where(ConferenceCFP.cfp_id == paper.cfp_id)
                    .limit(1)
                )
                conf = conf_result.scalar_one_or_none()
                conference_name = conf.name if conf else "Conference"
                conference_id = conf.id if conf else None
                conf_support_email = conf.support_email if conf else None

            # Resolve tenant info for email URLs
            if tenant_slug is None:
                tenant_result = await db.execute(select(Tenant.slug, Tenant.name).where(Tenant.id == current.tenant_id))
                row = tenant_result.one()
                tenant_slug = row[0]
                company_name = row[1]

            cospeaker_settings = get_settings()
            send_email_background(
                send_cospeaker_invitation_email,
                db,
                email=applicant.email,
                paper_title=paper.title,
                conference_id=conference_id,
                conference_name=conference_name,
                company_name=company_name,
                main_speaker_name=f"{current.applicant.first_name} {current.applicant.last_name}",
                main_speaker_email=main_speaker_email,
                first_name=applicant.first_name,
                last_name=applicant.last_name,
                tenant_slug=tenant_slug,
                support_email=conf_support_email or "",
                base_url=cospeaker_settings.PORTAL_BASE_URL,
                setup_token=setup_token,
            )

    await db.flush()


# ──────────────────────────────────────────────
#  Assigned-paper response builder
# ──────────────────────────────────────────────


async def _build_assigned_paper_response(
    db, assignment: CFPPaperAssignment, conference_id_filter: str | None = None
) -> PortalAssignedPaperResponse | None:
    """Build a PortalAssignedPaperResponse from an assignment."""
    paper_result = await db.execute(
        select(CFPPaper).options(selectinload(CFPPaper.topics)).where(CFPPaper.id == assignment.paper_id)
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        return None

    conf_id = None
    conf_name = None
    conf_result = await db.execute(
        select(Conference)
        .join(ConferenceCFP, ConferenceCFP.conference_id == Conference.id)
        .where(ConferenceCFP.cfp_id == paper.cfp_id)
        .limit(1)
    )
    conf = conf_result.scalar_one_or_none()
    if conf:
        conf_id = conf.id
        conf_name = conf.name

    # Filter by conference if requested
    if conference_id_filter and str(conf_id) != conference_id_filter:
        return None

    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()

    session_type_name = None
    if paper.session_type_id:
        st_result = await db.execute(select(SessionType).where(SessionType.id == paper.session_type_id))
        st = st_result.scalar_one_or_none()
        if st:
            session_type_name = st.name

    # Handle anonymity — respect both the per-assignment flag and the CFP's current setting
    is_anonymous = assignment.is_anonymous or (cfp is not None and cfp.is_anonymous_review)
    cospeakers: list[PortalCospeakerResponse]
    if is_anonymous:
        main_speaker_first_name = None
        main_speaker_last_name = None
        cospeakers = []
    else:
        main_speaker_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == paper.main_speaker_id))
        main_speaker = main_speaker_result.scalar_one_or_none()
        main_speaker_first_name = main_speaker.first_name if main_speaker else None
        main_speaker_last_name = main_speaker.last_name if main_speaker else None

        cospeaker_result = await db.execute(select(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper.id))
        cospeaker_rows = cospeaker_result.scalars().all()

        # Batch-load all cospeaker applicants in one query
        cospeaker_applicant_ids = [row.applicant_id for row in cospeaker_rows if row.applicant_id]
        applicants_map: dict = {}
        if cospeaker_applicant_ids:
            app_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id.in_(cospeaker_applicant_ids)))
            applicants_map = {a.id: a for a in app_result.scalars().all()}

        cospeakers = []
        for row in cospeaker_rows:
            applicant = applicants_map.get(row.applicant_id)
            if applicant:
                cospeakers.append(
                    PortalCospeakerResponse(
                        applicant_id=applicant.id,
                        first_name=applicant.first_name,
                        last_name=applicant.last_name,
                        email=applicant.email,
                        invitation_status=row.invitation_status,
                        invited_at=row.invited_at,
                        responded_at=row.responded_at,
                    )
                )

    topics = [PortalTopicResponse(id=t.id, name=t.name, description=t.description) for t in paper.topics]

    video_url = await _get_paper_video_url(db, paper.id, paper.tenant_id)

    # Get review status for this assignment
    review_status = None
    review_result = await db.execute(
        select(PaperReview.status).where(
            PaperReview.assignment_id == assignment.id,
        )
    )
    review_row = review_result.scalar_one_or_none()
    if review_row:
        review_status = review_row

    # Hide accepted/rejected status from portal users until CFP is completed
    portal_status = paper.status
    if paper.status in (PaperStatus.ACCEPTED.value, PaperStatus.REJECTED.value):
        cfp_status = cfp.status if cfp else None
        if cfp_status != CFPStatus.COMPLETED.value:
            portal_status = PaperStatus.FINAL_CONSIDERATION.value

    return PortalAssignedPaperResponse(
        id=paper.id,
        assignment_id=assignment.id,
        is_anonymous=is_anonymous,
        assigned_at=assignment.assigned_at,
        conference_id=conf_id,
        conference_name=conf_name,
        cfp_id=paper.cfp_id,
        cfp_title=cfp.title if cfp else None,
        title=paper.title,
        abstract_short=paper.abstract_short,
        abstract_long=paper.abstract_long,
        level=paper.level,
        learning_objectives=paper.learning_objectives,
        status=portal_status,
        session_type_name=session_type_name,
        topics=topics,
        video_url=video_url,
        main_speaker_first_name=main_speaker_first_name,
        main_speaker_last_name=main_speaker_last_name,
        cospeakers=cospeakers,
        review_status=review_status,
    )
