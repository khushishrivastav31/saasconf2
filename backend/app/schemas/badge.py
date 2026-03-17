"""Badge settings schemas for template design and generation."""

from pydantic import BaseModel, ConfigDict, field_validator


class BadgeConditionalImage(BaseModel):
    """A conditional image that appears on a badge when a condition is met.

    Condition types:
      - "booking_option" / "registration_item": condition_value = booking option UUID
      - "conference_day": condition_value = program day UUID
      - "field": generic field check — uses condition_field + condition_operator + condition_value
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    placeholder: str  # e.g. "IMG_DAY1" (without brackets)
    condition_type: str  # "booking_option" | "conference_day" | "field"
    condition_value: str  # UUID or comparison value
    attachment_id: str | None = None
    # For field-based conditions:
    condition_field: str | None = None  # e.g. "country", "pronouns", "company_name"
    condition_operator: str | None = None  # "eq", "neq", "contains", "not_empty", "empty"


class BadgeSettingsResponse(BaseModel):
    """Response schema for badge settings."""

    model_config = ConfigDict(from_attributes=True)

    badge_templates: dict[str, str] = {}
    badge_orientation: str = "landscape"
    badge_qr_fields: list[str] = []
    badge_qr_logo_attachment_id: str | None = None
    badge_conditional_images: list[BadgeConditionalImage] = []


class BadgeSettingsUpdate(BaseModel):
    """Update schema for badge settings. All fields optional for partial update."""

    badge_templates: dict[str, str] | None = None
    badge_orientation: str | None = None
    badge_qr_fields: list[str] | None = None
    badge_qr_logo_attachment_id: str | None = None
    badge_conditional_images: list[BadgeConditionalImage] | None = None

    @field_validator("badge_orientation")
    @classmethod
    def validate_orientation(cls, v: str | None) -> str | None:
        if v is not None and v not in ("portrait", "landscape"):
            raise ValueError("Must be 'portrait' or 'landscape'")
        return v

    @field_validator("badge_qr_fields")
    @classmethod
    def validate_qr_fields(cls, v: list[str] | None) -> list[str] | None:
        allowed = {
            "first_name",
            "last_name",
            "email",
            "phone",
            "job_title",
            "department",
            "company_name",
            "street",
            "postal_code",
            "city",
            "country",
        }
        if v is not None:
            invalid = set(v) - allowed
            if invalid:
                raise ValueError(f"Invalid QR fields: {', '.join(sorted(invalid))}")
        return v


class BadgeBulkRequest(BaseModel):
    """Request schema for bulk badge generation."""

    registration_ids: list[str]
    badge_type: str = "attendee"
