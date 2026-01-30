"""Audit log endpoints (super admin only)."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, SuperAdminDep
from app.core.pagination import paginate
from app.models.audit import AuditLog

router = APIRouter()


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

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated audit log list response."""

    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
    pages: int


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
) -> AuditLogListResponse:
    """
    List audit logs with filtering and pagination.

    Only accessible by super admins.
    """
    query = select(AuditLog)

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

    # Apply ordering and pagination
    query = query.order_by(AuditLog.created_at.desc())
    result = await paginate(db, query, page, page_size)

    items = [
        AuditLogResponse(
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
        )
        for log in result.items
    ]

    return AuditLogListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=(result.total + page_size - 1) // page_size,
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
