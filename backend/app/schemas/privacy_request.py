"""Pydantic schemas for GDPR privacy requests (Art. 15 export / Art. 17 erasure)."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.privacy_request import PrivacyRequestStatus, PrivacyRequestType

ErasureActionLiteral = Literal["delete", "anonymize", "skip"]


class PrivacyRequestCreate(BaseModel):
    """Input payload for creating a new privacy request."""

    request_type: PrivacyRequestType
    subject_emails: list[EmailStr] = Field(min_length=1, max_length=25)
    notes: str | None = Field(default=None, max_length=2000)


class PrivacyRequestReview(BaseModel):
    """Input payload for approving or rejecting a pending request."""

    approve: bool
    rejection_reason: str | None = Field(default=None, max_length=2000)


class PrivacyRequestReject(BaseModel):
    """Dedicated reject payload — ``rejection_reason`` is required."""

    rejection_reason: str = Field(min_length=1, max_length=2000)


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
    execution_manifest: dict[str, Any] | None
    rejection_reason: str | None
    notes: str | None

    model_config = ConfigDict(from_attributes=True)


class PrivacyRequestListItem(BaseModel):
    """Lighter list-view row — omits the decrypted subject emails.

    The list view could otherwise pay one Fernet decrypt per row. Surfacing
    only ``subject_count`` keeps the list endpoint cheap; the detail endpoint
    returns the full ``PrivacyRequestResponse`` when a row is opened.
    """

    id: UUID
    tenant_id: UUID
    request_type: PrivacyRequestType
    subject_count: int
    status: PrivacyRequestStatus
    created_by: UUID | None
    created_at: datetime
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    executed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class GenerateExportResponse(BaseModel):
    """Result of a successful ``/generate-export`` call."""

    download_url: str
    record_counts: dict[str, int]
    executed_at: datetime


class ErasureTableEntrySchema(BaseModel):
    """One row in the erasure preview — per PII-owning table."""

    table: str
    count: int
    row_ids: list[UUID]
    default_action: ErasureActionLiteral
    allowed_actions: list[ErasureActionLiteral]
    locked_reason: str | None = None


class ErasurePreviewResponse(BaseModel):
    """Preview payload returned before the admin commits an erasure."""

    entries: list[ErasureTableEntrySchema]
    summary: dict[str, int]


class ErasureExecuteRequest(BaseModel):
    """Body for ``POST /privacy-requests/{id}/execute-erasure``.

    ``table_actions`` is ``{table_name: "delete" | "anonymize" | "skip"}``.
    Tables omitted from the payload fall back to the preview's default.
    """

    table_actions: dict[str, ErasureActionLiteral] = Field(default_factory=dict)


class ErasureManifestEntrySchema(BaseModel):
    action: ErasureActionLiteral
    affected: int


class ErasureExecuteResponse(BaseModel):
    """Result of a successful ``/execute-erasure`` call."""

    executed_at: datetime
    manifest: dict[str, ErasureManifestEntrySchema]
