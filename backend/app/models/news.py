"""News article model — supports both conference-scoped and tenant-wide
training-scoped news via a ``domain`` discriminator (migration 217)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    UUID,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

NEWS_DOMAIN_CONFERENCE = "conference"
NEWS_DOMAIN_TRAINING = "training"
NEWS_DOMAINS = (NEWS_DOMAIN_CONFERENCE, NEWS_DOMAIN_TRAINING)


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Conference-scoped news carries a conference_id; training-scoped
    # ones leave it NULL (the row is tenant-wide for the trainings
    # module). Migration 217 enforces the pairing via a CHECK constraint.
    conference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=True,
    )
    domain: Mapped[str] = mapped_column(String(20), nullable=False, server_default=NEWS_DOMAIN_CONFERENCE)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    screen_overlay_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("screen_overlays.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    screen_overlay: Mapped["ScreenOverlay | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "ScreenOverlay", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_news_articles_tenant_id", "tenant_id"),
        Index("ix_news_articles_conference_id", "conference_id"),
        Index(
            "ix_news_articles_published",
            "conference_id",
            "is_published",
            "published_at",
        ),
        Index(
            "ix_news_articles_tenant_domain_published",
            "tenant_id",
            "domain",
            "is_published",
            "published_at",
        ),
    )
