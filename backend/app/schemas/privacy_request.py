"""Pydantic schemas for GDPR privacy requests (Art. 15 export / Art. 17 erasure)."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.privacy_request import PrivacyRequestStatus, PrivacyRequestType


class PrivacyRequestCreate(BaseModel):
    """Input payload for creating a new privacy request."""

    request_type: PrivacyRequestType
    subject_emails: list[EmailStr] = Field(min_length=1, max_length=10)
    notes: str | None = Field(default=None, max_length=2000)


class PrivacyRequestReview(BaseModel):
    """Input payload for approving or rejecting a pending request."""

    approve: bool
    rejection_reason: str | None = Field(default=None, max_length=2000)


class PrivacyRequestResponse(BaseModel):
    """Response payload for a privacy request.

    ``subject_emails`` is surfaced only to users already allowed to see the
    request (scope check happens in the API layer); the column storage is
    encrypted so this is safe to include in the serialization.
    """

    id: UUID
    tenant_id: UUID
    request_type: PrivacyRequestType
    subject_emails: list[str]
    status: PrivacyRequestStatus
    created_by: UUID | None
    portal_user_id: UUID | None
    created_at: datetime
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    executed_at: datetime | None
    completion_artifact_url: str | None
    execution_manifest: dict | None
    rejection_reason: str | None
    notes: str | None

    model_config = ConfigDict(from_attributes=True)
