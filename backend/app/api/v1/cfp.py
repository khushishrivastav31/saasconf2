"""Call for Papers management endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.cfp import CallForPapers, Submission, CFPStatus, SubmissionStatus
from app.models.conference import Conference
from app.models.associations import ConferenceCFP
from app.schemas.cfp import (
    CFPCreate,
    CFPListResponse,
    CFPResponse,
    CFPUpdate,
    CFPStats,
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionUpdate,
    SubmissionStats,
)

router = APIRouter()

MODULE_CODE = "cfp"


def check_module_access(current_user) -> None:
    """Check if user has access to CFP module."""
    if not current_user.has_module(MODULE_CODE):
        raise ValidationError(f"Module '{MODULE_CODE}' is not enabled for your organization")


# ============ CFP Endpoints ============

@router.get("", response_model=CFPListResponse)
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
    check_module_access(current_user)

    query = select(CallForPapers).where(CallForPapers.tenant_id == current_user.tenant_id)

    if conference_id:
        query = query.join(
            ConferenceCFP, ConferenceCFP.cfp_id == CallForPapers.id
        ).where(ConferenceCFP.conference_id == conference_id)

    if status:
        query = query.where(CallForPapers.status == status)

    if search:
        search_filter = CallForPapers.title.ilike(f"%{search}%")
        query = query.where(search_filter)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(CallForPapers.created_at.desc())

    result = await db.execute(query)
    cfps = result.scalars().all()

    # Batch-query conference_ids and submission counts
    cfp_ids = [c.id for c in cfps]
    conf_ids_map: dict[UUID, list[UUID]] = {cid: [] for cid in cfp_ids}
    if cfp_ids:
        assoc_result = await db.execute(
            select(ConferenceCFP.cfp_id, ConferenceCFP.conference_id)
            .where(ConferenceCFP.cfp_id.in_(cfp_ids))
        )
        for row in assoc_result:
            conf_ids_map[row.cfp_id].append(row.conference_id)

    items = []
    for cfp in cfps:
        # Get submission count
        sub_count = (
            await db.execute(
                select(func.count()).where(Submission.cfp_id == cfp.id)
            )
        ).scalar() or 0

        items.append(
            CFPResponse(
                id=cfp.id,
                tenant_id=cfp.tenant_id,
                title=cfp.title,
                description=cfp.description,
                status=cfp.status,
                open_date=cfp.open_date,
                close_date=cfp.close_date,
                max_submissions_per_speaker=cfp.max_submissions_per_speaker,
                require_abstract=cfp.require_abstract,
                require_bio=cfp.require_bio,
                allowed_formats=cfp.allowed_formats,
                tracks=cfp.tracks,
                custom_fields=cfp.custom_fields,
                settings=cfp.settings,
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
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/stats", response_model=CFPStats)
async def get_cfp_stats(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CFPStats:
    """Get CFP statistics for the current tenant."""
    check_module_access(current_user)

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
        await db.execute(
            select(func.count()).where(
                Submission.tenant_id == current_user.tenant_id
            )
        )
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


@router.post("", response_model=CFPResponse, status_code=201)
async def create_cfp(
    cfp_data: CFPCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CFPResponse:
    """Create a new Call for Papers."""
    check_module_access(current_user)

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
        max_submissions_per_speaker=cfp_data.max_submissions_per_speaker,
        require_abstract=cfp_data.require_abstract,
        require_bio=cfp_data.require_bio,
        allowed_formats=cfp_data.allowed_formats,
        tracks=cfp_data.tracks,
        custom_fields=cfp_data.custom_fields,
        status=CFPStatus.DRAFT.value,
    )
    db.add(cfp)
    await db.flush()

    # Create conference association
    db.add(ConferenceCFP(
        conference_id=cfp_data.conference_id,
        cfp_id=cfp.id,
    ))

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
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        require_abstract=cfp.require_abstract,
        require_bio=cfp.require_bio,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        submission_count=0,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=[cfp_data.conference_id],
    )


@router.get("/{cfp_id}", response_model=CFPResponse)
async def get_cfp(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CFPResponse:
    """Get CFP by ID."""
    check_module_access(current_user)

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
    sub_count = (
        await db.execute(
            select(func.count()).where(Submission.cfp_id == cfp.id)
        )
    ).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(
        select(ConferenceCFP.conference_id)
        .where(ConferenceCFP.cfp_id == cfp.id)
    )
    conf_ids = [row[0] for row in assoc_result]

    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        require_abstract=cfp.require_abstract,
        require_bio=cfp.require_bio,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        submission_count=sub_count,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=conf_ids,
    )


@router.put("/{cfp_id}", response_model=CFPResponse)
async def update_cfp(
    cfp_id: UUID,
    cfp_data: CFPUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CFPResponse:
    """Update CFP details."""
    check_module_access(current_user)

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

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="cfp.update",
        resource_type="cfp",
        resource_id=cfp.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(cfp)

    # Get submission count
    sub_count = (
        await db.execute(
            select(func.count()).where(Submission.cfp_id == cfp.id)
        )
    ).scalar() or 0

    # Get conference_ids
    assoc_result = await db.execute(
        select(ConferenceCFP.conference_id)
        .where(ConferenceCFP.cfp_id == cfp.id)
    )
    conf_ids = [row[0] for row in assoc_result]

    return CFPResponse(
        id=cfp.id,
        tenant_id=cfp.tenant_id,
        title=cfp.title,
        description=cfp.description,
        status=cfp.status,
        open_date=cfp.open_date,
        close_date=cfp.close_date,
        max_submissions_per_speaker=cfp.max_submissions_per_speaker,
        require_abstract=cfp.require_abstract,
        require_bio=cfp.require_bio,
        allowed_formats=cfp.allowed_formats,
        tracks=cfp.tracks,
        custom_fields=cfp.custom_fields,
        settings=cfp.settings,
        submission_count=sub_count,
        created_at=cfp.created_at,
        updated_at=cfp.updated_at,
        conference_ids=conf_ids,
    )


@router.delete("/{cfp_id}")
async def delete_cfp(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a CFP."""
    check_module_access(current_user)

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


# ============ Submission Endpoints ============

@router.get("/{cfp_id}/submissions", response_model=SubmissionListResponse)
async def list_submissions(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
) -> SubmissionListResponse:
    """List submissions for a CFP."""
    check_module_access(current_user)

    # Verify CFP exists
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    if not cfp_result.scalar_one_or_none():
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    query = select(Submission).where(
        Submission.cfp_id == cfp_id,
        Submission.tenant_id == current_user.tenant_id,
    )

    if status:
        query = query.where(Submission.status == status)

    if search:
        search_filter = (
            Submission.title.ilike(f"%{search}%")
            | Submission.speaker_name.ilike(f"%{search}%")
            | Submission.speaker_email.ilike(f"%{search}%")
        )
        query = query.where(search_filter)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.order_by(Submission.submitted_at.desc())

    result = await db.execute(query)
    submissions = result.scalars().all()

    items = [
        SubmissionResponse(
            id=s.id,
            tenant_id=s.tenant_id,
            cfp_id=s.cfp_id,
            speaker_email=s.speaker_email,
            speaker_name=s.speaker_name,
            speaker_bio=s.speaker_bio,
            speaker_company=s.speaker_company,
            speaker_title=s.speaker_title,
            title=s.title,
            abstract=s.abstract,
            description=s.description,
            format=s.format,
            track=s.track,
            level=s.level,
            duration=s.duration,
            language=s.language,
            tags=s.tags,
            custom_answers=s.custom_answers,
            status=s.status,
            review_notes=s.review_notes,
            review_score=s.review_score,
            submitted_at=s.submitted_at,
            reviewed_at=s.reviewed_at,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in submissions
    ]

    return SubmissionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{cfp_id}/submissions/stats", response_model=SubmissionStats)
async def get_submission_stats(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SubmissionStats:
    """Get submission statistics for a CFP."""
    check_module_access(current_user)

    # Verify CFP exists
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    if not cfp_result.scalar_one_or_none():
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    base_query = select(Submission).where(Submission.cfp_id == cfp_id)

    # Total count
    total = (await db.execute(select(func.count()).select_from(base_query.subquery()))).scalar() or 0

    # Count by status
    status_counts = {}
    for status in SubmissionStatus:
        count = (
            await db.execute(
                select(func.count()).where(
                    Submission.cfp_id == cfp_id,
                    Submission.status == status.value,
                )
            )
        ).scalar() or 0
        status_counts[status.value] = count

    return SubmissionStats(
        total=total,
        submitted=status_counts.get("submitted", 0),
        under_review=status_counts.get("under_review", 0),
        accepted=status_counts.get("accepted", 0),
        rejected=status_counts.get("rejected", 0),
        waitlisted=status_counts.get("waitlisted", 0),
        withdrawn=status_counts.get("withdrawn", 0),
    )


@router.post("/{cfp_id}/submissions", response_model=SubmissionResponse, status_code=201)
async def create_submission(
    cfp_id: UUID,
    submission_data: SubmissionCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SubmissionResponse:
    """Create a new submission."""
    check_module_access(current_user)

    # Verify CFP exists and is open
    cfp_result = await db.execute(
        select(CallForPapers).where(
            CallForPapers.id == cfp_id,
            CallForPapers.tenant_id == current_user.tenant_id,
        )
    )
    cfp = cfp_result.scalar_one_or_none()

    if not cfp:
        raise NotFoundError(f"Call for Papers with ID '{cfp_id}' not found")

    submission = Submission(
        tenant_id=current_user.tenant_id,
        cfp_id=cfp_id,
        speaker_email=submission_data.speaker_email,
        speaker_name=submission_data.speaker_name,
        speaker_bio=submission_data.speaker_bio,
        speaker_company=submission_data.speaker_company,
        speaker_title=submission_data.speaker_title,
        title=submission_data.title,
        abstract=submission_data.abstract,
        description=submission_data.description,
        format=submission_data.format,
        track=submission_data.track,
        level=submission_data.level,
        duration=submission_data.duration,
        language=submission_data.language,
        tags=submission_data.tags,
        custom_answers=submission_data.custom_answers,
        status=SubmissionStatus.SUBMITTED.value,
    )
    db.add(submission)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="submission.create",
        resource_type="submission",
        resource_id=submission.id,
        details={"title": submission.title, "speaker": submission.speaker_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(submission)

    return SubmissionResponse(
        id=submission.id,
        tenant_id=submission.tenant_id,
        cfp_id=submission.cfp_id,
        speaker_email=submission.speaker_email,
        speaker_name=submission.speaker_name,
        speaker_bio=submission.speaker_bio,
        speaker_company=submission.speaker_company,
        speaker_title=submission.speaker_title,
        title=submission.title,
        abstract=submission.abstract,
        description=submission.description,
        format=submission.format,
        track=submission.track,
        level=submission.level,
        duration=submission.duration,
        language=submission.language,
        tags=submission.tags,
        custom_answers=submission.custom_answers,
        status=submission.status,
        review_notes=submission.review_notes,
        review_score=submission.review_score,
        submitted_at=submission.submitted_at,
        reviewed_at=submission.reviewed_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


@router.get("/{cfp_id}/submissions/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    cfp_id: UUID,
    submission_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SubmissionResponse:
    """Get submission by ID."""
    check_module_access(current_user)

    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.cfp_id == cfp_id,
            Submission.tenant_id == current_user.tenant_id,
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise NotFoundError(f"Submission with ID '{submission_id}' not found")

    return SubmissionResponse(
        id=submission.id,
        tenant_id=submission.tenant_id,
        cfp_id=submission.cfp_id,
        speaker_email=submission.speaker_email,
        speaker_name=submission.speaker_name,
        speaker_bio=submission.speaker_bio,
        speaker_company=submission.speaker_company,
        speaker_title=submission.speaker_title,
        title=submission.title,
        abstract=submission.abstract,
        description=submission.description,
        format=submission.format,
        track=submission.track,
        level=submission.level,
        duration=submission.duration,
        language=submission.language,
        tags=submission.tags,
        custom_answers=submission.custom_answers,
        status=submission.status,
        review_notes=submission.review_notes,
        review_score=submission.review_score,
        submitted_at=submission.submitted_at,
        reviewed_at=submission.reviewed_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


@router.put("/{cfp_id}/submissions/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    cfp_id: UUID,
    submission_id: UUID,
    submission_data: SubmissionUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SubmissionResponse:
    """Update submission details."""
    check_module_access(current_user)

    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.cfp_id == cfp_id,
            Submission.tenant_id == current_user.tenant_id,
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise NotFoundError(f"Submission with ID '{submission_id}' not found")

    update_data = submission_data.model_dump(exclude_unset=True)

    # Track status change for reviewed_at
    if "status" in update_data and update_data["status"] in ["accepted", "rejected", "waitlisted"]:
        submission.reviewed_at = datetime.utcnow()

    for field, value in update_data.items():
        setattr(submission, field, value)

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="submission.update",
        resource_type="submission",
        resource_id=submission.id,
        details=update_data,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(submission)

    return SubmissionResponse(
        id=submission.id,
        tenant_id=submission.tenant_id,
        cfp_id=submission.cfp_id,
        speaker_email=submission.speaker_email,
        speaker_name=submission.speaker_name,
        speaker_bio=submission.speaker_bio,
        speaker_company=submission.speaker_company,
        speaker_title=submission.speaker_title,
        title=submission.title,
        abstract=submission.abstract,
        description=submission.description,
        format=submission.format,
        track=submission.track,
        level=submission.level,
        duration=submission.duration,
        language=submission.language,
        tags=submission.tags,
        custom_answers=submission.custom_answers,
        status=submission.status,
        review_notes=submission.review_notes,
        review_score=submission.review_score,
        submitted_at=submission.submitted_at,
        reviewed_at=submission.reviewed_at,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
    )


@router.delete("/{cfp_id}/submissions/{submission_id}")
async def delete_submission(
    cfp_id: UUID,
    submission_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a submission."""
    check_module_access(current_user)

    result = await db.execute(
        select(Submission).where(
            Submission.id == submission_id,
            Submission.cfp_id == cfp_id,
            Submission.tenant_id == current_user.tenant_id,
        )
    )
    submission = result.scalar_one_or_none()

    if not submission:
        raise NotFoundError(f"Submission with ID '{submission_id}' not found")

    submission_title = submission.title

    # Audit log
    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="submission.delete",
        resource_type="submission",
        resource_id=submission_id,
        details={"title": submission_title, "speaker": submission.speaker_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(submission)
    await db.commit()

    return {"message": f"Submission '{submission_title}' deleted successfully"}
