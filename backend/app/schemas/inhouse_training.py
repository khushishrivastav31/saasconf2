"""Schemas for inhouse training management."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InhouseTrainingCreate(BaseModel):
    customer_id: UUID
    training_id: UUID
    trainer_id: UUID | None = None
    offer_id: UUID | None = None
    start_date: date
    end_date: date
    status: str = Field("draft", pattern=r"^(draft|sent|rejected|accepted)$")
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    comments: str | None = None

    @model_validator(mode="after")
    def end_date_gte_start(self) -> "InhouseTrainingCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class InhouseTrainingUpdate(BaseModel):
    customer_id: UUID | None = None
    training_id: UUID | None = None
    trainer_id: UUID | None = None
    offer_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = Field(None, pattern=r"^(draft|sent|rejected|accepted)$")
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    comments: str | None = None

    @model_validator(mode="after")
    def end_date_gte_start(self) -> "InhouseTrainingUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class InhouseTrainingResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    customer_id: UUID
    training_id: UUID
    trainer_id: UUID | None = None
    offer_id: UUID | None = None
    start_date: date
    end_date: date
    status: str
    training_price: Decimal | None = None
    certification_price: Decimal | None = None
    comments: str | None = None
    created_at: datetime
    updated_at: datetime

    # Expanded names
    customer_name: str | None = None
    training_name: str | None = None
    trainer_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
