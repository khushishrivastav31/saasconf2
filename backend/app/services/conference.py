"""Conference-scoped CRUD service.

``ConferenceService`` builds on :class:`BaseService` to provide high-level
helpers that most conference-scoped endpoint files need:

- **list_resources** -- paginated + filtered listing
- **get_resource** -- single-row fetch scoped to conference + tenant
- **create_resource** -- insert, optional audit-log, commit + refresh
- **update_resource** -- partial update via ``model_dump(exclude_unset=True)``
- **delete_resource** -- delete row (+ optional related cleanup), audit-log, commit
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PaginatedResult
from app.services.base import BaseService


class ConferenceService(BaseService):
    """Stateless helpers for conference-scoped resources."""

    # ------------------------------------------------------------------
    # Listing
    # ------------------------------------------------------------------

    @staticmethod
    async def list_resources(
        db: AsyncSession,
        query: Select,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedResult:
        """Execute a pre-built query with pagination.

        This is a thin convenience wrapper so that callers do not need to
        import ``BaseService.paginate`` separately.
        """
        return await BaseService.paginate(db, query, page, page_size)

    # ------------------------------------------------------------------
    # Single-row fetch (conference-scoped)
    # ------------------------------------------------------------------

    @staticmethod
    async def get_resource(
        db: AsyncSession,
        model: type,
        resource_id: UUID,
        *,
        conference_id: UUID,
        tenant_id: UUID,
        label: str | None = None,
    ) -> Any:
        """Fetch a single row scoped to *conference_id* and *tenant_id*.

        Raises ``NotFoundError`` when no matching row exists.
        """
        return await BaseService.get_or_404(
            db,
            model,
            resource_id,
            tenant_id=tenant_id,
            conference_id=conference_id,
            label=label,
        )

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    @staticmethod
    async def create_resource(
        db: AsyncSession,
        instance: Any,
        *,
        audit_log: Any | None = None,
    ) -> Any:
        """Add *instance* (and an optional *audit_log*), commit, and refresh.

        Returns the refreshed *instance*.
        """
        db.add(instance)
        if audit_log is not None:
            db.add(audit_log)
        await db.commit()
        await db.refresh(instance)
        return instance

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    @staticmethod
    async def update_resource(
        db: AsyncSession,
        instance: Any,
        update_data: dict[str, Any],
        *,
        audit_log: Any | None = None,
    ) -> Any:
        """Apply *update_data* fields to *instance*, commit, and refresh.

        Returns the refreshed *instance*.
        """
        for field, value in update_data.items():
            setattr(instance, field, value)

        if audit_log is not None:
            db.add(audit_log)

        await db.commit()
        await db.refresh(instance)
        return instance

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    @staticmethod
    async def delete_resource(
        db: AsyncSession,
        instance: Any,
        *,
        audit_log: Any | None = None,
    ) -> None:
        """Delete *instance* (with optional audit-log), then commit."""
        if audit_log is not None:
            db.add(audit_log)

        await db.delete(instance)
        await db.commit()

    @staticmethod
    async def delete_related_attachments(
        db: AsyncSession,
        entity_type: str,
        entity_id: UUID,
        tenant_id: UUID,
    ) -> None:
        """Bulk-delete attachment rows for a polymorphic entity."""
        from app.models.attachment import Attachment

        await db.execute(
            sa_delete(Attachment).where(
                Attachment.entity_type == entity_type,
                Attachment.entity_id == entity_id,
                Attachment.tenant_id == tenant_id,
            )
        )

    # ------------------------------------------------------------------
    # Batch-lookup helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def batch_lookup(
        db: AsyncSession,
        model: type,
        id_column: Any,
        name_column: Any,
        *,
        filter_column: Any | None = None,
        filter_value: Any | None = None,
    ) -> dict[UUID, str]:
        """Fetch ``{id: name}`` map, optionally filtered by a column.

        Useful for resolving FK display names in bulk (e.g. package names,
        author names).
        """
        query = select(id_column, name_column)
        if filter_column is not None and filter_value is not None:
            query = query.where(filter_column == filter_value)
        result = await db.execute(query)
        return {row[0]: row[1] for row in result.all()}
