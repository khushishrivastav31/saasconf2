"""CFP CRUD and stats endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy import update as sa_update

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    get_client_ip,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.models.associations import ConferenceCFP
from app.models.audit import AuditLog
from app.models.cfp import (
    CallForPapers,
    CFPPaper,
    CFPPaperAssignment,
    CFPStatus,
    Submission,
)
from app.models.conference import Conference
from app.schemas.cfp import (
    CFPCreate,
    CFPListResponse,
    CFPResponse,
    CFPStats,
    CFPUpdate,
)

from .shared import MODULE_CODE

router = APIRouter()


@router.get("/", response_model=CFPListResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def list_cfps(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
    conference_id: UUID | None = None,
) -> CFPListResponse:
    """List Call for Papers for the current tenant."""
    query = select(CallForPapers).where(CallForPapers.tenant_id == current_user.tenant_id)

    if conference_id:
        query = query.join(ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id).where(
            ConferenceCFP.conference_id == conference_id
        )

    if status:
        query = query.where(CallForPapers.status == status)

    if search:
        search_filter = unaccent_ilike(CallForPapers.title, search)
        query = query.where(search_filter)

    query = query.order_by(CallForPapers.created_at.desc())
    result = await paginate(db, query, page, page_size)
    cfps = result.items
    total = result.total

    # Batch-query conference_ids and submission counts
    cfp_ids = [c.id for c in cfps]
    conf_ids_map: dict[UUID, list[UUID]] = {cid: [] for cid in cfp_ids}
    if cfp_ids:
        assoc_result = await db.execute(
            select(ConferenceCFP.cfp_id, ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.cfp_id].append(row.conference_id)

    items = []
    for cfp in cfps:
        # Get submission count
        sub_count = (await db.execute(select(func.count()).where(Submission.cfp_id == cfp.id))).scalar() or 0

        items.append(
            CFPResponse(
                id=cfp.id,
                tenant_id=cfp.tenant_id,
                title=cfp.title,
                description=cfp.description,
                status=cfp.status,
                open_date=cfp.open_date,
                close_date=cfp.close_date,
                notification_date=cfp.notification_date,
                program_announcement_date=cfp.program_announcement_date,
                max_submissions_per_speaker=cfp.max_submissions_per_speaker,
                required_speaker_fields=cfp.required_speaker_fields,
                required_paper_fields=cfp.required_paper_fields,
                is_anonymous_review=cfp.is_anonymous_review,
                reviewers_per_paper=cfp.reviewers_per_paper,
                allowed_formats=cfp.allowed_formats,
                tracks=cfp.tracks,
                custom_fields=cfp.custom_fields,
                settings=cfp.settings,
                code_of_conduct=cfp.code_of_conduct,
                incentives_conditions=cfp.incentives_conditions,
                tips_for_submission=cfp.tips_for_submission,
                guidelines_for_submissions=cfp.guidelines_for_submissions,
                faqs=cfp.faqs,
                submission_count=sub_count,
                created_at=cfp.created_at,
                updated_at=cfp.updated_at,
                conference_ids=conf_ids_map.get(cfp.id, []),
            )
        )

    return CFPListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(total, page_size),
    )


@router.get("/stats", response_model=CFPStats, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_cfp_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CFPStats:
    """Get CFP statistics for the current tenant."""

    base_query = select(CallForPapers).where(CallForPapers.tenant_id == current_user.tenant_id)

    # Total count
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0

    # Count by status
    status_counts = {}
    for status in CFPStatus:
        count = (
            await db.execute(
                select(func.count()).where(
                    CallForPapers.tenant_id == current_user.tenant_id,
                    CallForPapers.status == status.value,
                )
            )
        ).scalar() or 0
        status_counts[status.value] = count

    # Total submissions
    total_submissions = (
        await db.execute(select(func.count()).where(Submission.tenant_id == current_user.tenant_id))
    ).scalar() or 0

    return CFPStats(
        total=total,
        draft=status_counts.get("draft", 0),
        open=status_counts.get("open", 0),
        closed=status_counts.get("closed", 0),
        review=status_counts.get("review", 0),
        completed=status_counts.get("completed", 0),
        total_submissions=total_submissions,
    )


@router.post("/", response_model=CFPResponse, status_code=201, dependencies=[Depends(require_module(MODULE_CODE))])
async def create_cfp(
    cfp_data: CFPCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CFPResponse:
    """Create a new Call for Papers."""

    # Validate conference exists and belongs to tenant
    conf_result = await db.execute(
        select(Conference).where(
            Conference.id == cfp_data.conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    if not conf_result.scalar_one_or_none():
        raise NotFoundError(f"Conference with ID '{cfp_data.conference_id}' not found")

    cfp = CallForPapers(
        tenant_id=current_user.tenant_id,
        title=cfp_data.title,
        description=cfp_data.description,
        open_date=cfp_data.open_date,
        close_date=cfp_data.close_date,
        notification_date=cfp_data.notification_date,
        program_announcement_date=cfp_data.program_announcement_date,
        max_submissions_per_speaker=cfp_data.max_submissions_per_speaker,
        required_speaker_fields=cfp_data.required_speaker_fields,
        required_paper_fields=cfp_data.required_paper_fields,
        allowed_formats=cfp_data.allowed_formats,
        tracks=cfp_data.tracks,
        custom_fields=cfp_data.custom_fields,
        code_of_conduct=cfp_data.code_of_conduct,
        incentives_conditions=cfp_data.incentives_conditions,
        tips_for_submission=cfp_data.tips_for_submission,
        guidelines_for_submissions=cfp_data.guidelines_for_submissions,
        faqs=cfp_data.faqs,
        status=CFPStatus.DRAFT.value,
    )
    db.add(cfp)
    await db.flush()

    # Create conference association
    db.add(
        ConferenceCFP(
            conference_id=cfp_data.conference_id,
            cfp_id=cfp.id,
        )
    )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="cfp.create",
        resource_type="cfp",
        resource_id=cfp.id,
        details={"title": cfp.title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(cfp)

    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        notification_date=cfp.notification_date,
        program_announcement_date=cfp.program_announcement_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        required_speaker_fields=cfp.required_speaker_fields,
        required_paper_fields=cfp.required_paper_fields,
        is_anonymous_review=cfp.is_anonymous_review,
        reviewers_per_paper=cfp.reviewers_per_paper,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        code_of_conduct=cfp.code_of_conduct,
        incentives_conditions=cfp.incentives_conditions,
        tips_for_submission=cfp.tips_for_submission,
        guidelines_for_submissions=cfp.guidelines_for_submissions,
        faqs=cfp.faqs,
        submission_count=0,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=[cfp_data.conference_id],
    )


@router.get("/{cfp_id}", response_model=CFPResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def get_cfp(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CFPResponse:
    """Get CFP by ID."""

    result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    cfp = result.scalar_one_or_none()

    if not cfp:
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    # Get submission count
    sub_count = (await db.execute(select(func.count()).where(Submission.cfp_id == cfp.id))).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == cfp.id))
    conf_ids = [row[0] for row in assoc_result]

    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        notification_date=cfp.notification_date,
        program_announcement_date=cfp.program_announcement_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        required_speaker_fields=cfp.required_speaker_fields,
        required_paper_fields=cfp.required_paper_fields,
        is_anonymous_review=cfp.is_anonymous_review,
        reviewers_per_paper=cfp.reviewers_per_paper,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        code_of_conduct=cfp.code_of_conduct,
        incentives_conditions=cfp.incentives_conditions,
        tips_for_submission=cfp.tips_for_submission,
        guidelines_for_submissions=cfp.guidelines_for_submissions,
        faqs=cfp.faqs,
        submission_count=sub_count,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=conf_ids,
    )


@router.put("/{cfp_id}", response_model=CFPResponse, dependencies=[Depends(require_module(MODULE_CODE))])
async def update_cfp(
    cfp_id: UUID,
    cfp_data: CFPUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CFPResponse:
    """Update CFP details."""

    result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    cfp = result.scalar_one_or_none()

    if not cfp:
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    update_data = cfp_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(cfp, field, value)

    # When is_anonymous_review changes, propagate to all existing assignments
    if "is_anonymous_review" in update_data:
        paper_ids_subq = select(CFPPaper.id).where(CFPPaper.cfp_id == cfp.id)
        await db.execute(
            sa_update(CFPPaperAssignment)
            .where(CFPPaperAssignment.paper_id.in_(paper_ids_subq))
            .values(is_anonymous=update_data["is_anonymous_review"])
        )

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="cfp.update",
        resource_type="cfp",
        resource_id=cfp.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(cfp)

    # Get submission count
    sub_count = (await db.execute(select(func.count()).where(Submission.cfp_id == cfp.id))).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(select(ConferenceCFP.conference_id).where(ConferenceCFP.cfp_id == cfp.id))
    conf_ids = [row[0] for row in assoc_result]

    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        notification_date=cfp.notification_date,
        program_announcement_date=cfp.program_announcement_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        required_speaker_fields=cfp.required_speaker_fields,
        required_paper_fields=cfp.required_paper_fields,
        is_anonymous_review=cfp.is_anonymous_review,
        reviewers_per_paper=cfp.reviewers_per_paper,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        code_of_conduct=cfp.code_of_conduct,
        incentives_conditions=cfp.incentives_conditions,
        tips_for_submission=cfp.tips_for_submission,
        guidelines_for_submissions=cfp.guidelines_for_submissions,
        faqs=cfp.faqs,
        submission_count=sub_count,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=conf_ids,
    )


@router.delete("/{cfp_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_cfp(
    cfp_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a CFP."""

    result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    cfp = result.scalar_one_or_none()

    if not cfp:
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    cfp_title = cfp.title

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="cfp.delete",
        resource_type="cfp",
        resource_id=cfp_id,
        details={"title": cfp_title},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(cfp)
    await db.commit()

    return {"message": f"Call for Papers '{cfp_title}' deleted successfully"}
