"""Audit log endpoints (super admin only)."""

import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.csv_export import stream_csv_export
from app.core.dependencies import DbSessionDep, SuperAdminDep
from app.core.pagination import calculate_pages, paginate
from app.core.search import unaccent_ilike
from app.core.security.pii_crypto import hash_email, read_pii
from app.core.utils import utcnow
from app.models.audit import AuditLog
from app.models.user import User

router = APIRouter()


class AuditLogUserResponse(BaseModel):
    """User details in audit log response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    first_name: str | None
    last_name: str | None


class AuditLogTenantResponse(BaseModel):
    """Tenant details in audit log response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str


class AuditLogResponse(BaseModel):
    """Audit log entry response."""

    id: UUID
    tenant_id: UUID | None
    user_id: UUID | None
    action: str
    resource_type: str | None
    resource_id: UUID | None
    details: dict
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    # Include user and tenant details
    user: AuditLogUserResponse | None = None
    tenant: AuditLogTenantResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    """Paginated audit log list response."""

    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
    pages: int


def _build_audit_query(
    tenant_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = None,
):
    """Build the audit log query with filters."""
    query = select(AuditLog).options(
        selectinload(AuditLog.user),
        selectinload(AuditLog.tenant),
    )

    # Apply filters
    if tenant_id:
        query = query.where(AuditLog.tenant_id == tenant_id)

    if user_id:
        query = query.where(AuditLog.user_id == user_id)

    if action:
        query = query.where(AuditLog.action == action)

    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)

    if start_date:
        query = query.where(AuditLog.created_at >= start_date)

    if end_date:
        query = query.where(AuditLog.created_at <= end_date)

    # Text search - search in action, resource_type, ip_address, and details
    if search:
        search_term = search
        clauses = [
            unaccent_ilike(AuditLog.action, search_term),
            unaccent_ilike(AuditLog.resource_type, search_term),
            unaccent_ilike(func.cast(AuditLog.ip_address, String), search_term),
            unaccent_ilike(func.cast(AuditLog.details, String), search_term),
            unaccent_ilike(User.first_name, search_term),
            unaccent_ilike(User.last_name, search_term),
        ]
        # Email is encrypted — only exact hash lookup is possible.
        if "@" in search_term:
            clauses.append(User.email_hash == hash_email(search_term))
        query = query.outerjoin(AuditLog.user).where(or_(*clauses))

    return query


def _log_to_response(log: AuditLog) -> AuditLogResponse:
    """Convert an AuditLog model to response."""
    return AuditLogResponse(
        id=log.id,
        tenant_id=log.tenant_id,
        user_id=log.user_id,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        details=log.details,
        ip_address=str(log.ip_address) if log.ip_address else None,
        user_agent=log.user_agent,
        created_at=log.created_at,
        user=AuditLogUserResponse(
            id=log.user.id,
            email=read_pii(log.user, "email") or "",
            first_name=log.user.first_name,
            last_name=log.user.last_name,
        )
        if log.user
        else None,
        tenant=AuditLogTenantResponse(
            id=log.tenant.id,
            name=log.tenant.name,
            slug=log.tenant.slug,
        )
        if log.tenant
        else None,
    )


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    current_user: SuperAdminDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    tenant_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = Query(None, max_length=200, description="Search in action, user, IP, or details"),
) -> AuditLogListResponse:
    """
    List audit logs with filtering, search, and pagination.

    Only accessible by super admins.
    """
    query = _build_audit_query(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    # Apply ordering and pagination
    query = query.order_by(AuditLog.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [_log_to_response(log) for log in result.items]

    return AuditLogListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=calculate_pages(result.total, page_size),
    )


@router.get("/actions")
async def list_audit_actions(
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> list[str]:
    """Get list of all distinct audit actions in the system."""
    result = await db.execute(select(AuditLog.action).distinct())
    actions = result.scalars().all()
    return sorted(actions)


@router.get("/resource-types")
async def list_resource_types(
    current_user: SuperAdminDep,
    db: DbSessionDep,
) -> list[str]:
    """Get list of all distinct resource types in the system."""
    result = await db.execute(select(AuditLog.resource_type).distinct().where(AuditLog.resource_type.isnot(None)))
    resource_types = result.scalars().all()
    return sorted([rt for rt in resource_types if rt])


@router.get("/export")
async def export_audit_logs(
    current_user: SuperAdminDep,
    db: DbSessionDep,
    tenant_id: UUID | None = None,
    user_id: UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    search: str | None = Query(None, max_length=200, description="Search in action, user, IP, or details"),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
) -> StreamingResponse:
    """
    Export audit logs as CSV file.

    Only accessible by super admins.
    """
    query = _build_audit_query(
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    # Apply ordering and limit
    query = query.order_by(AuditLog.created_at.desc()).limit(max_rows)

    filename = f"audit_logs_{utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    def _map_audit_row(log: AuditLog) -> list[str]:
        user_email = (read_pii(log.user, "email") or "") if log.user else ""
        user_name = ""
        if log.user:
            names = [log.user.first_name, log.user.last_name]
            user_name = " ".join(n for n in names if n)
        tenant_name = log.tenant.name if log.tenant else ""
        return [
            log.created_at.isoformat(),
            log.action,
            log.resource_type or "",
            str(log.resource_id) if log.resource_id else "",
            user_email,
            user_name,
            tenant_name,
            str(log.ip_address) if log.ip_address else "",
            log.user_agent or "",
            json.dumps(log.details) if log.details else "",
        ]

    return await stream_csv_export(
        db=db,
        query=query,
        headers=[
            "Timestamp",
            "Action",
            "Resource Type",
            "Resource ID",
            "User Email",
            "User Name",
            "Tenant",
            "IP Address",
            "User Agent",
            "Details",
        ],
        row_mapper=_map_audit_row,
        filename=filename,
    )
