"""Base service with shared DB utilities for conference-scoped resources.

Provides reusable helpers that every domain service inherits:
- ``resolve_conference`` -- fetch + tenant-verify a conference
- ``paginate`` -- LIMIT/OFFSET pagination returning items + total
- ``get_or_404`` -- single-row fetch with tenant guard
- ``apply_filters`` -- declarative column filter application
- ``require_admin`` -- conference-level admin permission check
- ``create_audit_log`` -- standardised audit trail entry
"""

from __future__ import annotations

from typing import Any, Sequence
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthorizationError, NotFoundError
from app.core.pagination import PaginatedResult, calculate_pages
from app.models.conference import Conference


class BaseService:
    """Stateless helper mixin -- all methods are ``@staticmethod`` so that
    callers never need to instantiate the class (but may subclass it for
    domain-specific conveniences).
    """

    # ------------------------------------------------------------------
    # Conference resolution
    # ------------------------------------------------------------------

    @staticmethod
    async def resolve_conference(
        db: AsyncSession,
        conference_id: UUID,
        tenant_id: UUID,
    ) -> Conference:
        """Fetch a conference and verify it belongs to *tenant_id*.

        Raises ``NotFoundError`` when no matching conference exists.
        """
        result = await db.execute(
            select(Conference).where(
                Conference.id == conference_id,
                Conference.tenant_id == tenant_id,
            )
        )
        conference = result.scalar_one_or_none()
        if not conference:
            raise NotFoundError("Conference not found")
        return conference

    # ------------------------------------------------------------------
    # Pagination
    # ------------------------------------------------------------------

    @staticmethod
    async def paginate(
        db: AsyncSession,
        query: Select,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedResult:
        """Apply LIMIT/OFFSET to *query* and return items + total count."""
        count_query = select(func.count()).select_from(query.subquery())
        total: int = (await db.execute(count_query)).scalar() or 0

        paginated = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(paginated)
        items = list(result.scalars().all())

        return PaginatedResult(items=items, total=total)

    @staticmethod
    def calculate_pages(total: int, page_size: int) -> int:
        """Return the number of pages for a given *total* and *page_size*."""
        return calculate_pages(total, page_size)

    # ------------------------------------------------------------------
    # Single-row fetch
    # ------------------------------------------------------------------

    @staticmethod
    async def get_or_404(
        db: AsyncSession,
        model: type,
        id: UUID,  # noqa: A002 -- intentionally shadowing built-in for clarity
        *,
        tenant_id: UUID | None = None,
        conference_id: UUID | None = None,
        label: str | None = None,
    ) -> Any:
        """Fetch a single row by primary key with optional tenant/conference guard.

        Raises ``NotFoundError`` when the row does not exist or the tenant/
        conference check fails.
        """
        conditions: list = [model.id == id]
        if tenant_id is not None:
            conditions.append(model.tenant_id == tenant_id)
        if conference_id is not None:
            conditions.append(model.conference_id == conference_id)

        result = await db.execute(select(model).where(*conditions))
        row = result.scalar_one_or_none()
        if not row:
            entity_name = label or model.__name__
            raise NotFoundError(f"{entity_name} with ID '{id}' not found")
        return row

    # ------------------------------------------------------------------
    # Declarative filter application
    # ------------------------------------------------------------------

    @staticmethod
    def apply_filters(
        query: Select,
        filters: Sequence[tuple[Any, Any]],
    ) -> Select:
        """Apply a sequence of ``(column_expression, value)`` filters.

        Filters whose *value* is ``None`` are silently skipped so callers can
        pass optional query-params directly::

            query = BaseService.apply_filters(query, [
                (Sponsor.is_active == is_active, is_active),
                (Sponsor.sponsor_package_id == pkg_id, pkg_id),
            ])
        """
        for condition, value in filters:
            if value is not None:
                query = query.where(condition)
        return query

    # ------------------------------------------------------------------
    # Admin permission check
    # ------------------------------------------------------------------

    @staticmethod
    async def require_admin(
        db: AsyncSession,
        current_user: Any,
        conference_id: UUID,
    ) -> None:
        """Verify *current_user* has admin access to the conference.

        Super-admins and tenant-admins pass automatically.  For other users the
        ``UserConferenceAccess`` table is checked.

        Raises ``AuthorizationError`` when the user lacks access.
        """
        if current_user.is_super_admin or current_user.is_tenant_admin:
            return

        from app.core.dependencies import check_conference_admin_access

        has_access = await check_conference_admin_access(
            db, current_user.user_id, conference_id
        )
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")

    # ------------------------------------------------------------------
    # Audit logging
    # ------------------------------------------------------------------

    @staticmethod
    def create_audit_log(
        *,
        tenant_id: UUID,
        user_id: UUID,
        action: str,
        resource_type: str,
        resource_id: UUID,
        details: dict | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Any:
        """Build (but do **not** add/commit) an ``AuditLog`` instance."""
        from app.models.audit import AuditLog

        return AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
