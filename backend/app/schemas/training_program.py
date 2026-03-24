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
    published_version: int = 0
    published_at: datetime | None = None
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
    trainer_assignments: list["PlacementTrainerResponse"] = Field(default_factory=list)


# --- Placement Trainer Assignments ---


class PlacementTrainerCreate(BaseModel):
    """Schema for assigning a trainer to a placement."""

    trainer_id: UUID


class PlacementTrainerResponse(BaseModel):
    """Schema for a trainer assignment response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    placement_id: UUID
    trainer_id: UUID
    trainer_first_name: str
    trainer_last_name: str
    created_at: datetime


class TrainerConflict(BaseModel):
    """Describes a scheduling conflict for a trainer."""

    type: str  # "unavailability" | "double_booking"
    description: str
    start_date: date
    end_date: date
    other_training_name: str | None = None
    other_placement_id: UUID | None = None


class AvailabilityCheckResponse(BaseModel):
    """Response for trainer availability check."""

    available: bool
    conflicts: list[TrainerConflict]


# --- Program Snapshots ---


class ProgramSnapshotResponse(BaseModel):
    """Schema for a program snapshot (version history entry)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    program_year_id: UUID
    version: int
    published_at: datetime
    published_by: UUID | None = None
    snapshot_data: list[dict] = Field(default_factory=list)


class ProgramSnapshotListItem(BaseModel):
    """Lightweight snapshot entry without full data (for version list)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version: int
    published_at: datetime
    published_by: UUID | None = None


class PlacementChangeResponse(BaseModel):
    """A single placement change in the diff."""

    change_type: str  # "added" | "removed" | "modified"
    placement_id: str
    training_name: str
    training_slug: str | None = None
    start_date: str
    duration: int
    location_name: str | None = None
    location_code: str | None = None
    changes: list[str] = Field(default_factory=list)
    old_trainer_names: list[str] = Field(default_factory=list)
    new_trainer_names: list[str] = Field(default_factory=list)


class TrainerChangeResponse(BaseModel):
    """Changes affecting a specific trainer."""

    trainer_id: str
    trainer_name: str
    added_trainings: list[str] = Field(default_factory=list)
    removed_trainings: list[str] = Field(default_factory=list)
    modified_trainings: list[str] = Field(default_factory=list)


class ProgramDiffResponse(BaseModel):
    """Full diff between current program and last published snapshot."""

    has_changes: bool
    placement_changes: list[PlacementChangeResponse] = Field(default_factory=list)
    affected_trainer_ids: list[str] = Field(default_factory=list)
    per_trainer_changes: list[TrainerChangeResponse] = Field(default_factory=list)
