"""
Custom CSS Serving for Public Registration Portal

Public endpoint to serve conference-specific custom CSS for branding.
"""

import logging

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.core.dependencies import DbSessionDep
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{tenant_slug}/conferences/{conference_slug}/custom-css")
async def get_custom_css(
    tenant_slug: str,
    conference_slug: str,
    db: DbSessionDep,
) -> Response:
    """
    Serve custom CSS for public registration portal (public endpoint).

    Priority:
    1. Inline CSS (if use_inline_css is true)
    2. Uploaded CSS file
    3. Empty response (frontend will use defaults)

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        db: Database session

    Returns:
        Response with CSS content (Content-Type: text/css)

    Raises:
        HTTPException: If tenant or conference not found
    """
    # Find tenant
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    # Find conference
    result = await db.execute(
        select(Conference).where(
            Conference.tenant_id == tenant.id,
            Conference.abbreviation == conference_slug,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise HTTPException(
            status_code=404,
            detail=f"Conference '{conference_slug}' not found",
        )

    # Get portal settings
    portal_settings = conference.settings.get("public_registration_portal", {})

    # Priority 1: Inline CSS
    if portal_settings.get("use_inline_css") and portal_settings.get("inline_css"):
        css_content = portal_settings["inline_css"]
        return Response(
            content=css_content,
            media_type="text/css",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    # Priority 2: Uploaded CSS file
    attachment_id = portal_settings.get("custom_css_attachment_id")
    if attachment_id:
        result = await db.execute(
            select(Attachment).where(
                Attachment.id == attachment_id,
                Attachment.tenant_id == tenant.id,
            )
        )
        attachment = result.scalar_one_or_none()
        if attachment and attachment.file_data:
            # Decode bytes to string
            try:
                css_content = attachment.file_data.decode("utf-8")
                return Response(
                    content=css_content,
                    media_type="text/css",
                    headers={"Cache-Control": "public, max-age=3600"},
                )
            except UnicodeDecodeError:
                logger.error(f"Failed to decode CSS file {attachment_id} for conference {conference.id}")

    # Priority 3: Empty CSS (frontend will use defaults)
    return Response(
        content="/* No custom CSS configured */",
        media_type="text/css",
        headers={"Cache-Control": "public, max-age=3600"},
    )
