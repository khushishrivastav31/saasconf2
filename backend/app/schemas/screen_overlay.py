"""Screen overlay schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_TRIGGER_TYPES = {"first_registration", "scheduled", "always"}
VALID_ANIMATION_STYLES = {"confetti", "fireworks", "balloons", "sparkle", "spotlight", "snow", "stars"}


class ScreenOverlayCreate(BaseModel):
    """Schema for creating a screen overlay."""

    trigger_type: str = Field(..., max_length=30)
    title: str = Field(..., min_length=1, max_length=500)
    body_text: str | None = None
    animation_style: str = Field("confetti", max_length=30)
    duration_seconds: int = Field(5, ge=1, le=30)
    is_active: bool = False
    schedule_date: datetime | None = None
    display_order: int = Field(0, ge=0)

    @field_validator("trigger_type")
    @classmethod
    def check_trigger_type(cls, v: str) -> str:
        if v not in VALID_TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of: {', '.join(sorted(VALID_TRIGGER_TYPES))}")
        return v

    @field_validator("animation_style")
    @classmethod
    def check_animation_style(cls, v: str) -> str:
        if v not in VALID_ANIMATION_STYLES:
            raise ValueError(f"animation_style must be one of: {', '.join(sorted(VALID_ANIMATION_STYLES))}")
        return v


class ScreenOverlayUpdate(BaseModel):
    """Schema for updating a screen overlay."""

    trigger_type: str | None = Field(None, max_length=30)
    title: str | None = Field(None, min_length=1, max_length=500)
    body_text: str | None = None
    animation_style: str | None = Field(None, max_length=30)
    duration_seconds: int | None = Field(None, ge=1, le=30)
    is_active: bool | None = None
    schedule_date: datetime | None = None
    display_order: int | None = Field(None, ge=0)

    @field_validator("trigger_type")
    @classmethod
    def check_trigger_type(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_TRIGGER_TYPES:
            raise ValueError(f"trigger_type must be one of: {', '.join(sorted(VALID_TRIGGER_TYPES))}")
        return v

    @field_validator("animation_style")
    @classmethod
    def check_animation_style(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_ANIMATION_STYLES:
            raise ValueError(f"animation_style must be one of: {', '.join(sorted(VALID_ANIMATION_STYLES))}")
        return v


class ScreenOverlayResponse(BaseModel):
    """Screen overlay response schema.

    ``conference_id`` is null for training-domain overlays (tenant-wide
    trainings overlays — see migration 216). ``domain`` carries the
    discriminator (``conference`` | ``training``) so the FE can render
    the right context label.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID | None = None
    domain: str = "conference"
    trigger_type: str
    title: str
    body_text: str | None = None
    animation_style: str
    duration_seconds: int
    is_active: bool
    schedule_date: datetime | None = None
    display_order: int
    image_url: str | None = None
    created_at: datetime
    updated_at: datetime


class ScreenOverlayListResponse(BaseModel):
    """List of screen overlays."""

    items: list[ScreenOverlayResponse]
    total: int


class PortalScreenOverlayResponse(BaseModel):
    """Minimal overlay response for the portal.

    ``conference_id`` and ``conference_name`` are nullable so the portal
    can also surface tenant-wide training overlays (added with the
    Trainings → Settings → Screen Overlays tab).
    """

    id: UUID
    conference_id: UUID | None = None
    conference_name: str | None = None
    domain: str = "conference"
    trigger_type: str
    title: str
    body_text: str | None = None
    animation_style: str
    duration_seconds: int
    image_url: str | None = None
    source: str = "standalone"


class PortalScreenOverlayListResponse(BaseModel):
    """List of portal screen overlays."""

    items: list[PortalScreenOverlayResponse]
    total: int
