"""Trainer schemas."""

from datetime import date, datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.html_sanitize import sanitize_html
from app.core.validators import validate_email, validate_phone


class TrainerCreate(BaseModel):
    """Schema for creating a trainer."""

    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    pronouns: str | None = Field(None, max_length=100)
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
    pronouns: str | None = Field(None, max_length=100)
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


# --- Trainer Unavailability ---


class TrainerUnavailabilityCreate(BaseModel):
    """Schema for creating a trainer unavailability entry."""

    start_date: date
    end_date: date
    description: str | None = Field(None, max_length=255)

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class TrainerUnavailabilityUpdate(BaseModel):
    """Schema for updating a trainer unavailability entry."""

    start_date: date | None = None
    end_date: date | None = None
    description: str | None = Field(None, max_length=255)

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.start_date is not None and self.end_date is not None:
            if self.end_date < self.start_date:
                raise ValueError("end_date must be >= start_date")
        return self


class TrainerUnavailabilityResponse(BaseModel):
    """Schema for trainer unavailability response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    trainer_id: UUID
    start_date: date
    end_date: date
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class TrainerResponse(BaseModel):
    """Schema for trainer response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    pronouns: str | None = None
    vita: str | None = None
    is_active: bool
    is_internal: bool
    training_ids: list[UUID] = Field(default_factory=list)
    language_ids: list[UUID] = Field(default_factory=list)
    trainings: list[TrainerNameRef] = Field(default_factory=list)
    languages: list[TrainerNameRef] = Field(default_factory=list)
    unavailability: list[TrainerUnavailabilityResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
