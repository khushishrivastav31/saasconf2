"""Schemas for news articles."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.html_sanitize import sanitize_html


class NewsArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., min_length=1)

    @field_validator("body_html")
    @classmethod
    def sanitize_body(cls, v: str) -> str:
        return sanitize_html(v)


class NewsArticleUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    body_html: str | None = None
    is_published: bool | None = None

    @field_validator("body_html")
    @classmethod
    def sanitize_body(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v


class NewsArticleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    conference_id: UUID
    title: str
    body_html: str
    is_published: bool
    published_at: datetime | None
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


# Portal schemas

class PortalNewsArticle(BaseModel):
    id: UUID
    conference_id: UUID
    conference_name: str
    title: str
    body_html: str
    published_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PortalNewsListResponse(BaseModel):
    items: list[PortalNewsArticle]
    total: int
