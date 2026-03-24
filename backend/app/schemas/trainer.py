"""Trainer schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.html_sanitize import sanitize_html
from app.core.validators import validate_email, validate_phone


class TrainerCreate(BaseModel):
    """Schema for creating a trainer."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    vita: str | None = None
    is_active: bool = True
    is_internal: bool = True
    training_ids: list[UUID] = Field(default_factory=list)
    language_ids: list[UUID] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

    @field_validator("vita")
    @classmethod
    def sanitize_vita(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class TrainerUpdate(BaseModel):
    """Schema for updating a trainer."""

    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    vita: str | None = None
    is_active: bool | None = None
    is_internal: bool | None = None
    training_ids: list[UUID] | None = None
    language_ids: list[UUID] | None = None

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str | None) -> str | None:
        return validate_email(v)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)

    @field_validator("vita")
    @classmethod
    def sanitize_vita(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class TrainerNameRef(BaseModel):
    """Minimal reference for a related entity."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str


class TrainerResponse(BaseModel):
    """Schema for trainer response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    vita: str | None = None
    is_active: bool
    is_internal: bool
    training_ids: list[UUID] = Field(default_factory=list)
    language_ids: list[UUID] = Field(default_factory=list)
    trainings: list[TrainerNameRef] = Field(default_factory=list)
    languages: list[TrainerNameRef] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
