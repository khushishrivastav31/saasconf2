"""Training program year schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TrainingProgramYearCreate(BaseModel):
    """Schema for creating a training program year."""

    year: int = Field(..., ge=2020, le=2099)


class TrainingProgramYearUpdate(BaseModel):
    """Schema for updating a training program year."""

    notes: str | None = None

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class TrainingProgramYearResponse(BaseModel):
    """Schema for training program year response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    year: int
    status: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
