"""Endpoints for papers an applicant has authored or co-authored.

List + CRUD + submit/unsubmit + delete. All require ``CurrentApplicantDep``;
access control goes through ``_get_applicant_paper`` (main-speaker-only)
and ``_get_applicant_or_cospeaker_paper`` (main-speaker or accepted
co-speaker) in ``_helpers.py``.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import selectinload

from app.api.v1.cfp._paper_helpers import sync_paper_topics, validate_topics
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import AuthorizationError, NotFoundError, SubmissionValidationError, ValidationError
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
    CospeakerInvitationStatus,
    PaperStatus,
)
from app.schemas.cfp_portal import (
    PortalPaperCreateRequest,
    PortalPaperListResponse,
    PortalPaperResponse,
    PortalPaperUpdateRequest,
)

from ..shared import _get_applicant_picture_url, _get_applicant_video_url
from ._helpers import (
    _build_portal_paper_response,
    _get_applicant_or_cospeaker_paper,
    _get_applicant_paper,
    _load_paper_list_context,
    _render_portal_paper,
    _sync_cospeakers,
)

router = APIRouter()


@router.get("/portal/papers", response_model=PortalPaperListResponse)
async def list_papers(
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperListResponse:
    """List all papers where the applicant is main speaker or accepted co-speaker."""
    # Single query: main-speaker OR accepted-cospeaker, dedup via scalars().unique().
    stmt = (
        select(CFPPaper)
        .outerjoin(
            CFPPaperCospeaker,
            and_(
                CFPPaperCospeaker.paper_id == CFPPaper.id,
                CFPPaperCospeaker.applicant_id == current.applicant_id,
                CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
            ),
        )
        .where(
            CFPPaper.tenant_id == current.tenant_id,
            or_(
                CFPPaper.main_speaker_id == current.applicant_id,
                CFPPaperCospeaker.applicant_id.isnot(None),
            ),
        )
        .options(
            selectinload(CFPPaper.cfp),
            selectinload(CFPPaper.main_speaker),
            selectinload(CFPPaper.form_variant),
            selectinload(CFPPaper.cospeaker_associations).selectinload(CFPPaperCospeaker.applicant),
        )
        .order_by(CFPPaper.created_at.desc())
    )
    result = await db.execute(stmt)
    papers = list(result.scalars().unique().all())

    if not papers:
        return PortalPaperListResponse(items=[], total=0)

    conf_by_cfp, st_by_id, video_by_paper = await _load_paper_list_context(db, papers, current.tenant_id)
    items = [
        _render_portal_paper(
            paper,
            current.applicant_id,
            conference=conf_by_cfp.get(paper.cfp_id),
            session_type_name=(st_by_id.get(paper.session_type_id) if paper.session_type_id else None),
            video_url=video_by_paper.get(paper.id),
        )
        for paper in papers
    ]
    return PortalPaperListResponse(items=items, total=len(items))


@router.get("/portal/papers/{paper_id}", response_model=PortalPaperResponse)
async def get_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Get a single paper (main speaker or accepted co-speaker)."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers", response_model=PortalPaperResponse)
async def create_paper(
    data: PortalPaperCreateRequest,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Create a new paper as draft."""
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == data.cfp_id,
            CallForPapers.tenant_id == current.tenant_id,
        )
    )
    cfp = cfp_result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError("CFP not found")

    paper = CFPPaper(
        tenant_id=current.tenant_id,
        cfp_id=data.cfp_id,
        main_speaker_id=current.applicant_id,
        session_type_id=data.session_type_id,
        form_variant_id=data.form_variant_id,
        title=data.title,
        abstract_short=data.abstract_short,
        abstract_long=data.abstract_long,
        level=data.level,
        learning_objectives=data.learning_objectives,
        custom_field_answers=data.custom_field_answers,
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.flush()

    if data.topic_ids:
        await validate_topics(db, data.topic_ids, current.tenant_id)
        await sync_paper_topics(db, paper.id, data.topic_ids)

    if data.cospeaker_emails:
        await _sync_cospeakers(db, paper, data.cospeaker_emails, current)

    await db.commit()
    paper = await _get_applicant_or_cospeaker_paper(db, str(paper.id), current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.put("/portal/papers/{paper_id}", response_model=PortalPaperResponse)
async def update_paper(
    paper_id: str,
    data: PortalPaperUpdateRequest,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Update a paper (only if draft). Main speaker or accepted co-speaker."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be edited")

    is_main = str(paper.main_speaker_id) == str(current.applicant_id)

    update_data = data.model_dump(exclude_unset=True, exclude={"cospeaker_emails", "topic_ids"})
    for field, value in update_data.items():
        setattr(paper, field, value)

    if "topic_ids" in data.model_fields_set:
        topic_ids = data.topic_ids or []
        if topic_ids:
            await validate_topics(db, topic_ids, current.tenant_id)
        await sync_paper_topics(db, paper.id, topic_ids)

    # Only main speaker can manage co-speakers
    if data.cospeaker_emails is not None:
        if not is_main:
            raise AuthorizationError("Only the main speaker can manage co-speakers")
        await _sync_cospeakers(db, paper, data.cospeaker_emails, current)

    await db.commit()
    paper = await _get_applicant_or_cospeaker_paper(db, str(paper.id), current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers/{paper_id}/submit", response_model=PortalPaperResponse)
async def submit_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Submit a draft paper. Main speaker or accepted co-speaker can submit."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be submitted")

    # --- Load form schema config (authoritative source for required + char-limit validation) ---
    from app.api.v1.cfp._paper_helpers import strip_html_for_char_count
    from app.models.form_schema import ConferencePaperFormSchema
    from app.models.paper_form_variant import PaperFormVariant

    builtin_cfg: dict = {}
    if paper.form_variant_id:
        fv_result = await db.execute(select(PaperFormVariant).where(PaperFormVariant.id == paper.form_variant_id))
        variant = fv_result.scalar_one_or_none()
        if variant and variant.builtin_fields_config:
            builtin_cfg = variant.builtin_fields_config
    if not builtin_cfg:
        # Get conference_id via the CFP junction table (papers don't have conference_id directly)
        conf_id_result = await db.execute(
            select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == paper.cfp_id)
        )
        conf_id = conf_id_result.scalar_one_or_none()
        schema_result = (
            await db.execute(
                select(ConferencePaperFormSchema).where(ConferencePaperFormSchema.conference_id == conf_id)
            )
            if conf_id
            else None
        )
        schema = schema_result.scalar_one_or_none() if schema_result else None
        if schema and schema.builtin_fields_config:
            builtin_cfg = schema.builtin_fields_config

    # --- Validate required fields before submission ---
    cfp_result = await db.execute(select(CallForPapers).where(CallForPapers.id == paper.cfp_id))
    cfp = cfp_result.scalar_one_or_none()
    if cfp:
        missing: list[str] = []

        paper_field_map = {
            "title": paper.title,
            "abstract_short": paper.abstract_short,
            "abstract_long": paper.abstract_long,
            "level": paper.level,
            "learning_objectives": paper.learning_objectives,
            "session_type": paper.session_type_id,
            "topics": paper.topics if paper.topics else None,
        }

        if builtin_cfg:
            # builtin_fields_config is the authoritative source for the required flag —
            # this is what the Paper Form Builder UI writes to when toggling the checkbox.
            for field_key, cfg in builtin_cfg.items():
                if not cfg.get("visible", True):
                    continue  # hidden fields are never enforced
                if not cfg.get("required", False):
                    continue
                val = paper_field_map.get(field_key)
                if not val:
                    missing.append(f"paper:{field_key}")
        else:
            # Legacy fallback: no form schema configured yet
            for field in cfp.required_paper_fields or []:
                val = paper_field_map.get(field)
                if not val:
                    missing.append(f"paper:{field}")

        # Check required speaker fields
        applicant_result = await db.execute(select(CFPApplicant).where(CFPApplicant.id == current.applicant_id))
        applicant = applicant_result.scalar_one_or_none()
        if applicant:
            speaker_field_map = {
                "bio": applicant.bio,
                "phone": applicant.phone,
                "title": applicant.title,
                "company": applicant.company,
            }
            for field in cfp.required_speaker_fields or []:
                if field in speaker_field_map:
                    if not speaker_field_map[field]:
                        missing.append(f"speaker:{field}")
                elif field == "picture":
                    pic_url = await _get_applicant_picture_url(db, applicant.id, current.tenant_id)
                    if not pic_url:
                        missing.append("speaker:picture")
                elif field == "video":
                    vid_url = await _get_applicant_video_url(db, applicant.id, current.tenant_id)
                    if not vid_url:
                        missing.append("speaker:video")

        if missing:
            raise SubmissionValidationError(
                "Missing required fields",
                missing_fields=missing,
            )

    # --- Validate character limits from form schema config ---
    if builtin_cfg:
        char_limit_fields = {
            "title": ("Title", paper.title, False),
            "abstract_short": ("Short Abstract", paper.abstract_short, True),
            "abstract_long": ("Detailed Abstract", paper.abstract_long, True),
            "learning_objectives": ("Learning Objectives", paper.learning_objectives, True),
        }
        char_errors: list[str] = []
        for field_key, (label, value, is_html) in char_limit_fields.items():
            cfg = builtin_cfg.get(field_key, {})
            if not cfg.get("visible", True):
                continue
            plain = strip_html_for_char_count(value) if is_html else (value or "").strip()
            min_c = cfg.get("min_chars")
            max_c = cfg.get("max_chars")
            if min_c is not None and len(plain) < min_c:
                char_errors.append(f"{label} must be at least {min_c} characters (currently {len(plain)})")
            if max_c is not None and len(plain) > max_c:
                char_errors.append(f"{label} must be at most {max_c} characters (currently {len(plain)})")
        if char_errors:
            raise SubmissionValidationError(
                "Character limit validation failed",
                char_errors=char_errors,
            )

    paper.status = PaperStatus.SUBMITTED.value
    paper.submitted_at = utcnow()
    await db.commit()
    paper = await _get_applicant_or_cospeaker_paper(db, str(paper.id), current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.post("/portal/papers/{paper_id}/unsubmit", response_model=PortalPaperResponse)
async def unsubmit_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalPaperResponse:
    """Revert a submitted paper back to draft. Only allowed when status is 'submitted'."""
    paper = await _get_applicant_or_cospeaker_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.SUBMITTED.value:
        raise ValidationError("Only submitted papers can be reverted to draft")

    paper.status = PaperStatus.DRAFT.value
    paper.submitted_at = None
    await db.commit()
    paper = await _get_applicant_or_cospeaker_paper(db, str(paper.id), current.applicant_id, current.tenant_id)
    return await _build_portal_paper_response(db, paper, current.applicant_id)


@router.delete("/portal/papers/{paper_id}")
async def delete_paper(
    paper_id: str,
    current: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Delete a draft paper."""
    paper = await _get_applicant_paper(db, paper_id, current.applicant_id, current.tenant_id)

    if paper.status != PaperStatus.DRAFT.value:
        raise ValidationError("Only draft papers can be deleted")

    await db.delete(paper)
    await db.commit()
    return {"message": "Paper deleted"}
