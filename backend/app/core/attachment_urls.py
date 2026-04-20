"""Attachment URL lookup helpers.

Provides single and batch functions for resolving the most recent
attachment download URL for a given entity, parameterised by a
``url_prefix`` so the same logic serves both admin (``/attachments``)
and portal (``/portal/attachments``) routes.
"""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attachment import Attachment

# Default URL prefixes
ADMIN_PREFIX = "/attachments"
PORTAL_PREFIX = "/portal/attachments"


async def get_latest_attachment_url(
    db: AsyncSession,
    entity_id: UUID,
    entity_type: str,
    tenant_id: UUID | None,
    url_prefix: str = ADMIN_PREFIX,
) -> str | None:
    """Return the download URL for the most recent attachment of a given type.

    ``tenant_id`` accepts ``None`` so ``CurrentUser.tenant_id`` passes through
    directly; a ``None`` matches no row and returns ``None`` — same as no
    attachment existing.

    Returns ``None`` when no matching attachment exists.
    """
    result = await db.execute(
        select(Attachment.id)
        .where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
        .order_by(Attachment.created_at.desc())
        .limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"{url_prefix}/{attachment_id}/download"
    return None


async def batch_get_attachment_urls(
    db: AsyncSession,
    entity_ids: list[UUID],
    entity_type: str,
    tenant_id: UUID | None,
    url_prefix: str = ADMIN_PREFIX,
) -> dict[UUID, str]:
    """Batch-fetch the most recent attachment URL per entity in a single query.

    Uses ``ROW_NUMBER() OVER (PARTITION BY entity_id)`` to get the latest
    attachment per entity, avoiding N+1 queries on list endpoints.

    ``tenant_id`` accepts ``None``; a ``None`` matches no row and returns an
    empty dict.

    Returns a mapping of ``entity_id -> download URL``.
    """
    if not entity_ids:
        return {}

    ranked = (
        select(
            Attachment.entity_id,
            Attachment.id.label("attachment_id"),
            func.row_number()
            .over(partition_by=Attachment.entity_id, order_by=Attachment.created_at.desc())
            .label("rn"),
        )
        .where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id.in_(entity_ids),
        )
        .subquery()
    )
    result = await db.execute(select(ranked.c.entity_id, ranked.c.attachment_id).where(ranked.c.rn == 1))
    return {row.entity_id: f"{url_prefix}/{row.attachment_id}/download" for row in result.all()}
