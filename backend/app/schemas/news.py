"""Schemas for news articles."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.html_sanitize import sanitize_html


class NewsArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)
    screen_overlay_id: UUID | None = None

    @field_validator("body_html")
    @classmethod
    def sanitize_body(cls, v: str) -> str:
        return sanitize_html(v)


class NewsArticleUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    body_html: str | None = None
    is_published: bool | None = None
    screen_overlay_id: UUID | None = None

    @field_validator("body_html")
    @classmethod
    def sanitize_body(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class NewsArticleResponse(BaseModel):
    """News article response schema.

    ``conference_id`` is null for training-domain articles (tenant-wide
    trainings news, see migration 217). ``domain`` carries the
    discriminator (``conference`` | ``training``) so the FE can render
    the right context label.
    """

    id: UUID
    tenant_id: UUID
    conference_id: UUID | None = None
    domain: str = "conference"
    title: str
    body_html: str
    is_published: bool
    published_at: datetime | None
    screen_overlay_id: UUID | None = None
    author_first_name: str | None = None
    author_last_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NewsArticleListResponse(BaseModel):
    items: list[NewsArticleResponse]
    total: int


class NewsArticleSendRequest(BaseModel):
    all_applicants: bool = False
    paper_status: str | None = None
    committee_role: str | None = None
    applicant_ids: list[UUID] | None = None
    recipient_list_id: UUID | None = None


class NewsArticleSendResponse(BaseModel):
    emails_sent: int


class TrainingNewsSendRequest(BaseModel):
    """Filter the recipient pool for a training news send.

    Recipients are always training attendees in the tenant. Filters
    narrow that pool — when none are set, the article goes to every
    training attendee (the default broadcast). Empty payload (``{}``)
    is the same as no filters.

    * ``placement_ids`` — only attendees registered on these placements.
    * ``program_year_id`` — only attendees registered on placements in
      this program year.
    * ``registration_status`` — only attendees on registrations with
      this status (e.g. ``paid``, ``pending``).
    """

    placement_ids: list[UUID] | None = None
    program_year_id: UUID | None = None
    registration_status: str | None = None


# Portal schemas


class PortalNewsArticle(BaseModel):
    """Portal-facing news article.

    ``conference_id`` / ``conference_name`` are nullable so the unified
    portal feed can also surface tenant-wide training news (no
    conference anchor).
    """

    id: UUID
    conference_id: UUID | None = None
    conference_name: str | None = None
    domain: str = "conference"
    title: str
    body_html: str
    published_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PortalNewsListResponse(BaseModel):
    items: list[PortalNewsArticle]
    total: int
