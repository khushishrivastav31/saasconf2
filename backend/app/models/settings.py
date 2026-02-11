"""Tenant-configurable settings: volunteer roles, location types, currencies, sponsor packages, booking options, discount codes, and committee roles."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
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


class BookingPeriod(Base):
    """
    Conference-scoped booking period definitions (matrix columns).

    Each conference defines pricing periods (e.g. "Blind", "Early Bird", "Regular")
    with date ranges. Each period stores per-package prices as a JSONB map:
    { "<package_id>": price }.
    """

    __tablename__ = "booking_periods"

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
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    prices: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_booking_periods_tenant", "tenant_id"),
        Index("idx_booking_periods_conference", "conference_id"),
        Index("idx_booking_periods_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<BookingPeriod {self.name}>"


class BookingOption(Base):
    """
    Conference-scoped booking option definitions (matrix rows).

    Each option defines what an attendee can buy (e.g. "Tutorial", "2-Day Pass").
    Prices are stored on the BookingPeriod side.
    """

    __tablename__ = "booking_options"

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
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_booking_options_tenant", "tenant_id"),
        Index("idx_booking_options_conference", "conference_id"),
        Index("idx_booking_options_name", "tenant_id", "conference_id", "name", unique=True),
    )

    def __repr__(self) -> str:
        return f"<BookingOption {self.name}>"


class DiscountCode(Base):
    """
    Conference-scoped discount code definitions.

    Each conference can have discount codes that attendees enter during booking.
    Codes can be fixed-amount or percentage-based, with optional date ranges and usage limits.
    """

    __tablename__ = "discount_codes"

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
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    discount_type: Mapped[str] = mapped_column(String(10), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    max_uses: Mapped[int] = mapped_column(Integer, default=0)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_discount_codes_tenant", "tenant_id"),
        Index("idx_discount_codes_conference", "conference_id"),
        Index("idx_discount_codes_code", "tenant_id", "conference_id", "code", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DiscountCode {self.code}>"


class DiscountCodeOption(Base):
    """
    Association table linking discount codes to specific booking options.

    When a discount code has associated options, it only applies to those options.
    If a discount code has no associated options, it applies to all options.
    """

    __tablename__ = "discount_code_options"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    discount_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("discount_codes.id", ondelete="CASCADE"),
        nullable=False,
    )
    booking_option_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("booking_options.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_discount_code_options_tenant", "tenant_id"),
        Index("idx_discount_code_options_discount", "discount_code_id"),
        Index("idx_discount_code_options_option", "booking_option_id"),
        Index("uq_discount_code_option", "discount_code_id", "booking_option_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DiscountCodeOption discount={self.discount_code_id} option={self.booking_option_id}>"


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

    Placeholders available:
    - [User Type]: Role of the user (admin, user, etc.)
    - [Company Name]: Tenant name
    - [Conference Name]: Conference name
    - [Paper Title]: Title of submitted paper
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
