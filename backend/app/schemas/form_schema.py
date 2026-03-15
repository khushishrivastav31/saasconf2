"""Schemas for paper form builder: form schemas and custom fields."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# --- Enums ---


class FieldType(StrEnum):
    """Supported field types for custom paper form fields."""

    TEXT = "text"
    TEXTAREA = "textarea"
    RICHTEXT = "richtext"
    CHECKBOX = "checkbox"
    CHECKBOX_GROUP = "checkbox_group"
    DROPDOWN = "dropdown"
    FILE_UPLOAD = "file_upload"


# --- Nested Schemas ---


class FieldOption(BaseModel):
    """Option for dropdown or checkbox_group fields."""

    value: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=200)


class ValidationRules(BaseModel):
    """Validation rules for form fields."""

    min_length: int | None = Field(None, ge=0)
    max_length: int | None = Field(None, ge=1)
    min_items: int | None = Field(None, ge=0, description="For checkbox_group: minimum selections")
    max_items: int | None = Field(None, ge=1, description="For checkbox_group: maximum selections")
    pattern: str | None = Field(None, description="Regex pattern for validation")
    allowed_file_types: list[str] | None = Field(None, description="For file_upload: allowed extensions")
    max_file_size_mb: int | None = Field(None, ge=1, le=50, description="For file_upload: max size in MB")


class BuiltinFieldConfig(BaseModel):
    """Configuration for a built-in paper field."""

    visible: bool = True
    required: bool = False
    display_order: int | None = None
    help_text: str | None = None


# --- Paper Form Field Schemas ---


class PaperFormFieldCreate(BaseModel):
    """Schema for creating a custom paper form field."""

    field_key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    field_type: FieldType
    label: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    placeholder: str | None = Field(None, max_length=500)
    help_text: str | None = None
    display_order: int = Field(0, ge=0)
    is_visible: bool = True
    is_required: bool = False
    validation_rules: ValidationRules | None = None
    options: list[FieldOption] | None = Field(None, description="Required for dropdown/checkbox_group")


class PaperFormFieldUpdate(BaseModel):
    """Schema for updating a custom paper form field."""

    field_key: str | None = Field(None, min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    field_type: FieldType | None = None
    label: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    placeholder: str | None = Field(None, max_length=500)
    help_text: str | None = None
    display_order: int | None = Field(None, ge=0)
    is_visible: bool | None = None
    is_required: bool | None = None
    validation_rules: ValidationRules | None = None
    options: list[FieldOption] | None = None


class PaperFormFieldResponse(BaseModel):
    """Paper form field response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    schema_id: UUID
    field_key: str
    field_type: str
    label: str
    description: str | None
    placeholder: str | None
    help_text: str | None
    display_order: int
    is_visible: bool
    is_required: bool
    validation_rules: dict | None
    options: list[FieldOption] | None
    created_at: datetime
    updated_at: datetime


# --- Paper Form Schema Schemas ---


class PaperFormSchemaCreate(BaseModel):
    """Schema for creating/updating a paper form schema."""

    builtin_fields_config: dict[str, BuiltinFieldConfig] = Field(
        default_factory=dict, description="Configuration for built-in fields like title, abstract_short, etc."
    )


class PaperFormSchemaUpdate(BaseModel):
    """Schema for updating a paper form schema."""

    builtin_fields_config: dict[str, BuiltinFieldConfig] | None = None


class PaperFormSchemaResponse(BaseModel):
    """Paper form schema response with all fields."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    version: int
    builtin_fields_config: dict[str, BuiltinFieldConfig]
    fields: list[PaperFormFieldResponse]
    created_at: datetime
    updated_at: datetime


# --- Field Reorder Schema ---


class FieldReorderItem(BaseModel):
    """Single item in a field reorder request."""

    id: UUID
    display_order: int = Field(..., ge=0)


class FieldReorderRequest(BaseModel):
    """Request to reorder form fields."""

    fields: list[FieldReorderItem] = Field(..., min_length=1)


# --- Has Submissions Check ---


class HasSubmissionsResponse(BaseModel):
    """Response for checking if papers exist for a conference."""

    has_submissions: bool
    submission_count: int
