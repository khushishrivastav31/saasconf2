"""Badge PDF generation with WeasyPrint.

Follows the same pattern as invoice_pdf.py: placeholder replacement, HTML
normalization, WeasyPrint rendering.  Badges are DIN A5 (148x210 mm) in
portrait or landscape orientation.
"""

import asyncio
import base64
import io
import re
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.registration import Registration

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


def _generate_qr_vcard(data: dict[str, Any], qr_fields: list[str]) -> str:
    """Generate a QR code encoding a vCard 3.0 from selected fields.

    Returns an <img> tag with base64 data URL, or empty string if no fields.
    """
    if not qr_fields:
        return ""

    try:
        import qrcode  # type: ignore[import-untyped]
    except ImportError:
        return ""

    # Build vCard
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
    addr_parts = []
    if any(f in qr_fields for f in ("street", "city", "postal_code", "country")):
        street = data.get("street", "") if "street" in qr_fields else ""
        city = data.get("city", "") if "city" in qr_fields else ""
        postal = data.get("postal_code", "") if "postal_code" in qr_fields else ""
        country = data.get("country", "") if "country" in qr_fields else ""
        if any([street, city, postal, country]):
            addr_parts.append(f"ADR:;;{street};{city};;{postal};{country}")
    for part in addr_parts:
        lines.append(part)

    lines.append("END:VCARD")
    vcard = "\n".join(lines)

    # Generate QR code image
    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=2)
    qr.add_data(vcard)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    return f'<img src="data:image/png;base64,{b64}" alt="QR Code" style="width: 120px; height: 120px;">'


# ---------------------------------------------------------------------------
# Conditional image evaluation
# ---------------------------------------------------------------------------


def _evaluate_condition(
    condition_type: str,
    condition_value: str,
    registration: Registration,
    booking_options_by_id: dict[str, Any] | None = None,
) -> bool:
    """Check if a conditional image's condition is met for a registration.

    ``booking_options_by_id`` is a pre-loaded map of str(id) → BookingOption
    used for conference_day condition checks.
    """
    if condition_type == "booking_option":
        # Direct booking option match
        if str(registration.booking_option_id) == condition_value:
            return True
        # Also check registration items
        for item in getattr(registration, "items", []):
            if str(getattr(item, "booking_option_id", None)) == condition_value:
                return True
        return False

    if condition_type == "conference_day":
        options_map = booking_options_by_id or {}
        # Check main booking option's conference_day_id
        main_opt = options_map.get(str(registration.booking_option_id))
        if main_opt and str(getattr(main_opt, "conference_day_id", None)) == condition_value:
            return True
        # Also check items' booking options
        for item in getattr(registration, "items", []):
            item_opt = options_map.get(str(getattr(item, "booking_option_id", None)))
            if item_opt and str(getattr(item_opt, "conference_day_id", None)) == condition_value:
                return True
        return False

    if condition_type == "registration_item":
        # Check if registration has any item matching the value
        for item in getattr(registration, "items", []):
            if str(getattr(item, "booking_option_id", None)) == condition_value:
                return True
        return False

    return False


async def _resolve_conditional_images(
    settings: dict,
    registration: Registration | None,
    db: AsyncSession,
    booking_options_by_id: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Resolve conditional images: return placeholder → <img> or empty string."""
    images_config: list[dict] = settings.get("badge_conditional_images", [])
    result: dict[str, str] = {}

    for img_cfg in images_config:
        placeholder = img_cfg.get("placeholder", "")
        if not placeholder:
            continue

        # Check condition
        condition_met = True  # Default to True for preview (no registration)
        if registration is not None:
            condition_met = _evaluate_condition(
                img_cfg.get("condition_type", ""),
                img_cfg.get("condition_value", ""),
                registration,
                booking_options_by_id,
            )

        if not condition_met:
            result[placeholder] = ""
            continue

        # Load attachment image
        attachment_id = img_cfg.get("attachment_id")
        if not attachment_id:
            result[placeholder] = ""
            continue

        att_result = await db.execute(select(Attachment).where(Attachment.id == UUID(attachment_id)))
        attachment = att_result.scalar_one_or_none()
        if not attachment:
            result[placeholder] = ""
            continue

        b64 = base64.b64encode(attachment.file_data).decode("ascii")
        result[placeholder] = (
            f'<img src="data:{attachment.content_type};base64,{b64}" '
            f'alt="{img_cfg.get("name", "")}" style="max-height: 40px;">'
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
    qr_html = (
        _generate_qr_vcard(data, qr_fields) if "[QR_CODE]" in template_html or "[QR CODE]" in template_html else ""
    )

    # Conditional images
    conditional_images = await _resolve_conditional_images(settings, registration, db, booking_options_by_id)

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
    qr_html = (
        _generate_qr_vcard(mock_data, qr_fields) if "[QR_CODE]" in template_html or "[QR CODE]" in template_html else ""
    )

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
            qr_html = _generate_qr_vcard(data, qr_fields)

        # Conditional images per registration
        cond_imgs = await _resolve_conditional_images(settings, reg, db, booking_options_by_id)

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
