"""
Custom CSS Serving for Public Registration Portal

Public endpoint to serve conference-specific custom CSS for branding based on color theme.
"""

import logging

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from app.core.dependencies import DbSessionDep
from app.models.conference import Conference
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)
router = APIRouter()

# Default theme colors
DEFAULT_THEME = {
    "primary": "#2563eb",  # blue-600
    "background": "#f9fafb",  # gray-50
    "card": "#ffffff",  # white
    "text": "#111827",  # gray-900
    "border": "#e5e7eb",  # gray-200
    "headerBg": "#ffffff",  # white
}


def generate_css_from_theme(theme: dict) -> str:
    """Generate CSS from theme colors."""
    # Merge with defaults for any missing colors
    colors = {**DEFAULT_THEME, **theme}

    return f"""/* Auto-generated CSS from color theme */

:root {{
  --portal-primary: {colors["primary"]};
  --portal-background: {colors["background"]};
  --portal-card: {colors["card"]};
  --portal-text: {colors["text"]};
  --portal-border: {colors["border"]};
  --portal-header-bg: {colors["headerBg"]};
}}

/* Page background */
body,
.min-h-screen {{
  background-color: {colors["background"]} !important;
}}

/* Card backgrounds and borders */
.bg-white,
.rounded-lg.border,
.bg-white.dark\\:bg-gray-800 {{
  background-color: {colors["card"]} !important;
  border-color: {colors["border"]} !important;
}}

/* All borders */
.border-gray-200,
.border-gray-300,
.dark\\:border-gray-700 {{
  border-color: {colors["border"]} !important;
}}

/* Text colors */
.text-gray-900,
.dark\\:text-gray-100,
h1, h2, h3, h4, h5, h6 {{
  color: {colors["text"]} !important;
}}

/* Primary color for submit buttons */
button[type="submit"]:not(.bg-white):not(.bg-gray-200),
.bg-blue-600,
.bg-primary-600 {{
  background-color: {colors["primary"]} !important;
  border-color: {colors["primary"]} !important;
}}

button[type="submit"]:not(.bg-white):not(.bg-gray-200):hover,
.bg-blue-600:hover,
.hover\\:bg-blue-700:hover {{
  background-color: {colors["primary"]} !important;
  filter: brightness(0.9);
}}

/* Links */
a,
.text-blue-600,
.text-primary-600 {{
  color: {colors["primary"]} !important;
}}

a:hover {{
  color: {colors["primary"]} !important;
  filter: brightness(0.8);
}}

/* Input focus states */
input:focus,
select:focus,
textarea:focus {{
  border-color: {colors["primary"]} !important;
  outline-color: {colors["primary"]} !important;
  --tw-ring-color: {colors["primary"]} !important;
}}

/* Checkboxes and radios */
input[type="checkbox"]:checked,
input[type="radio"]:checked {{
  background-color: {colors["primary"]} !important;
  border-color: {colors["primary"]} !important;
}}

/* Header/Conference info box */
.rounded-lg.border.border-gray-200 {{
  background-color: {colors["headerBg"]} !important;
  border-color: {colors["border"]} !important;
}}

/* Responsive */
@media (max-width: 640px) {{
  body {{
    background-color: {colors["background"]} !important;
  }}
}}
"""


@router.get("/{tenant_slug}/conferences/{conference_slug}/custom-css")
async def get_custom_css(
    tenant_slug: str,
    conference_slug: str,
    db: DbSessionDep,
) -> Response:
    """
    Serve dynamically-generated CSS for public registration portal based on theme colors.

    This endpoint generates CSS from the color theme stored in conference settings.
    If no theme is configured, uses default colors.

    Args:
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        db: Database session

    Returns:
        Response with generated CSS content (Content-Type: text/css)

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

    # Get theme colors from portal settings
    portal_settings = conference.settings.get("public_registration_portal", {}) if conference.settings else {}
    theme = portal_settings.get("theme", DEFAULT_THEME)

    # Generate CSS from theme
    css_content = generate_css_from_theme(theme)

    return Response(
        content=css_content,
        media_type="text/css",
        headers={"Cache-Control": "no-cache"},  # No cache - always fetch fresh
    )
