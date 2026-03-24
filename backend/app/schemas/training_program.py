"""Training program year schemas."""

from datetime import date, datetime
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


# --- Program Year Training Placements ---


class ProgramYearTrainingCreate(BaseModel):
    """Schema for placing a training on the program year calendar."""

    training_id: UUID
    start_date: date
    location_id: UUID | None = None


class ProgramYearTrainingUpdate(BaseModel):
    """Schema for updating a training placement."""

    location_id: UUID | None = None
    start_date: date | None = None


class ProgramYearTrainingResponse(BaseModel):
    """Schema for a training placement response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    program_year_id: UUID
    training_id: UUID
    training_name: str
    training_slug: str | None = None
    training_abbreviation: str | None = None
    training_duration: int | None = None
    training_color: str | None = None
    location_id: UUID | None = None
    location_name: str | None = None
    location_code: str | None = None
    start_date: date
    created_at: datetime
    updated_at: datetime
