"""Tenant-configurable settings: volunteer roles, location types, currencies, sponsor packages, session types, committee roles, pronouns, and email templates."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VolunteerRole(Base):
    """
    Conference-scoped volunteer role definitions.

    Each conference has its own set of volunteer roles.
    The volunteer.role column stores the role name as a plain string.
    """

    __tablename__ = "volunteer_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_volunteer_roles_tenant", "tenant_id"),
        Index("idx_volunteer_roles_conference", "conference_id"),
        Index("idx_volunteer_roles_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<VolunteerRole {self.name}>"


class TenantLocationType(Base):
    """
    Conference-scoped location type definitions.

    Each conference has its own set of location types.
    The locations.location_type column stores the type's slug value as a plain string.
    """

    __tablename__ = "tenant_location_types"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    slug: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_tenant_location_types_tenant", "tenant_id"),
        Index("idx_tenant_location_types_conference", "conference_id"),
        Index("idx_tenant_location_types_slug", "tenant_id", "conference_id", "slug", unique=True),
    )

    def __repr__(self) -> str:
        return f"<TenantLocationType {self.name} ({self.slug})>"


class ConferenceCurrency(Base):
    """
    Conference-scoped currency definitions.

    Each conference defines which currencies are available (e.g. for sponsor packages).
    The sponsor_packages.currency column stores the currency code as a plain string.
    """

    __tablename__ = "conference_currencies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(3), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(5), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_conference_currencies_tenant", "tenant_id"),
        Index("idx_conference_currencies_conference", "conference_id"),
        Index("idx_conference_currencies_code", "tenant_id", "conference_id", "code", unique=True),
    )

    def __repr__(self) -> str:
        return f"<ConferenceCurrency {self.code} ({self.symbol})>"


class SponsorPackage(Base):
    """
    Conference-scoped sponsor package definitions.

    Each conference has its own set of sponsor packages with name, description, price, and currency.
    """

    __tablename__ = "sponsor_packages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_sponsor_packages_tenant", "tenant_id"),
        Index("idx_sponsor_packages_conference", "conference_id"),
        Index("idx_sponsor_packages_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<SponsorPackage {self.name}>"


class SessionType(Base):
    """
    Conference-scoped session type definitions.

    Each conference defines session types (e.g., "Keynote", "Workshop", "Lightning Talk")
    with their duration and whether they can be selected for CFP submissions.
    """

    __tablename__ = "session_types"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    cfp_eligible: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    separately_bookable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_session_types_tenant", "tenant_id"),
        Index("idx_session_types_conference", "conference_id"),
        Index("idx_session_types_slug", "tenant_id", "conference_id", "slug", unique=True),
    )

    def __repr__(self) -> str:
        return f"<SessionType {self.name} ({self.slug})>"


class CFPCommitteeRole(Base):
    """
    Conference-scoped committee role definitions.

    Each conference has its own set of committee roles (e.g. Chair, Reviewer).
    The cfp_committee_members.role column stores the role name as a plain string.
    """

    __tablename__ = "cfp_committee_roles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_cfp_committee_roles_tenant", "tenant_id"),
        Index("idx_cfp_committee_roles_conference", "conference_id"),
        Index("idx_cfp_committee_roles_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<CFPCommitteeRole {self.name}>"


class PronounOption(Base):
    """
    Conference-scoped pronoun option definitions.

    Each conference has its own set of pronoun options.
    The users.pronouns and cfp_applicants.pronouns columns store the pronoun name as a plain string.
    """

    __tablename__ = "pronoun_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_pronoun_options_tenant", "tenant_id"),
        Index("idx_pronoun_options_conference", "conference_id"),
        Index("idx_pronoun_options_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<PronounOption {self.name}>"


class EmailTemplate(Base):
    """
    Email templates for system and conference communications.

    System templates (tenant_id = null): Used for tenant user invitations.
    Conference templates (tenant_id + conference_id set): Used for CFP portal
    communications (applicant verification, submission confirmation, etc.).

    Template types:
    - tenant_user_welcome: Sent when a user is added to a tenant (system level)
    - applicant_verification: Sent when an applicant registers (conference level)
    - committee_verification: Sent when a committee member is added (conference level)
    - submission_confirmation: Sent after a paper is submitted (conference level)
    - co_speaker_invitation: Sent when inviting a co-speaker (conference level)
    - password_reset: Sent for password reset requests (conference level)
    - new_message_notification: Sent when a new message is received (conference level)
    - paper_acceptance: Sent when papers are accepted via program publish (conference level)
    - paper_rejection: Sent when papers are rejected via program publish (conference level)

    Placeholders available:
    - [User Type]: Role of the user (admin, user, etc.)
    - [Company Name]: Tenant name
    - [Conference Name]: Conference name
    - [Paper Title]: Title of submitted paper
    - [Paper List]: HTML list of paper titles (acceptance/rejection templates)
    - [Speakers]: List of speaker names
    - [Support Email]: Tenant support email
    - [Verify Link]: Email verification URL
    - [Reset Link]: Password reset URL
    """

    __tablename__ = "email_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Null tenant_id means system-level template (super admin)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Null conference_id means tenant-level template (applies to all conferences)
    conference_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conferences.id", ondelete="CASCADE"),
        nullable=True,
    )
    template_type: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_email_templates_tenant", "tenant_id"),
        Index("idx_email_templates_conference", "conference_id"),
        Index(
            "idx_email_templates_type",
            "tenant_id",
            "conference_id",
            "template_type",
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return f"<EmailTemplate {self.template_type}>"


# Re-exports for backward compatibility
from app.models.booking import (  # noqa: E402, F401
    BookingOption,
    BookingPackage,
    BookingPackageOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
)
