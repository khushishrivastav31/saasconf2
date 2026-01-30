"""Shared helper functions for CFP Applicant Portal sub-modules."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.tenant import Tenant


async def _resolve_tenant(db: AsyncSession, tenant_slug: str) -> Tenant:
    """Resolve a tenant by slug."""
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug))
    tenant = result.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise NotFoundError("Organization not found")
    return tenant


async def _resolve_tenant_conference(
    db: AsyncSession, tenant_slug: str, abbreviation: str
) -> tuple[Tenant, Conference]:
    """Resolve a tenant and conference by slug + abbreviation."""
    tenant = await _resolve_tenant(db, tenant_slug)

    result = await db.execute(
        select(Conference).where(
            Conference.tenant_id == tenant.id,
            Conference.abbreviation == abbreviation,
            Conference.is_active == True,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    return tenant, conference


async def _get_applicant_picture_url(db: AsyncSession, applicant_id, tenant_id) -> str | None:
    """Get the picture download URL for an applicant."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "applicant_picture",
            Attachment.entity_id == applicant_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/portal/attachments/{attachment_id}/download"
    return None


async def _get_applicant_video_url(db: AsyncSession, applicant_id, tenant_id) -> str | None:
    """Get the video download URL for an applicant."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "applicant_video",
            Attachment.entity_id == applicant_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/portal/attachments/{attachment_id}/download"
    return None


async def _get_paper_video_url(db: AsyncSession, paper_id, tenant_id) -> str | None:
    """Get the video download URL for a paper."""
    result = await db.execute(
        select(Attachment.id).where(
            Attachment.tenant_id == tenant_id,
            Attachment.entity_type == "paper_video",
            Attachment.entity_id == paper_id,
        ).order_by(Attachment.created_at.desc()).limit(1)
    )
    attachment_id = result.scalar_one_or_none()
    if attachment_id:
        return f"/portal/attachments/{attachment_id}/download"
    return None
