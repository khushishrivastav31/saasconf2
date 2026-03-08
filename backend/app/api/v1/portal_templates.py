"""
Portal Template Downloads

Provides downloadable default templates for portal customization.
"""

from fastapi import APIRouter, Response

from app.api.v1.portal.css import DEFAULT_PORTAL_CSS

router = APIRouter(prefix="/portal-templates", tags=["Portal Templates"])


@router.get("/default-registration-portal.css")
async def get_default_portal_css() -> Response:
    """
    Download default CSS template for public registration portal.

    Returns a starter CSS template that conference admins can customize
    to match their brand. This template includes all standard portal classes
    and provides a good starting point for customization.

    Returns:
        Response with CSS content (Content-Type: text/css)
    """
    return Response(
        content=DEFAULT_PORTAL_CSS,
        media_type="text/css",
        headers={
            "Content-Disposition": "attachment; filename=default-registration-portal.css",
            "Cache-Control": "public, max-age=86400",
        },
    )
