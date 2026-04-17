"""Invoice validation helpers."""

from typing import TYPE_CHECKING, Any

from fastapi import HTTPException

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.core.dependencies import CurrentUser
    from app.models.conference import Conference
    from app.models.invoice import Invoice
    from app.schemas.invoice import VatRequirement, VatWarning


def validate_recipient_fields(obj: Any) -> None:
    """Validate required recipient fields for invoices.

    Args:
        obj: Object with recipient fields (Invoice model or InvoiceCreate/InvoiceUpdate schema)

    Raises:
        HTTPException: 400 if required fields are missing
    """
    missing_fields = []

    if not obj.recipient_name:
        missing_fields.append("Recipient name")
    if not obj.recipient_address_line1:
        missing_fields.append("Street address")
    if not obj.recipient_city:
        missing_fields.append("City")
    if not obj.recipient_postal_code:
        missing_fields.append("Postal code")
    if not obj.recipient_country:
        missing_fields.append("Country")

    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )


async def validate_vat_requirements(
    invoice: "Invoice",
    conference: "Conference",
    db: "AsyncSession",
    current_user: "CurrentUser",
) -> tuple[list["VatWarning"], "VatRequirement | None"]:
    """Check VAT requirements based on Decision Table and return warnings.

    Does NOT raise exceptions - returns warnings that can be acknowledged by admin.

    Args:
        invoice: Invoice instance with recipient data
        conference: Conference instance
        db: Database session
        current_user: Current user (for permission checks)

    Returns:
        Tuple of (warnings list, vat_requirement object)
    """
    from app.core.default_settings import DEFAULT_EU_COUNTRIES, DEFAULT_VAT_RULES
    from app.core.vat_calculation import classify_customer_location, infer_attendance_type_from_registration
    from app.core.vat_requirements import VatRequirementLevel, determine_vat_requirement
    from app.core.vat_rules import get_vat_rule
    from app.core.vat_validation import validate_vat_number
    from app.schemas.invoice import VatRequirement, VatWarning

    warnings: list[VatWarning] = []

    # Step 1: Determine attendance type
    attendance_type = invoice.attendance_type
    if not attendance_type:
        attendance_type = await infer_attendance_type_from_registration(invoice, db)
    if not attendance_type:
        # Fallback to conference venue
        venue_type = conference.venue_type
        attendance_type = "virtual" if venue_type == "virtual" else "in_person"

    # Step 2: Classify customer location
    eu_countries = (conference.settings or {}).get("eu_countries", DEFAULT_EU_COUNTRIES)
    customer_location = classify_customer_location(
        invoice.recipient_country or "",
        conference.country or "",
        eu_countries,
    )

    # Step 3: Get VAT rule from Decision Table
    # Note: We check B2B rule (what would apply if they have VAT)
    vat_rules = (conference.settings or {}).get("vat_rules", DEFAULT_VAT_RULES)
    b2b_rule = get_vat_rule(vat_rules, attendance_type, "b2b", customer_location)

    # Step 4: Determine requirement level
    has_company_name = bool(invoice.recipient_name and invoice.recipient_name.strip())
    requirement = determine_vat_requirement(
        attendance_type=attendance_type,
        customer_location=customer_location,
        has_company_name=has_company_name,
        vat_rule=b2b_rule,
    )

    # Convert to Pydantic model
    vat_requirement = VatRequirement(
        level=requirement.level,
        reason=requirement.reason,
        rule_reference=requirement.rule_reference,
    )

    # Step 5: Check if VAT is missing when required/recommended
    vat_number = invoice.recipient_vat_number
    if not vat_number or not vat_number.strip():
        if requirement.level == VatRequirementLevel.REQUIRED:
            warnings.append(
                VatWarning(
                    code="vat_required_missing",
                    level="error",
                    message=requirement.reason,
                    requirement=vat_requirement,
                    can_override=current_user.is_tenant_admin or current_user.is_super_admin,
                )
            )
        elif requirement.level == VatRequirementLevel.RECOMMENDED and has_company_name:
            warnings.append(
                VatWarning(
                    code="vat_recommended_missing",
                    level="warning",
                    message=requirement.reason,
                    requirement=vat_requirement,
                    can_override=True,  # Anyone can ignore recommendations
                )
            )
        return warnings, vat_requirement

    # Step 6: Validate VAT number if provided (3-stage cascade)
    validation_result = await validate_vat_number(
        vat_number=vat_number,
        country=invoice.recipient_country or "",
    )

    if validation_result.get("valid") is False:
        # Invalid VAT
        if requirement.level == VatRequirementLevel.REQUIRED:
            warnings.append(
                VatWarning(
                    code="vat_required_invalid",
                    level="error",
                    message=(
                        f"{requirement.reason}\n\n"
                        f"The provided VAT number ({vat_number}) could not be validated: "
                        f"{validation_result.get('message') or 'Invalid format or checksum'}."
                    ),
                    requirement=vat_requirement,
                    can_override=current_user.is_tenant_admin or current_user.is_super_admin,
                )
            )
        elif requirement.level == VatRequirementLevel.RECOMMENDED:
            warnings.append(
                VatWarning(
                    code="vat_recommended_invalid",
                    level="warning",
                    message=f"The VAT number could not be validated. {requirement.reason}",
                    requirement=vat_requirement,
                    can_override=True,
                )
            )
    elif validation_result.get("valid") is None:
        # Uncertain (format OK, VIES unreachable)
        if requirement.level == VatRequirementLevel.REQUIRED:
            warnings.append(
                VatWarning(
                    code="vat_required_uncertain",
                    level="warning",  # Warning, not error - format is OK
                    message=(
                        "VAT number format is valid but could not be verified online. "
                        f"{requirement.reason} "
                        "The VAT registry (VIES) is currently unavailable. "
                        "The invoice can be sent, but ensure the VAT number is correct."
                    ),
                    requirement=vat_requirement,
                    can_override=True,  # Format is valid, just can't verify
                )
            )

    return warnings, vat_requirement
