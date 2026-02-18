"""Applicant activity log endpoints (tenant admin only)."""

import csv
import io
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.file_validation import safe_content_disposition
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.utils import utcnow
from app.models.applicant_activity import ApplicantActivityLog, ApplicantActivityType

router = APIRouter()


class ApplicantActivityLogResponse(BaseModel):
    """Applicant activity log entry response."""

    id: UUID
    tenant_id: UUID
    applicant_id: UUID | None
    applicant_email: str
    applicant_first_name: str
    applicant_last_name: str
    activity_type: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ApplicantGroupedResponse(BaseModel):
    """Grouped applicant activities response."""

    applicant_email: str
    applicant_first_name: str
    applicant_last_name: str
    applicant_id: UUID | None
    activities: list[ApplicantActivityLogResponse]


class ApplicantActivityListResponse(BaseModel):
    """Paginated applicant activity log list response."""

    items: list[ApplicantActivityLogResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ApplicantGroupedListResponse(BaseModel):
    """Grouped applicant activity list response."""

    items: list[ApplicantGroupedResponse]
    total: int
    page: int
    page_size: int
    pages: int


def _build_activity_query(
    tenant_id: UUID,
    applicant_id: UUID | None = None,
    activity_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = None,
):
    """Build the activity log query with filters."""
    query = select(ApplicantActivityLog).where(ApplicantActivityLog.tenant_id == tenant_id)

    if applicant_id:
        query = query.where(ApplicantActivityLog.applicant_id == applicant_id)

    if activity_type:
        query = query.where(ApplicantActivityLog.activity_type == activity_type)

    if start_date:
        query = query.where(ApplicantActivityLog.created_at >= start_date)

    if end_date:
        query = query.where(ApplicantActivityLog.created_at <= end_date)

    if search:
        search_term = search
        query = query.where(
            or_(
                unaccent_ilike(ApplicantActivityLog.applicant_email, search_term),
                unaccent_ilike(ApplicantActivityLog.applicant_first_name, search_term),
                unaccent_ilike(ApplicantActivityLog.applicant_last_name, search_term),
            )
        )

    return query


def _log_to_response(log: ApplicantActivityLog) -> ApplicantActivityLogResponse:
    """Convert an ApplicantActivityLog model to response."""
    return ApplicantActivityLogResponse(
        id=log.id,
        tenant_id=log.tenant_id,
        applicant_id=log.applicant_id,
        applicant_email=log.applicant_email,
        applicant_first_name=log.applicant_first_name,
        applicant_last_name=log.applicant_last_name,
        activity_type=log.activity_type,
        created_at=log.created_at,
    )


@router.get("", response_model=ApplicantActivityListResponse)
async def list_applicant_activities(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    applicant_id: UUID | None = None,
    activity_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = Query(None, description="Search by email or name"),
) -> ApplicantActivityListResponse:
    """
    List applicant activity logs with filtering, search, and pagination.

    Only accessible by tenant admins.
    """
    query = _build_activity_query(
        tenant_id=current_user.tenant_id,
        applicant_id=applicant_id,
        activity_type=activity_type,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    query = query.order_by(ApplicantActivityLog.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [_log_to_response(log) for log in result.items]

    return ApplicantActivityListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.get("/grouped", response_model=ApplicantGroupedListResponse)
async def list_applicant_activities_grouped(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    activity_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = Query(None, description="Search by email or name"),
) -> ApplicantGroupedListResponse:
    """
    List applicant activity logs grouped by applicant.

    Returns activities bundled per user with pagination.
    Only accessible by tenant admins.
    """
    # Get unique emails with their most recent activity
    subquery = select(
        ApplicantActivityLog.applicant_email,
        func.max(ApplicantActivityLog.created_at).label("last_activity"),
    ).where(ApplicantActivityLog.tenant_id == current_user.tenant_id)

    if activity_type:
        subquery = subquery.where(ApplicantActivityLog.activity_type == activity_type)
    if start_date:
        subquery = subquery.where(ApplicantActivityLog.created_at >= start_date)
    if end_date:
        subquery = subquery.where(ApplicantActivityLog.created_at <= end_date)
    if search:
        search_term = search
        subquery = subquery.where(
            or_(
                unaccent_ilike(ApplicantActivityLog.applicant_email, search_term),
                unaccent_ilike(ApplicantActivityLog.applicant_first_name, search_term),
                unaccent_ilike(ApplicantActivityLog.applicant_last_name, search_term),
            )
        )

    subquery = subquery.group_by(ApplicantActivityLog.applicant_email)

    # Count total unique emails
    count_result = await db.execute(select(func.count()).select_from(subquery.subquery()))
    total = count_result.scalar() or 0

    # Get paginated unique emails sorted by most recent activity
    subquery = subquery.order_by(func.max(ApplicantActivityLog.created_at).desc())
    subquery = subquery.offset((page - 1) * page_size).limit(page_size)

    email_result = await db.execute(subquery)
    emails = [row[0] for row in email_result.fetchall()]

    # Now get all activities for those emails
    grouped_items = []
    for email in emails:
        activities_query = (
            select(ApplicantActivityLog)
            .where(ApplicantActivityLog.tenant_id == current_user.tenant_id)
            .where(ApplicantActivityLog.applicant_email == email)
        )

        if activity_type:
            activities_query = activities_query.where(ApplicantActivityLog.activity_type == activity_type)
        if start_date:
            activities_query = activities_query.where(ApplicantActivityLog.created_at >= start_date)
        if end_date:
            activities_query = activities_query.where(ApplicantActivityLog.created_at <= end_date)

        activities_query = activities_query.order_by(ApplicantActivityLog.created_at.desc())

        result = await db.execute(activities_query)
        activities = result.scalars().all()

        if activities:
            first_activity = activities[0]
            grouped_items.append(
                ApplicantGroupedResponse(
                    applicant_email=first_activity.applicant_email,
                    applicant_first_name=first_activity.applicant_first_name,
                    applicant_last_name=first_activity.applicant_last_name,
                    applicant_id=first_activity.applicant_id,
                    activities=[_log_to_response(a) for a in activities],
                )
            )

    return ApplicantGroupedListResponse(
        items=grouped_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(total, page_size) or 1,
    )


@router.get("/activity-types")
async def list_activity_types(
    current_user: TenantAdminDep,
) -> list[str]:
    """Get list of all possible activity types."""
    return [t.value for t in ApplicantActivityType]


@router.get("/export")
async def export_applicant_activities(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    applicant_id: UUID | None = None,
    activity_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = Query(None, description="Search by email or name"),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
) -> StreamingResponse:
    """
    Export applicant activity logs as CSV file.

    Only accessible by tenant admins.
    """
    query = _build_activity_query(
        tenant_id=current_user.tenant_id,
        applicant_id=applicant_id,
        activity_type=activity_type,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    query = query.order_by(ApplicantActivityLog.created_at.desc()).limit(max_rows)

    filename = f"applicant_activity_{utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    async def _generate():
        # BOM + header
        header_buf = io.StringIO()
        writer = csv.writer(header_buf)
        writer.writerow(
            [
                "Timestamp",
                "Email",
                "First Name",
                "Last Name",
                "Activity Type",
            ]
        )
        yield b"\xef\xbb\xbf" + header_buf.getvalue().encode("utf-8")

        # Stream rows in batches
        batch_size = 1000
        offset = 0
        while True:
            batch_query = query.offset(offset).limit(batch_size)
            result = await db.execute(batch_query)
            logs = result.scalars().all()
            if not logs:
                break

            chunk = io.StringIO()
            w = csv.writer(chunk)
            for log in logs:
                w.writerow(
                    [
                        log.created_at.isoformat(),
                        log.applicant_email,
                        log.applicant_first_name,
                        log.applicant_last_name,
                        log.activity_type,
                    ]
                )
            yield chunk.getvalue().encode("utf-8")

            if len(logs) < batch_size:
                break
            offset += batch_size

    return StreamingResponse(
        _generate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": safe_content_disposition(filename),
        },
    )
