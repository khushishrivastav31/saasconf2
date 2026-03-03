"""CFP Submission endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

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
from app.core.utils import utcnow
from app.models.audit import AuditLog
from app.models.cfp import (
    CallForPapers,
    Submission,
    SubmissionStatus,
)
from app.schemas.cfp import (
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionStats,
    SubmissionUpdate,
)

from .shared import MODULE_CODE

router = APIRouter()


@router.get(
    "/{cfp_id}/submissions", response_model=SubmissionListResponse, dependencies=[Depends(require_module(MODULE_CODE))]
)
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
            unaccent_ilike(Submission.title, search)
            | unaccent_ilike(Submission.speaker_first_name, search)
            | unaccent_ilike(Submission.speaker_last_name, search)
            | unaccent_ilike(Submission.speaker_email, search)
        )
        query = query.where(search_filter)

    query = query.order_by(Submission.submitted_at.desc())
    result = await paginate(db, query, page, page_size)
    submissions = result.items
    total = result.total

    items = [
        SubmissionResponse(
            id=s.id,
            tenant_id=s.tenant_id,
            cfp_id=s.cfp_id,
            speaker_email=s.speaker_email,
            speaker_first_name=s.speaker_first_name,
            speaker_last_name=s.speaker_last_name,
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
        pages=calculate_pages(total, page_size),
    )


@router.get(
    "/{cfp_id}/submissions/stats", response_model=SubmissionStats, dependencies=[Depends(require_module(MODULE_CODE))]
)
async def get_submission_stats(
    cfp_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SubmissionStats:
    """Get submission statistics for a CFP."""

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


@router.post(
    "/{cfp_id}/submissions",
    response_model=SubmissionResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_submission(
    cfp_id: UUID,
    submission_data: SubmissionCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SubmissionResponse:
    """Create a new submission."""

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
        speaker_first_name=submission_data.speaker_first_name,
        speaker_last_name=submission_data.speaker_last_name,
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
        details={
            "title": submission.title,
            "speaker": f"{submission.speaker_first_name} {submission.speaker_last_name}",
        },
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
        speaker_first_name=submission.speaker_first_name,
        speaker_last_name=submission.speaker_last_name,
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


@router.get(
    "/{cfp_id}/submissions/{submission_id}",
    response_model=SubmissionResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_submission(
    cfp_id: UUID,
    submission_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SubmissionResponse:
    """Get submission by ID."""

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
        speaker_first_name=submission.speaker_first_name,
        speaker_last_name=submission.speaker_last_name,
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


@router.put(
    "/{cfp_id}/submissions/{submission_id}",
    response_model=SubmissionResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_submission(
    cfp_id: UUID,
    submission_id: UUID,
    submission_data: SubmissionUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SubmissionResponse:
    """Update submission details."""

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
        submission.reviewed_at = utcnow()

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
        speaker_first_name=submission.speaker_first_name,
        speaker_last_name=submission.speaker_last_name,
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


@router.delete("/{cfp_id}/submissions/{submission_id}", dependencies=[Depends(require_module(MODULE_CODE))])
async def delete_submission(
    cfp_id: UUID,
    submission_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a submission."""

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
        details={
            "title": submission_title,
            "speaker": f"{submission.speaker_first_name} {submission.speaker_last_name}",
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(submission)
    await db.commit()

    return {"message": f"Submission '{submission_title}' deleted successfully"}
