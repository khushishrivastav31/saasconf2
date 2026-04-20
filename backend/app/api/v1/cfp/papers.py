"""Paper CRUD endpoints (list, stats, create, get, update, submit, unsubmit, delete, get assignments)."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.utils import utcnow
from app.models.associations import ConferenceCFP
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.cfp import (
    CallForPapers,
    CFPCommitteeMember,
    CFPPaper,
    CFPPaperAssignment,
    CFPPaperCospeaker,
    PaperStatus,
)
from app.models.customer_event import CustomerEventType
from app.models.review import PaperReview
from app.schemas.cfp import (
    PaperAssignmentListResponse,
    PaperAssignmentResponse,
    PaperCreate,
    PaperListResponse,
    PaperResponse,
    PaperStats,
    PaperUpdate,
)

from ._paper_helpers import (
    sync_paper_co_speakers,
    sync_paper_topics,
    validate_co_speakers,
    validate_main_speaker,
    validate_session_type,
    validate_topics,
)
from .shared import (
    MODULE_CODE,
    _build_paper_response,
    _build_paper_responses_batch,
    _paper_eager_options,
    _record_paper_customer_event,
    _reload_paper,
    _sync_speaker_role,
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Valid admin status transitions for PUT /papers/{paper_id}
# Other transitions go through dedicated endpoints (submit, unsubmit, etc.)
# ---------------------------------------------------------------------------
VALID_ADMIN_STATUS_TRANSITIONS: dict[str, set[str]] = {
    PaperStatus.DRAFT.value: {
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.SUBMITTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.IN_EVALUATION.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.EVALUATED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.FINAL_CONSIDERATION.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.ACCEPTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.REJECTED.value,
    },
    PaperStatus.REJECTED.value: {
        PaperStatus.DRAFT.value,
        PaperStatus.ACCEPTED.value,
    },
}


# ============ Paper Endpoints ============


@router.get("/papers", response_model=PaperListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_papers(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    cfp_id: UUID | None = None,
    conference_id: UUID | None = None,
    status: Literal["draft", "submitted", "in_evaluation", "evaluated", "final_consideration", "rejected", "accepted"]
    | None = None,
    main_speaker_id: UUID | None = None,
    applicant_id: UUID | None = Query(None, description="Filter papers where applicant is main speaker or co-speaker"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    search: str | None = Query(None, max_length=200, description="Search papers by title or speaker name"),
) -> PaperListResponse:
    """List papers for the current tenant with server-side pagination."""
    # Build base filter (shared between count and data queries)
    base_filter = select(CFPPaper).where(CFPPaper.tenant_id == current_user.require_tenant_id())

    if conference_id:
        base_filter = base_filter.join(ConferenceCFP, CFPPaper.cfp_id == ConferenceCFP.cfp_id).where(
            ConferenceCFP.conference_id == conference_id
        )

    if cfp_id:
        base_filter = base_filter.where(CFPPaper.cfp_id == cfp_id)

    if status:
        base_filter = base_filter.where(CFPPaper.status == status)

    if main_speaker_id:
        base_filter = base_filter.where(CFPPaper.main_speaker_id == main_speaker_id)

    if applicant_id:
        cospeaker_paper_ids = (
            select(CFPPaperCospeaker.paper_id).where(CFPPaperCospeaker.applicant_id == applicant_id).scalar_subquery()
        )
        base_filter = base_filter.where(
            (CFPPaper.main_speaker_id == applicant_id) | CFPPaper.id.in_(cospeaker_paper_ids)
        )

    if search:
        from app.models.cfp import CFPApplicant

        search_term = f"%{search}%"
        base_filter = base_filter.outerjoin(CFPApplicant, CFPPaper.main_speaker_id == CFPApplicant.id).where(
            CFPPaper.title.ilike(search_term)
            | CFPApplicant.first_name.ilike(search_term)
            | CFPApplicant.last_name.ilike(search_term)
        )

    # Count total matching rows
    count_query = select(func.count()).select_from(base_filter.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch paginated data with eager loads
    data_query = (
        base_filter.options(*_paper_eager_options())
        .order_by(CFPPaper.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(data_query)
    papers = list(result.scalars().all())

    items = await _build_paper_responses_batch(db, papers, current_user.require_tenant_id())

    return PaperListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/papers/stats", response_model=PaperStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    cfp_id: UUID | None = None,
) -> PaperStats:
    """Get paper statistics using SQL aggregation."""
    base = select(CFPPaper.status, func.count(CFPPaper.id)).where(
        CFPPaper.tenant_id == current_user.require_tenant_id()
    )

    if cfp_id:
        base = base.where(CFPPaper.cfp_id == cfp_id)

    result = await db.execute(base.group_by(CFPPaper.status))
    counts: dict[str, int] = dict(result.tuples().all())

    total = sum(counts.values())
    return PaperStats(
        total=total,
        draft=counts.get("draft", 0),
        submitted=counts.get("submitted", 0),
        in_evaluation=counts.get("in_evaluation", 0),
        evaluated=counts.get("evaluated", 0),
        rejected=counts.get("rejected", 0),
        accepted=counts.get("accepted", 0),
    )


@router.post(
    "/papers", response_model=PaperResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def create_paper(
    paper_data: PaperCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Create a new paper."""
    # Validate CFP exists and belongs to tenant
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == paper_data.cfp_id,
            CallForPapers.tenant_id == current_user.require_tenant_id(),
        )
    )
    cfp = cfp_result.scalar_one_or_none()
    if not cfp:
        raise NotFoundError(f"CFP with ID '{paper_data.cfp_id}' not found")

    # Validate related entities
    await validate_main_speaker(db, paper_data.main_speaker_id, current_user.require_tenant_id())
    if paper_data.co_speaker_ids:
        await validate_co_speakers(
            db, paper_data.co_speaker_ids, paper_data.main_speaker_id, current_user.require_tenant_id()
        )
    if paper_data.session_type_id:
        await validate_session_type(db, paper_data.session_type_id, current_user.require_tenant_id())
    if paper_data.topic_ids:
        await validate_topics(db, paper_data.topic_ids, current_user.require_tenant_id())

    # Create paper
    paper = CFPPaper(
        tenant_id=current_user.require_tenant_id(),
        cfp_id=paper_data.cfp_id,
        main_speaker_id=paper_data.main_speaker_id,
        session_type_id=paper_data.session_type_id,
        title=paper_data.title,
        abstract_short=paper_data.abstract_short,
        abstract_long=paper_data.abstract_long,
        level=paper_data.level,
        learning_objectives=paper_data.learning_objectives,
        status=PaperStatus.DRAFT.value,
    )
    db.add(paper)
    await db.flush()

    # Sync co-speakers and topics (delete is a no-op for new papers)
    if paper_data.co_speaker_ids:
        await sync_paper_co_speakers(db, paper.id, paper_data.co_speaker_ids)
    if paper_data.topic_ids:
        await sync_paper_topics(db, paper.id, paper_data.topic_ids)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="paper.create",
        resource_type="paper",
        resource_id=paper.id,
        details={"title": paper.title, "cfp_id": str(paper_data.cfp_id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper.id, current_user.require_tenant_id())

    return await _build_paper_response(db, paper, current_user.require_tenant_id())


@router.get("/papers/{paper_id}", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_paper(
    paper_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaperResponse:
    """Get a paper by ID."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.require_tenant_id(),
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    return await _build_paper_response(db, paper, current_user.require_tenant_id())


@router.put("/papers/{paper_id}", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_paper(
    paper_id: UUID,
    paper_data: PaperUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Update a paper."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.require_tenant_id(),
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    update_data = paper_data.model_dump(exclude_unset=True)

    # Validate main speaker if changing
    if "main_speaker_id" in update_data:
        await validate_main_speaker(db, update_data["main_speaker_id"], current_user.require_tenant_id())

    # Validate and sync co-speakers if changing
    if "co_speaker_ids" in update_data:
        co_speaker_ids = update_data.pop("co_speaker_ids")
        main_speaker_id = update_data.get("main_speaker_id", paper.main_speaker_id)
        if co_speaker_ids:
            await validate_co_speakers(db, co_speaker_ids, main_speaker_id, current_user.require_tenant_id())
        await sync_paper_co_speakers(db, paper_id, co_speaker_ids or [])

    # Validate session type if changing
    if update_data.get("session_type_id"):
        await validate_session_type(db, update_data["session_type_id"], current_user.require_tenant_id())

    # Validate and sync topics if changing
    if "topic_ids" in update_data:
        topic_ids = update_data.pop("topic_ids")
        if topic_ids:
            await validate_topics(db, topic_ids, current_user.require_tenant_id())
        await sync_paper_topics(db, paper_id, topic_ids or [])

    # level is now a plain string, no enum conversion needed

    # Validate and handle status transitions
    if update_data.get("status"):
        new_status = update_data["status"].value
        current_status = paper.status
        allowed = VALID_ADMIN_STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in allowed:
            from app.core.exceptions import ValidationError

            raise ValidationError(f"Cannot transition paper from '{current_status}' to '{new_status}'")
        update_data["status"] = new_status
        # Clear submitted_at, delete assignments & reviews when reverting to draft
        if new_status == PaperStatus.DRAFT.value:
            paper.submitted_at = None
            # Delete reviews first (ReviewAnswers cascade via FK)
            await db.execute(
                delete(PaperReview).where(
                    PaperReview.paper_id == paper_id,
                    PaperReview.tenant_id == current_user.require_tenant_id(),
                )
            )
            # Delete assignments
            await db.execute(
                delete(CFPPaperAssignment).where(
                    CFPPaperAssignment.paper_id == paper_id,
                    CFPPaperAssignment.tenant_id == current_user.require_tenant_id(),
                )
            )

    # Auto-assign/remove Speaker role on acceptance changes
    if update_data.get("status"):
        await _sync_speaker_role(
            db,
            paper,
            current_user.require_tenant_id(),
            new_status=update_data["status"],
            old_status=current_status,
            assigned_by=current_user.user_id,
        )

        # Emit a customer_events row for the speaker(s) when the admin moves a
        # paper to a customer-visible terminal state. Intermediate review steps
        # (in_evaluation / evaluated / final_consideration) don't surface.
        _CFP_EVENT_BY_STATUS = {
            PaperStatus.ACCEPTED.value: CustomerEventType.CFP_ACCEPTED,
            PaperStatus.REJECTED.value: CustomerEventType.CFP_REJECTED,
            PaperStatus.DRAFT.value: CustomerEventType.CFP_WITHDRAWN,
        }
        event_type = _CFP_EVENT_BY_STATUS.get(update_data["status"])
        if event_type is not None:
            await _record_paper_customer_event(db, paper, event_type, current_user)

    # Update remaining fields
    for field, value in update_data.items():
        setattr(paper, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="paper.update",
        resource_type="paper",
        resource_id=paper_id,
        details={"updated_fields": list(paper_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.require_tenant_id())

    return await _build_paper_response(db, paper, current_user.require_tenant_id())


@router.post(
    "/papers/{paper_id}/submit", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def submit_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Submit a paper (change status from draft to submitted)."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.require_tenant_id(),
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    if paper.status != PaperStatus.DRAFT.value:
        from app.core.exceptions import ValidationError

        raise ValidationError(f"Paper cannot be submitted. Current status: {paper.status}")

    paper.status = PaperStatus.SUBMITTED.value
    paper.submitted_at = utcnow()

    await _record_paper_customer_event(db, paper, CustomerEventType.CFP_SUBMITTED, current_user)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="paper.submit",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.require_tenant_id())

    return await _build_paper_response(db, paper, current_user.require_tenant_id())


@router.post(
    "/papers/{paper_id}/unsubmit", response_model=PaperResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def unsubmit_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> PaperResponse:
    """Revert a submitted paper back to draft."""
    result = await db.execute(
        select(CFPPaper)
        .options(*_paper_eager_options())
        .where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.require_tenant_id(),
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    if paper.status != PaperStatus.SUBMITTED.value:
        from app.core.exceptions import ValidationError

        raise ValidationError(f"Paper cannot be reverted to draft. Current status: {paper.status}")

    paper.status = PaperStatus.DRAFT.value
    paper.submitted_at = None

    # Delete reviews first (ReviewAnswers cascade via FK)
    await db.execute(
        delete(PaperReview).where(
            PaperReview.paper_id == paper_id,
            PaperReview.tenant_id == current_user.require_tenant_id(),
        )
    )
    # Delete assignments
    await db.execute(
        delete(CFPPaperAssignment).where(
            CFPPaperAssignment.paper_id == paper_id,
            CFPPaperAssignment.tenant_id == current_user.require_tenant_id(),
        )
    )

    await _record_paper_customer_event(db, paper, CustomerEventType.CFP_WITHDRAWN, current_user)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="paper.unsubmit",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    paper = await _reload_paper(db, paper_id, current_user.require_tenant_id())

    return await _build_paper_response(db, paper, current_user.require_tenant_id())


@router.delete("/papers/{paper_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_paper(
    paper_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a paper and its attachments."""
    result = await db.execute(
        select(CFPPaper).where(
            CFPPaper.id == paper_id,
            CFPPaper.tenant_id == current_user.require_tenant_id(),
        )
    )
    paper = result.scalar_one_or_none()

    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    paper_title = paper.title

    # Delete associated video attachment
    attachments_result = await db.execute(
        select(Attachment).where(
            Attachment.tenant_id == current_user.require_tenant_id(),
            Attachment.entity_type == "paper_video",
            Attachment.entity_id == paper_id,
        )
    )
    for attachment in attachments_result.scalars().all():
        await db.delete(attachment)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.require_tenant_id(),
        user_id=current_user.user_id,
        action="paper.delete",
        resource_type="paper",
        resource_id=paper_id,
        details={"title": paper_title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(paper)
    await db.commit()

    return {"message": f"Paper '{paper_title}' deleted successfully"}


@router.get(
    "/papers/{paper_id}/assignments",
    response_model=PaperAssignmentListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_paper_assignments(
    paper_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> PaperAssignmentListResponse:
    """Get all assignments for a specific paper."""
    paper_result = await db.execute(
        select(CFPPaper).where(CFPPaper.id == paper_id, CFPPaper.tenant_id == current_user.require_tenant_id())
    )
    paper = paper_result.scalar_one_or_none()
    if not paper:
        raise NotFoundError(f"Paper with ID '{paper_id}' not found")

    result = await db.execute(
        select(CFPPaperAssignment)
        .where(
            CFPPaperAssignment.paper_id == paper_id,
            CFPPaperAssignment.tenant_id == current_user.require_tenant_id(),
        )
        .order_by(CFPPaperAssignment.assigned_at.desc())
    )
    assignments = list(result.scalars().all())

    # Batch-load all committee members to avoid N+1
    member_ids = list({a.committee_member_id for a in assignments})
    members_map: dict = {}
    if member_ids:
        member_result = await db.execute(
            select(CFPCommitteeMember)
            .options(selectinload(CFPCommitteeMember.applicant))
            .where(CFPCommitteeMember.id.in_(member_ids))
        )
        members_map = {m.id: m for m in member_result.scalars().all()}

    items = []
    for a in assignments:
        member = members_map.get(a.committee_member_id)
        items.append(
            PaperAssignmentResponse(
                id=a.id,
                paper_id=a.paper_id,
                paper_title=paper.title,
                committee_member_id=a.committee_member_id,
                committee_member_first_name=member.applicant.first_name if member and member.applicant else None,
                committee_member_last_name=member.applicant.last_name if member and member.applicant else None,
                is_anonymous=a.is_anonymous,
                assigned_at=a.assigned_at,
            )
        )

    return PaperAssignmentListResponse(items=items, total=len(items))
