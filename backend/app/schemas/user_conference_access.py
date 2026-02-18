"""Schemas for user conference access."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserConferenceAccessBase(BaseModel):
    """Base schema for user conference access."""

    conference_id: UUID
    access_level: str = "read_only"  # "admin" or "read_only"


class UserConferenceAccessCreate(UserConferenceAccessBase):
    """Schema for creating user conference access."""

    user_id: UUID


class UserConferenceAccessUpdate(BaseModel):
    """Schema for updating user conference access."""

    access_level: str


class UserConferenceAccessResponse(UserConferenceAccessBase):
    """Schema for user conference access response."""

    id: UUID
    user_id: UUID
    granted_by: UUID | None
    granted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserConferenceAccessWithDetails(UserConferenceAccessResponse):
    """Schema with conference and user details included."""

    conference_name: str
    conference_abbreviation: str | None
    user_email: str
    user_name: str | None


class ConferenceAccessListResponse(BaseModel):
    """Response for listing user's conference access."""

    items: list[UserConferenceAccessWithDetails]
    total: int


class UserAccessListResponse(BaseModel):
    """Response for listing conference's user access."""

    items: list[UserConferenceAccessWithDetails]
    total: int


class BulkGrantAccessRequest(BaseModel):
    """Request for granting access to multiple conferences."""

    conference_ids: list[UUID]
    access_level: str = "read_only"


class BulkRevokeAccessRequest(BaseModel):
    """Request for revoking access from multiple conferences."""

    conference_ids: list[UUID]
