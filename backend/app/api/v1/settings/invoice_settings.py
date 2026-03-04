"""Invoice settings endpoints.

Provides CRUD operations for conference-level invoice configuration including:
- Invoice number templates
- Counter management
- Company billing information
- PDF template HTML
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.default_settings import DEFAULT_INVOICE_SETTINGS
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import ValidationError
from app.core.invoice_number import validate_invoice_template
from app.core.invoice_pdf import DEFAULT_INVOICE_TEMPLATE_HTML
from app.models.conference import Conference
from app.schemas.settings import InvoiceCompanyInfo, InvoiceSettingsResponse, InvoiceSettingsUpdate

router = APIRouter()


@router.get(
    "/invoice-settings",
    response_model=InvoiceSettingsResponse,
)
async def get_invoice_settings(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> InvoiceSettingsResponse:
    """Get invoice configuration for conference.

    Returns invoice settings with defaults if not explicitly configured.
    Non-admin users can view settings (needed for PDF generation).
    """
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)
    settings = conference.settings or {}

    # Return settings with defaults from DEFAULT_INVOICE_SETTINGS
    company_info = settings.get("invoice_company_info", DEFAULT_INVOICE_SETTINGS["invoice_company_info"])

    # Build invoice_templates dict.  Migrate legacy invoice_template_html
    # into the "bank_transfer" slot when invoice_templates is not yet set.
    legacy_html = settings.get("invoice_template_html", DEFAULT_INVOICE_TEMPLATE_HTML)
    templates: dict[str, str] = settings.get("invoice_templates", {})
    if not templates:
        # Backward compat: populate from legacy single-template field
        templates = {"bank_transfer": legacy_html}

    return InvoiceSettingsResponse(
        invoice_number_template=settings.get(
            "invoice_number_template",
            DEFAULT_INVOICE_SETTINGS["invoice_number_template"],
        ),
        invoice_counter_reset=settings.get(
            "invoice_counter_reset",
            DEFAULT_INVOICE_SETTINGS["invoice_counter_reset"],
        ),
        invoice_counter_value=settings.get(
            "invoice_counter_value",
            DEFAULT_INVOICE_SETTINGS["invoice_counter_value"],
        ),
        invoice_template_html=legacy_html,
        invoice_templates=templates,
        invoice_footer_html=settings.get(
            "invoice_footer_html",
            DEFAULT_INVOICE_SETTINGS.get("invoice_footer_html", ""),
        ),
        invoice_company_info=InvoiceCompanyInfo(**company_info),
        invoice_page_format=settings.get(
            "invoice_page_format",
            DEFAULT_INVOICE_SETTINGS["invoice_page_format"],
        ),
        cancellation_number_template=settings.get(
            "cancellation_number_template",
            DEFAULT_INVOICE_SETTINGS["cancellation_number_template"],
        ),
        cancellation_counter_reset=settings.get(
            "cancellation_counter_reset",
            DEFAULT_INVOICE_SETTINGS["cancellation_counter_reset"],
        ),
        cancellation_counter_value=settings.get(
            "cancellation_counter_value",
            DEFAULT_INVOICE_SETTINGS["cancellation_counter_value"],
        ),
    )


@router.put(
    "/invoice-settings",
    response_model=InvoiceSettingsResponse,
)
async def update_invoice_settings(
    conference_id: UUID,
    data: InvoiceSettingsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> InvoiceSettingsResponse:
    """Update invoice configuration.

    Requires admin access. Validates template syntax before saving.
    """
    await check_conference_admin(conference_id, current_user, db)

    # Get conference
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == current_user.tenant_id,
        )
    )
    conference = result.scalar_one()

    # Validate templates if provided
    if data.invoice_number_template:
        valid, error = validate_invoice_template(data.invoice_number_template)
        if not valid:
            raise ValidationError(error or "Invalid invoice number template")

    if data.cancellation_number_template:
        valid, error = validate_invoice_template(data.cancellation_number_template)
        if not valid:
            raise ValidationError(error or "Invalid cancellation number template")

    # Update settings
    settings = conference.settings or {}

    # Serialize with mode='json' to ensure all nested models are converted to dicts
    update_data = data.model_dump(exclude_unset=True, mode="json")

    # Merge company_info if provided (partial update)
    if update_data.get("invoice_company_info"):
        existing_company = settings.get(
            "invoice_company_info",
            DEFAULT_INVOICE_SETTINGS["invoice_company_info"],
        )
        new_company = update_data["invoice_company_info"]
        # Merge: keep existing values, override with new ones
        update_data["invoice_company_info"] = {**(existing_company or {}), **new_company}

    # When invoice_templates is saved, sync bank_transfer → legacy field
    if update_data.get("invoice_templates"):
        templates = update_data["invoice_templates"]
        if "bank_transfer" in templates:
            update_data["invoice_template_html"] = templates["bank_transfer"]

    conference.settings = {**settings, **update_data}

    # Mark JSONB field as modified for SQLAlchemy change detection
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(conference, "settings")

    await db.commit()
    await db.refresh(conference)

    # Return updated settings
    return await get_invoice_settings(conference_id, current_user, db)


@router.post("/invoice-settings/preview")
async def preview_invoice_pdf(
    conference_id: UUID,
    data: InvoiceSettingsUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    template_type: str = "bank_transfer",
):
    """Generate preview PDF with unsaved settings.

    Renders a sample invoice using the provided settings without saving them.
    Useful for previewing template changes before committing.

    Query params:
        template_type: Which template to preview (bank_transfer, credit_card, credit_note)
    """
    from datetime import date, timedelta
    from io import BytesIO

    from fastapi.responses import StreamingResponse
    from sqlalchemy.orm import joinedload

    # Fetch conference with tenant relationship for logo access
    result = await db.execute(
        select(Conference)
        .options(joinedload(Conference.tenant))
        .where(Conference.id == conference_id, Conference.tenant_id == current_user.tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Conference not found")

    # Merge preview settings with existing
    preview_settings = {**(conference.settings or {})}
    update_data = data.model_dump(exclude_unset=True)

    if "invoice_company_info" in update_data:
        existing = preview_settings.get("invoice_company_info", {})
        preview_settings["invoice_company_info"] = {**existing, **update_data["invoice_company_info"]}

    # Support both legacy single-template and multi-template preview
    if update_data.get("invoice_templates"):
        preview_settings["invoice_templates"] = update_data["invoice_templates"]

    if "invoice_template_html" in update_data:
        preview_settings["invoice_template_html"] = update_data["invoice_template_html"]

    if "invoice_footer_html" in update_data:
        preview_settings["invoice_footer_html"] = update_data["invoice_footer_html"]

    # Resolve template HTML for the requested type
    templates = preview_settings.get("invoice_templates", {})
    if templates and template_type in templates:
        preview_settings["invoice_template_html"] = templates[template_type]
    elif template_type == "bank_transfer":
        # Fall back to legacy field
        pass

    # Mock invoice data
    mock_invoice_data = {
        "invoice_number": "PREVIEW-2026-00001",
        "issue_date": date.today(),
        "due_date": date.today() + timedelta(days=30),
        "recipient_name": "Sample Customer Ltd",
        "recipient_address_line1": "123 Example Street",
        "recipient_address_line2": None,
        "recipient_city": "Sample City",
        "recipient_postal_code": "12345",
        "recipient_country": "Germany",
        "recipient_vat_number": "DE123456789",
        "line_items": [
            {
                "description": "Conference Registration - Early Bird",
                "quantity": 2,
                "unit_price": 250.00,
                "discount": 0.00,
                "total": 500.00,
            }
        ],
        "subtotal": 500.00,
        "tax_rate": 19.0,
        "tax_amount": 95.00,
        "total": 595.00,
        "currency": conference.currency or "EUR",
        "notes": "Sample invoice for preview purposes.",
    }

    # Generate PDF using preview settings
    from app.core.invoice_pdf import generate_invoice_pdf_from_data

    pdf_bytes = await generate_invoice_pdf_from_data(
        invoice_data=mock_invoice_data, settings=preview_settings, conference=conference, db=db
    )

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=invoice_preview.pdf"},
    )
