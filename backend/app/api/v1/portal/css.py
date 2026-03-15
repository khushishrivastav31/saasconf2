"""
Custom CSS Serving for Public Registration Portal

Public endpoint to serve conference-specific custom CSS for branding based on color theme.
"""

import logging

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import func, select

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


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return (int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16))


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB to hex color."""
    return f"#{r:02x}{g:02x}{b:02x}"


def _mix_color(color: tuple[int, int, int], target: tuple[int, int, int], factor: float) -> str:
    """Mix a color towards a target by factor (0=color, 1=target)."""
    r = int(color[0] + (target[0] - color[0]) * factor)
    g = int(color[1] + (target[1] - color[1]) * factor)
    b = int(color[2] + (target[2] - color[2]) * factor)
    return _rgb_to_hex(max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))


def _generate_primary_shades(primary_hex: str) -> dict[str, str]:
    """Generate Tailwind-style color shades (50-900) from a primary color."""
    rgb = _hex_to_rgb(primary_hex)
    white = (255, 255, 255)
    black = (0, 0, 0)

    return {
        "50": _mix_color(rgb, white, 0.95),
        "100": _mix_color(rgb, white, 0.88),
        "200": _mix_color(rgb, white, 0.75),
        "300": _mix_color(rgb, white, 0.55),
        "400": _mix_color(rgb, white, 0.30),
        "500": _mix_color(rgb, white, 0.10),
        "600": primary_hex,
        "700": _mix_color(rgb, black, 0.20),
        "800": _mix_color(rgb, black, 0.35),
        "900": _mix_color(rgb, black, 0.50),
    }


def generate_css_from_theme(theme: dict) -> str:
    """Generate CSS from theme colors."""
    # Merge with defaults for any missing colors
    colors = {**DEFAULT_THEME, **theme}

    # Generate primary color shades for Tailwind CSS variable overrides
    shades = _generate_primary_shades(colors["primary"])

    return f"""/* Auto-generated CSS from color theme */

:root {{
  --portal-primary: {colors["primary"]};
  --portal-background: {colors["background"]};
  --portal-card: {colors["card"]};
  --portal-text: {colors["text"]};
  --portal-border: {colors["border"]};
  --portal-header-bg: {colors["headerBg"]};

  /* Override Tailwind primary color palette */
  --color-primary-50: {shades["50"]};
  --color-primary-100: {shades["100"]};
  --color-primary-200: {shades["200"]};
  --color-primary-300: {shades["300"]};
  --color-primary-400: {shades["400"]};
  --color-primary-500: {shades["500"]};
  --color-primary-600: {shades["600"]};
  --color-primary-700: {shades["700"]};
  --color-primary-800: {shades["800"]};
  --color-primary-900: {shades["900"]};
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
button[type="submit"]:not(.bg-white):not(.bg-gray-200) {{
  background-color: {colors["primary"]} !important;
  border-color: {colors["primary"]} !important;
}}

button[type="submit"]:not(.bg-white):not(.bg-gray-200):hover {{
  background-color: {shades["700"]} !important;
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
    # Find tenant (case-insensitive, matching registration.py)
    result = await db.execute(
        select(Tenant).where(func.lower(Tenant.slug) == tenant_slug.lower())
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    # Find conference (case-insensitive, matching registration.py)
    result = await db.execute(
        select(Conference).where(
            Conference.tenant_id == tenant.id,
            func.lower(Conference.abbreviation) == conference_slug.lower(),
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
