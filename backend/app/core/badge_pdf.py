"""Badge PDF generation with WeasyPrint.

Follows the same pattern as invoice_pdf.py: placeholder replacement, HTML
normalization, WeasyPrint rendering.  Badges are DIN A5 (148x210 mm) in
portrait or landscape orientation.
"""

import asyncio
import base64
import io
import logging
import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.registration import Registration

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BADGE_HTML = """
<div style="text-align: center; padding: 2cm 1cm;">
  <p style="font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 2px;">[BADGE_TYPE]</p>
  <p>&nbsp;</p>
  <p style="font-size: 28px; font-weight: bold;">[FULL_NAME]</p>
  <p style="font-size: 16px; color: #444;">[JOB_TITLE]</p>
  <p style="font-size: 14px; color: #666;">[COMPANY_NAME]</p>
  <p>&nbsp;</p>
  <p style="font-size: 18px; font-weight: 600;">[CONFERENCE_NAME]</p>
  <p style="font-size: 12px; color: #666;">[CONFERENCE_DATES]</p>
</div>
""".strip()

BADGE_CSS = """
body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #111;
    margin: 0;
    padding: 0;
}
p {
    margin: 0;
    line-height: 1.4;
}
p:empty {
    min-height: 1.4em;
}
h1, h2, h3, h4, h5, h6 {
    margin: 0.25rem 0;
}
table {
    border-collapse: collapse;
    width: 100%;
}
th, td {
    padding: 8px;
    vertical-align: top;
}
img {
    max-width: 100%;
    height: auto;
}
ul { list-style-type: disc; padding-left: 1.25rem; }
ol { list-style-type: decimal; padding-left: 1.25rem; }
li { margin: 0; }
"""


# ---------------------------------------------------------------------------
# Placeholder helpers
# ---------------------------------------------------------------------------


def _apply_placeholders(html: str, replacements: dict[str, str]) -> str:
    """Apply all placeholder replacements to an HTML string."""
    for placeholder, value in replacements.items():
        html = html.replace(placeholder, value)
    return html


def _preserve_empty_paragraphs(html: str) -> str:
    """Convert empty paragraphs to non-breaking spaces for WeasyPrint."""
    html = re.sub(r"<p>\s*</p>", "<p>&nbsp;</p>", html)
    html = re.sub(r"<p>\s*<br\s*/?\s*>\s*</p>", "<p>&nbsp;</p>", html)
    return html


def _build_replacements(
    data: dict[str, Any],
    conference: Conference,
    badge_type: str,
    qr_html: str,
    conditional_images: dict[str, str],
) -> dict[str, str]:
    """Build the placeholder → value mapping for badge rendering.

    Supports both underscore and space variants for backward compatibility.
    """
    first = data.get("first_name", "")
    last = data.get("last_name", "")
    full = f"{first} {last}".strip()

    # Conference dates
    conf_dates = ""
    if conference.start_date and conference.end_date:
        conf_dates = f"{conference.start_date.strftime('%B %d')} – {conference.end_date.strftime('%B %d, %Y')}"
    elif conference.start_date:
        conf_dates = conference.start_date.strftime("%B %d, %Y")

    # Conference logo as base64
    logo_html = ""
    if conference.logo_url:
        logo_html = f'<img src="{conference.logo_url}" alt="Logo" style="max-height: 60px;">'

    replacements: dict[str, str] = {
        # Attendee
        "[FIRST_NAME]": first,
        "[FIRST NAME]": first,
        "[LAST_NAME]": last,
        "[LAST NAME]": last,
        "[FULL_NAME]": full,
        "[FULL NAME]": full,
        "[EMAIL]": data.get("email", ""),
        "[PHONE]": data.get("phone", ""),
        "[JOB_TITLE]": data.get("job_title", ""),
        "[JOB TITLE]": data.get("job_title", ""),
        "[DEPARTMENT]": data.get("department", ""),
        "[PRONOUNS]": data.get("pronouns", ""),
        # Company
        "[COMPANY_NAME]": data.get("company_name", ""),
        "[COMPANY NAME]": data.get("company_name", ""),
        # Conference
        "[CONFERENCE_NAME]": conference.name or "",
        "[CONFERENCE NAME]": conference.name or "",
        "[CONFERENCE_ABBREVIATION]": conference.abbreviation or "",
        "[CONFERENCE ABBREVIATION]": conference.abbreviation or "",
        "[CONFERENCE_VENUE]": conference.venue_name or "",
        "[CONFERENCE VENUE]": conference.venue_name or "",
        "[CONFERENCE_CITY]": conference.city or "",
        "[CONFERENCE CITY]": conference.city or "",
        "[CONFERENCE_COUNTRY]": conference.country or "",
        "[CONFERENCE COUNTRY]": conference.country or "",
        "[CONFERENCE_DATES]": conf_dates,
        "[CONFERENCE DATES]": conf_dates,
        "[CONFERENCE_LOGO]": logo_html,
        "[CONFERENCE LOGO]": logo_html,
        # Registration
        "[BOOKING_OPTION]": data.get("booking_option", ""),
        "[BOOKING OPTION]": data.get("booking_option", ""),
        "[BADGE_TYPE]": badge_type.replace("_", " ").title(),
        "[BADGE TYPE]": badge_type.replace("_", " ").title(),
        "[REGISTRATION_DATE]": data.get("registration_date", ""),
        "[REGISTRATION DATE]": data.get("registration_date", ""),
        # QR Code
        "[QR_CODE]": qr_html,
        "[QR CODE]": qr_html,
    }

    # Conditional images
    for placeholder_name, img_html in conditional_images.items():
        replacements[f"[{placeholder_name}]"] = img_html
        # Also support space variant
        replacements[f"[{placeholder_name.replace('_', ' ')}]"] = img_html

    return replacements


# ---------------------------------------------------------------------------
# QR Code generation
# ---------------------------------------------------------------------------


def _svg_to_png(svg_data: bytes) -> bytes:
    """Convert SVG bytes to PNG using cairosvg."""
    import cairosvg  # type: ignore[import-untyped]

    return cairosvg.svg2png(bytestring=svg_data, output_width=400, output_height=400)


def _overlay_logo_on_qr(img: Any, logo_data: bytes) -> Any:
    """Overlay a logo in grayscale at the center of a QR code image.

    Uses PIL/Pillow. The logo is sized to ~30% of the QR code. This uses
    the full ERROR_CORRECT_H (30%) recovery budget — the QR code remains
    scannable because the center modules carry the least critical data.
    Supports SVG input (converted to PNG via cairosvg).
    """
    from PIL import Image

    # Detect SVG and convert to raster
    if logo_data[:256].lstrip().startswith((b"<svg", b"<?xml")):
        logo_data = _svg_to_png(logo_data)

    logo = Image.open(io.BytesIO(logo_data)).convert("RGBA")
    qr_w, qr_h = img.size
    max_logo = int(min(qr_w, qr_h) * 0.3)
    logo.thumbnail((max_logo, max_logo), Image.LANCZOS)  # type: ignore[attr-defined]

    # Convert to black-on-white: any non-white pixel becomes black
    bw = Image.new("RGBA", logo.size, (255, 255, 255, 255))
    pixels = logo.load()
    bw_pixels = bw.load()
    for y in range(logo.height):
        for x in range(logo.width):
            r, g, b, a = pixels[x, y]  # type: ignore[index,misc]
            if a < 128:
                # Transparent → white
                bw_pixels[x, y] = (255, 255, 255, 255)  # type: ignore[index]
            else:
                # Use luminance: dark pixels → black, light → white
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                if lum < 200:
                    bw_pixels[x, y] = (0, 0, 0, 255)  # type: ignore[index]
                else:
                    bw_pixels[x, y] = (255, 255, 255, 255)  # type: ignore[index]
    logo_rgba = bw
    # Add small white padding around logo
    pad = 4
    padded = Image.new("RGBA", (logo.width + pad * 2, logo.height + pad * 2), (255, 255, 255, 255))
    padded.paste(logo_rgba, (pad, pad))
    # Center on QR code
    x = (qr_w - padded.width) // 2
    y = (qr_h - padded.height) // 2
    img.paste(padded, (x, y), padded)
    return img


def _build_vcard(data: dict[str, Any], qr_fields: list[str]) -> str:
    """Build a vCard 3.0 string from selected fields."""
    lines = ["BEGIN:VCARD", "VERSION:3.0"]

    first = data.get("first_name", "") if "first_name" in qr_fields else ""
    last = data.get("last_name", "") if "last_name" in qr_fields else ""
    if first or last:
        lines.append(f"N:{last};{first};;;")
        lines.append(f"FN:{first} {last}".strip())

    if "email" in qr_fields and data.get("email"):
        lines.append(f"EMAIL:{data['email']}")
    if "phone" in qr_fields and data.get("phone"):
        lines.append(f"TEL:{data['phone']}")
    if "job_title" in qr_fields and data.get("job_title"):
        lines.append(f"TITLE:{data['job_title']}")
    if "department" in qr_fields and data.get("department"):
        lines.append(f"ORG:{data.get('company_name', '')};{data['department']}")
    elif "company_name" in qr_fields and data.get("company_name"):
        lines.append(f"ORG:{data['company_name']}")

    # Address
    if any(f in qr_fields for f in ("street", "city", "postal_code", "country")):
        street = data.get("street", "") if "street" in qr_fields else ""
        city = data.get("city", "") if "city" in qr_fields else ""
        postal = data.get("postal_code", "") if "postal_code" in qr_fields else ""
        country = data.get("country", "") if "country" in qr_fields else ""
        if any([street, city, postal, country]):
            lines.append(f"ADR:;;{street};{city};;{postal};{country}")

    lines.append("END:VCARD")
    return "\n".join(lines)


def _generate_qr_image(vcard: str, logo_data: bytes | None = None) -> bytes:
    """Generate a QR code PNG from a vCard string, optionally with logo overlay."""
    import qrcode  # type: ignore[import-untyped]

    error_level = qrcode.constants.ERROR_CORRECT_H if logo_data else qrcode.constants.ERROR_CORRECT_M
    qr = qrcode.QRCode(version=None, error_correction=error_level, box_size=8, border=2)
    qr.add_data(vcard)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGBA")

    if logo_data:
        import contextlib

        with contextlib.suppress(Exception):
            img = _overlay_logo_on_qr(img, logo_data)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_qr_vcard(
    data: dict[str, Any],
    qr_fields: list[str],
    logo_data: bytes | None = None,
) -> str:
    """Generate a QR code encoding a vCard 3.0 from selected fields.

    If logo_data is provided, embeds the logo in grayscale at the center of
    the QR code.

    Returns an <img> tag with base64 data URL, or empty string if no fields.
    """
    if not qr_fields:
        return ""

    try:
        import qrcode  # type: ignore[import-untyped]  # noqa: F401
    except ImportError:
        return ""

    vcard = _build_vcard(data, qr_fields)
    png_bytes = _generate_qr_image(vcard, logo_data)
    b64 = base64.b64encode(png_bytes).decode("ascii")

    # Default 30mm. Inline-block so it respects parent text-align for centering.
    # Users control size via the width style on a wrapper or directly on the img
    # in their template HTML source.
    return f'<img src="data:image/png;base64,{b64}" alt="QR Code" style="width: 30mm; height: auto;">'


async def generate_qr_preview(qr_fields: list[str], logo_data: bytes | None = None) -> bytes:
    """Generate a sample QR code PNG for settings preview."""
    mock_data = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": "jane.doe@example.com",
        "phone": "+49 170 1234567",
        "job_title": "Senior Engineer",
        "department": "Engineering",
        "company_name": "Acme Corp",
    }
    vcard = _build_vcard(mock_data, qr_fields)
    return await asyncio.to_thread(_generate_qr_image, vcard, logo_data)


# ---------------------------------------------------------------------------
# Conditional image evaluation
# ---------------------------------------------------------------------------


def _evaluate_condition(
    img_cfg: dict,
    registration: Registration,
    data: dict[str, Any],
    booking_options_by_id: dict[str, Any] | None = None,
) -> bool:
    """Check if a conditional image's condition is met for a registration.

    ``data`` is the badge data dict (first_name, country, pronouns, etc.).
    ``booking_options_by_id`` is a pre-loaded map of str(id) → BookingOption.
    """
    condition_type = img_cfg.get("condition_type", "")
    condition_value = img_cfg.get("condition_value", "")

    reg_bo_id = str(registration.booking_option_id)
    item_bo_ids = [str(getattr(item, "booking_option_id", None)) for item in getattr(registration, "items", [])]

    if condition_type in ("booking_option", "registration_item"):
        # Check main booking option + all add-on items
        if reg_bo_id == condition_value:
            return True
        for item_bo_id in item_bo_ids:
            if item_bo_id == condition_value:
                return True
        logger.info(
            "Conditional image condition NOT met: type=%s value=%s reg_booking=%s items=%s reg=%s",
            condition_type,
            condition_value,
            reg_bo_id,
            item_bo_ids,
            registration.id,
        )
        return False

    if condition_type == "conference_day":
        options_map = booking_options_by_id or {}
        main_opt = options_map.get(reg_bo_id)
        if main_opt and str(getattr(main_opt, "conference_day_id", None)) == condition_value:
            return True
        for item_bo_id in item_bo_ids:
            item_opt = options_map.get(item_bo_id)
            if item_opt and str(getattr(item_opt, "conference_day_id", None)) == condition_value:
                return True
        return False

    if condition_type == "field":
        field_name = img_cfg.get("condition_field", "")
        operator = img_cfg.get("condition_operator", "eq")
        field_val = str(data.get(field_name, "") or "")
        compare_val = condition_value

        if operator == "eq":
            return field_val.lower() == compare_val.lower()
        if operator == "neq":
            return field_val.lower() != compare_val.lower()
        if operator == "contains":
            return compare_val.lower() in field_val.lower()
        if operator == "not_empty":
            return bool(field_val.strip())
        if operator == "empty":
            return not field_val.strip()

    return False


async def _resolve_conditional_images(
    settings: dict,
    registration: Registration | None,
    db: AsyncSession,
    data: dict[str, Any] | None = None,
    booking_options_by_id: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Resolve conditional images: return placeholder → <img> or empty string."""
    images_config: list[dict] = settings.get("badge_conditional_images", [])
    result: dict[str, str] = {}

    logger.info(
        "Resolving %d conditional images for registration=%s",
        len(images_config),
        registration.id if registration else "preview",
    )

    for img_cfg in images_config:
        placeholder = img_cfg.get("placeholder", "")
        if not placeholder:
            continue

        # Check condition
        condition_met = True  # Default to True for preview (no registration)
        if registration is not None:
            condition_met = _evaluate_condition(
                img_cfg,
                registration,
                data or {},
                booking_options_by_id,
            )

        if not condition_met:
            result[placeholder] = ""
            continue

        # Load attachment image
        attachment_id = img_cfg.get("attachment_id")
        if not attachment_id:
            logger.warning("Conditional image [%s] has no attachment_id", placeholder)
            result[placeholder] = ""
            continue

        att_result = await db.execute(select(Attachment).where(Attachment.id == UUID(attachment_id)))
        attachment = att_result.scalar_one_or_none()
        if not attachment:
            logger.warning("Conditional image [%s] attachment %s not found in DB", placeholder, attachment_id)
            result[placeholder] = ""
            continue

        b64 = base64.b64encode(attachment.file_data).decode("ascii")
        result[placeholder] = (
            f'<img src="data:{attachment.content_type};base64,{b64}" '
            f'alt="{img_cfg.get("name", "")}" style="max-height: 40px;">'
        )
        logger.info(
            "Conditional image [%s] resolved: condition_met=%s, img_size=%d bytes",
            placeholder,
            condition_met,
            len(attachment.file_data),
        )

    return result


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------


def _wrap_badge_html(body: str, orientation: str) -> str:
    """Wrap badge body in a full HTML document for WeasyPrint."""
    page_size = "210mm 148mm" if orientation == "landscape" else "148mm 210mm"

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {{
    size: {page_size};
    margin: 1cm;
}}
{BADGE_CSS}
</style>
</head>
<body>
{body}
</body>
</html>"""


async def _load_qr_logo(settings: dict, db: AsyncSession) -> bytes | None:
    """Load QR logo attachment data if configured."""
    logo_att_id = settings.get("badge_qr_logo_attachment_id")
    if not logo_att_id:
        return None
    result = await db.execute(select(Attachment).where(Attachment.id == UUID(logo_att_id)))
    att = result.scalar_one_or_none()
    return att.file_data if att else None


async def generate_badge_pdf(
    registration_id: UUID,
    conference: Conference,
    badge_type: str,
    db: AsyncSession,
) -> bytes:
    """Generate a badge PDF for a single registration."""
    from app.models.booking import BookingOption
    from app.models.registration import BillingProfile

    # Load registration with billing profile and items
    result = await db.execute(
        select(Registration)
        .options(
            joinedload(Registration.billing_profile),
            selectinload(Registration.items),
        )
        .where(
            Registration.id == registration_id,
            Registration.conference_id == conference.id,
        )
    )
    registration = result.unique().scalar_one_or_none()
    if not registration:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Registration not found")

    # Load booking option separately (no ORM relationship on Registration)
    option: BookingOption | None = None
    if registration.booking_option_id:
        opt_result = await db.execute(select(BookingOption).where(BookingOption.id == registration.booking_option_id))
        option = opt_result.scalar_one_or_none()

    settings = conference.settings or {}

    # Get template
    templates = settings.get("badge_templates", {})
    template_html = templates.get(badge_type, DEFAULT_BADGE_HTML)

    # Build data dict from registration
    billing: BillingProfile | None = registration.billing_profile

    data = {
        "first_name": registration.first_name or "",
        "last_name": registration.last_name or "",
        "email": registration.email or "",
        "phone": registration.phone or "",
        "job_title": registration.job_title or "",
        "department": registration.department or "",
        "pronouns": registration.pronouns or "",
        "company_name": billing.company_name if billing else "",
        "booking_option": option.name if option else "",
        "registration_date": (registration.created_at.strftime("%Y-%m-%d") if registration.created_at else ""),
        # Address fields for QR
        "street": billing.street if billing else "",
        "postal_code": billing.postal_code if billing else "",
        "city": billing.city if billing else "",
        "country": billing.country if billing else "",
    }

    # Load booking options for condition evaluation (conference_day conditions)
    all_option_ids = {str(registration.booking_option_id)}
    for item in getattr(registration, "items", []):
        if item.booking_option_id:
            all_option_ids.add(str(item.booking_option_id))
    options_result = await db.execute(
        select(BookingOption).where(BookingOption.id.in_([UUID(oid) for oid in all_option_ids if oid != "None"]))
    )
    booking_options_by_id = {str(o.id): o for o in options_result.scalars().all()}

    # QR code
    qr_fields = settings.get("badge_qr_fields", [])
    qr_logo_data: bytes | None = None
    if "[QR_CODE]" in template_html or "[QR CODE]" in template_html:
        qr_logo_data = await _load_qr_logo(settings, db)
    qr_html = _generate_qr_vcard(data, qr_fields, logo_data=qr_logo_data) if qr_fields else ""

    # Conditional images
    conditional_images = await _resolve_conditional_images(settings, registration, db, data, booking_options_by_id)

    # Log which conditional image placeholders are in the template
    for ph in conditional_images:
        found = f"[{ph}]" in template_html
        logger.info(
            "Badge template placeholder [%s]: in_template=%s, has_content=%s",
            ph,
            found,
            bool(conditional_images[ph]),
        )

    # Build replacements and apply
    replacements = _build_replacements(data, conference, badge_type, qr_html, conditional_images)
    body = _apply_placeholders(template_html, replacements)
    body = _preserve_empty_paragraphs(body)

    orientation = settings.get("badge_orientation", "landscape")
    full_html = _wrap_badge_html(body, orientation)

    # Generate PDF in thread pool
    pdf_bytes = await asyncio.to_thread(_render_pdf, full_html)
    return pdf_bytes


async def generate_badge_pdf_from_data(
    mock_data: dict[str, Any],
    settings: dict,
    conference: Conference,
    badge_type: str,
    db: AsyncSession,
) -> bytes:
    """Generate a preview badge PDF using mock data (no real registration)."""
    templates = settings.get("badge_templates", {})
    template_html = templates.get(badge_type, DEFAULT_BADGE_HTML)

    # QR code
    qr_fields = settings.get("badge_qr_fields", [])
    qr_logo_data: bytes | None = None
    if "[QR_CODE]" in template_html or "[QR CODE]" in template_html:
        qr_logo_data = await _load_qr_logo(settings, db)
    qr_html = _generate_qr_vcard(mock_data, qr_fields, logo_data=qr_logo_data) if qr_fields else ""

    # Conditional images (all shown in preview)
    conditional_images = await _resolve_conditional_images(settings, None, db)

    # Build replacements
    replacements = _build_replacements(mock_data, conference, badge_type, qr_html, conditional_images)
    body = _apply_placeholders(template_html, replacements)
    body = _preserve_empty_paragraphs(body)

    orientation = settings.get("badge_orientation", "landscape")
    full_html = _wrap_badge_html(body, orientation)

    pdf_bytes = await asyncio.to_thread(_render_pdf, full_html)
    return pdf_bytes


async def generate_badges_bulk(
    registration_ids: list[UUID],
    conference: Conference,
    badge_type: str,
    db: AsyncSession,
) -> bytes:
    """Generate a multi-page badge PDF for multiple registrations."""
    from app.models.booking import BookingOption
    from app.models.registration import BillingProfile

    settings = conference.settings or {}
    templates = settings.get("badge_templates", {})
    template_html = templates.get(badge_type, DEFAULT_BADGE_HTML)
    qr_fields = settings.get("badge_qr_fields", [])
    orientation = settings.get("badge_orientation", "landscape")

    # Load all registrations with billing profiles and items
    result = await db.execute(
        select(Registration)
        .options(
            joinedload(Registration.billing_profile),
            selectinload(Registration.items),
        )
        .where(
            Registration.id.in_(registration_ids),
            Registration.conference_id == conference.id,
        )
    )
    registrations = result.unique().scalars().all()

    if not registrations:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("No registrations found")

    # Collect all booking option IDs and load them in one query
    all_option_ids: set[str] = set()
    for reg in registrations:
        if reg.booking_option_id:
            all_option_ids.add(str(reg.booking_option_id))
        for item in getattr(reg, "items", []):
            if item.booking_option_id:
                all_option_ids.add(str(item.booking_option_id))

    booking_options_by_id: dict[str, Any] = {}
    if all_option_ids:
        opts_result = await db.execute(
            select(BookingOption).where(BookingOption.id.in_([UUID(oid) for oid in all_option_ids]))
        )
        booking_options_by_id = {str(o.id): o for o in opts_result.scalars().all()}

    # Load QR logo once for all badges
    qr_logo_data: bytes | None = None
    if "[QR_CODE]" in template_html or "[QR CODE]" in template_html:
        qr_logo_data = await _load_qr_logo(settings, db)

    # Build all badge pages
    pages: list[str] = []
    for reg in registrations:
        billing: BillingProfile | None = reg.billing_profile
        option = booking_options_by_id.get(str(reg.booking_option_id))

        data = {
            "first_name": reg.first_name or "",
            "last_name": reg.last_name or "",
            "email": reg.email or "",
            "phone": reg.phone or "",
            "job_title": reg.job_title or "",
            "department": reg.department or "",
            "pronouns": reg.pronouns or "",
            "company_name": billing.company_name if billing else "",
            "booking_option": option.name if option else "",
            "registration_date": reg.created_at.strftime("%Y-%m-%d") if reg.created_at else "",
            "street": billing.street if billing else "",
            "postal_code": billing.postal_code if billing else "",
            "city": billing.city if billing else "",
            "country": billing.country if billing else "",
        }

        # QR code per registration
        qr_html = ""
        if "[QR_CODE]" in template_html or "[QR CODE]" in template_html:
            qr_html = _generate_qr_vcard(data, qr_fields, logo_data=qr_logo_data)

        # Conditional images per registration
        cond_imgs = await _resolve_conditional_images(settings, reg, db, data, booking_options_by_id)

        replacements = _build_replacements(data, conference, badge_type, qr_html, cond_imgs)
        body = _apply_placeholders(template_html, replacements)
        body = _preserve_empty_paragraphs(body)

        pages.append(body)

    # Combine pages with page breaks
    combined_body = '<div style="page-break-after: always;">'.join([f"{page}</div>" for page in pages[:-1]])
    combined_body += pages[-1] if pages else ""

    full_html = _wrap_badge_html(combined_body, orientation)

    pdf_bytes = await asyncio.to_thread(_render_pdf, full_html)
    return pdf_bytes


# ---------------------------------------------------------------------------
# WeasyPrint renderer
# ---------------------------------------------------------------------------


def _render_pdf(html_content: str) -> bytes:
    """Render HTML to PDF using WeasyPrint. Runs in a thread pool."""
    from weasyprint import HTML

    return HTML(string=html_content).write_pdf()
