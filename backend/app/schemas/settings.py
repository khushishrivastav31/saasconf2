"""Schemas for conference settings: volunteer roles, location types, currencies, sponsor packages, session types, committee roles, pronoun options, and invoice settings."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# --- Volunteer Role Schemas ---


class VolunteerRoleCreate(BaseModel):
    """Schema for creating a volunteer role."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    is_active: bool = True


class VolunteerRoleUpdate(BaseModel):
    """Schema for updating a volunteer role."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class VolunteerRoleResponse(BaseModel):
    """Volunteer role response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class VolunteerRoleListResponse(BaseModel):
    """List of volunteer roles."""

    items: list[VolunteerRoleResponse]
    total: int


# --- Location Type Schemas ---


class LocationTypeCreate(BaseModel):
    """Schema for creating a tenant location type."""

    name: str = Field(..., min_length=1, max_length=50)
    slug: str = Field(..., min_length=1, max_length=20, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    is_active: bool = True


class LocationTypeUpdate(BaseModel):
    """Schema for updating a tenant location type."""

    name: str | None = Field(None, min_length=1, max_length=50)
    slug: str | None = Field(None, min_length=1, max_length=20, pattern=r"^[a-z][a-z0-9_]*$")
    description: str | None = None
    is_active: bool | None = None


class LocationTypeResponse(BaseModel):
    """Location type response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    slug: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    usage_count: int = 0


class LocationTypeListResponse(BaseModel):
    """List of location types."""

    items: list[LocationTypeResponse]
    total: int


# --- Currency Schemas ---


class CurrencyCreate(BaseModel):
    """Schema for creating a conference currency."""

    code: str = Field(..., min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str = Field(..., min_length=1, max_length=50)
    symbol: str = Field(..., min_length=1, max_length=5)
    is_active: bool = True


class CurrencyUpdate(BaseModel):
    """Schema for updating a conference currency."""

    code: str | None = Field(None, min_length=1, max_length=3, pattern=r"^[A-Z]{1,3}$")
    name: str | None = Field(None, min_length=1, max_length=50)
    symbol: str | None = Field(None, min_length=1, max_length=5)
    is_active: bool | None = None


class CurrencyResponse(BaseModel):
    """Currency response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    code: str
    name: str
    symbol: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CurrencyListResponse(BaseModel):
    """List of currencies."""

    items: list[CurrencyResponse]
    total: int


# --- Sponsor Package Schemas ---


class SponsorPackageCreate(BaseModel):
    """Schema for creating a sponsor package."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    price: Decimal = Field(..., ge=0)
    currency: str | None = Field(None, max_length=3)
    is_active: bool = True


class SponsorPackageUpdate(BaseModel):
    """Schema for updating a sponsor package."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    price: Decimal | None = Field(None, ge=0)
    currency: str | None = Field(None, max_length=3)
    is_active: bool | None = None


class SponsorPackageResponse(BaseModel):
    """Sponsor package response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    price: Decimal
    currency: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SponsorPackageListResponse(BaseModel):
    """List of sponsor packages."""

    items: list[SponsorPackageResponse]
    total: int


# --- Session Type Schemas ---


class SessionTypeCreate(BaseModel):
    """Schema for creating a session type."""

    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int = Field(..., gt=0)
    cfp_eligible: bool = True
    separately_bookable: bool = False
    is_active: bool = True


class SessionTypeUpdate(BaseModel):
    """Schema for updating a session type."""

    name: str | None = Field(None, min_length=1, max_length=100)
    slug: str | None = Field(None, min_length=1, max_length=50, pattern=r"^[a-z0-9_-]+$")
    duration_minutes: int | None = Field(None, gt=0)
    cfp_eligible: bool | None = None
    separately_bookable: bool | None = None
    is_active: bool | None = None


class SessionTypeResponse(BaseModel):
    """Session type response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    slug: str
    duration_minutes: int
    cfp_eligible: bool
    separately_bookable: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SessionTypeListResponse(BaseModel):
    """List of session types."""

    items: list[SessionTypeResponse]
    total: int


# --- CFP Committee Role Schemas ---


class CFPCommitteeRoleCreate(BaseModel):
    """Schema for creating a CFP committee role."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    is_active: bool = True


class CFPCommitteeRoleUpdate(BaseModel):
    """Schema for updating a CFP committee role."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class CFPCommitteeRoleResponse(BaseModel):
    """CFP committee role response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CFPCommitteeRoleListResponse(BaseModel):
    """List of CFP committee roles."""

    items: list[CFPCommitteeRoleResponse]
    total: int


# --- Pronoun Option Schemas (conference-scoped) ---


class PronounOptionCreate(BaseModel):
    """Schema for creating a pronoun option."""

    name: str = Field(..., min_length=1, max_length=100)
    is_active: bool = True


class PronounOptionUpdate(BaseModel):
    """Schema for updating a pronoun option."""

    name: str | None = Field(None, min_length=1, max_length=100)
    is_active: bool | None = None


class PronounOptionResponse(BaseModel):
    """Pronoun option response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    conference_id: UUID
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PronounOptionListResponse(BaseModel):
    """List of pronoun options."""

    items: list[PronounOptionResponse]
    total: int


# --- Invoice Settings Schemas ---


class BankAccount(BaseModel):
    """Bank account for invoice payments."""

    bank_name: str = Field(..., min_length=1, max_length=200)
    iban: str = Field(..., min_length=15, max_length=34)
    bic: str | None = Field(None, max_length=11)
    is_default: bool = False

    model_config = ConfigDict(from_attributes=True)

    @field_validator("iban")
    @classmethod
    def validate_iban(cls, v: str) -> str:
        """Validate IBAN format and checksum."""
        if not v:
            raise ValueError("IBAN is required")

        # Remove spaces and convert to uppercase
        cleaned = v.replace(" ", "").upper()

        try:
            # Validate with schwifty library (validates format + checksum)
            from schwifty import IBAN

            iban_obj = IBAN(cleaned)
            return str(iban_obj)  # Returns formatted IBAN
        except ValueError as e:
            raise ValueError(f"Invalid IBAN: {e!s}") from e

    @field_validator("bic")
    @classmethod
    def validate_bic(cls, v: str | None) -> str | None:
        """Validate BIC format if provided."""
        if not v:
            return None

        cleaned = v.replace(" ", "").upper()

        try:
            from schwifty import BIC

            bic_obj = BIC(cleaned)
            return str(bic_obj)
        except ValueError as e:
            raise ValueError(f"Invalid BIC: {e!s}") from e


class VatRule(BaseModel):
    """Single VAT decision rule for conference invoicing.

    Each rule is uniquely identified by (attendance_type, customer_type, customer_location).
    """

    attendance_type: str = Field(..., max_length=20)
    customer_type: str = Field(..., max_length=10)
    customer_location: str = Field(..., max_length=10)
    charge_vat: bool = True
    vat_rate_source: str = Field(default="conference", max_length=20)
    reverse_charge: bool = False
    oss_applicable: bool = False
    note: str = Field(default="", max_length=200)

    @field_validator("attendance_type")
    @classmethod
    def check_attendance_type(cls, v: str) -> str:
        from app.core.default_settings import VALID_ATTENDANCE_TYPES

        if v not in VALID_ATTENDANCE_TYPES:
            raise ValueError(f"Must be one of: {', '.join(sorted(VALID_ATTENDANCE_TYPES))}")
        return v

    @field_validator("customer_type")
    @classmethod
    def check_customer_type(cls, v: str) -> str:
        from app.core.default_settings import VALID_CUSTOMER_TYPES

        if v not in VALID_CUSTOMER_TYPES:
            raise ValueError(f"Must be one of: {', '.join(sorted(VALID_CUSTOMER_TYPES))}")
        return v

    @field_validator("customer_location")
    @classmethod
    def check_customer_location(cls, v: str) -> str:
        from app.core.default_settings import VALID_CUSTOMER_LOCATIONS

        if v not in VALID_CUSTOMER_LOCATIONS:
            raise ValueError(f"Must be one of: {', '.join(sorted(VALID_CUSTOMER_LOCATIONS))}")
        return v

    @field_validator("vat_rate_source")
    @classmethod
    def check_vat_rate_source(cls, v: str) -> str:
        from app.core.default_settings import VALID_VAT_RATE_SOURCES

        if v not in VALID_VAT_RATE_SOURCES:
            raise ValueError(f"Must be one of: {', '.join(sorted(VALID_VAT_RATE_SOURCES))}")
        return v


class InvoiceCompanyInfo(BaseModel):
    """Company billing information for invoice headers."""

    name: str | None = None
    address: str | None = None  # NEW: single field (was address_line1 + address_line2)
    city: str | None = None
    postal_code: str | None = None
    country: str | None = None
    tax_id: str | None = None
    phone: str | None = None  # Company phone number for invoices
    vat_source: str | None = None  # "company" | "fiscal_rep"
    bank_accounts: list[BankAccount] = []  # Array replaces single bank fields

    # Legacy fields (kept for backward compatibility):
    address_line1: str | None = None
    address_line2: str | None = None
    bank_name: str | None = None
    iban: str | None = None
    bic: str | None = None

    footer_text: str | None = None
    logo_url: str | None = None  # Path to attachment
    second_currency: str | None = None  # ISO 4217 code (e.g. "USD")
    exchange_rate: float | None = None  # Rate from primary to second currency

    @field_validator("vat_source")
    @classmethod
    def validate_vat_source(cls, v: str | None) -> str | None:
        """Validate VAT source selector."""
        if v and v not in ("company", "fiscal_rep"):
            raise ValueError("Must be 'company' or 'fiscal_rep'")
        return v


class InvoiceSettingsResponse(BaseModel):
    """Invoice configuration response schema."""

    model_config = ConfigDict(from_attributes=True)

    invoice_number_template: str
    invoice_counter_reset: str  # "daily" or "yearly"
    invoice_counter_value: int
    invoice_template_html: str  # Legacy: bank_transfer template body
    invoice_templates: dict[str, str] = {}  # {type_key: html_body}
    invoice_footer_html: str  # Shared footer (position: fixed, bottom: 0)
    invoice_header_html: str = ""  # Shared header (position: fixed, top: 0)
    invoice_company_info: InvoiceCompanyInfo
    invoice_page_format: str  # "A4", "Letter", "Legal", etc.
    # Cancellation number settings
    cancellation_number_template: str
    cancellation_counter_reset: str  # "daily" or "yearly"
    cancellation_counter_value: int
    # VAT decision rules
    vat_rules: list[VatRule] = []
    # Number format
    number_format_preset: str = "us_uk"
    decimal_separator: str = "."
    thousands_separator: str = ","
    currency_position: str = "before"
    # EU member states
    eu_countries: list[str] = []


class InvoiceSettingsUpdate(BaseModel):
    """Invoice configuration update schema."""

    invoice_number_template: str | None = None
    invoice_counter_reset: str | None = None
    invoice_counter_value: int | None = None  # Allow manual reset
    invoice_template_html: str | None = None  # Legacy: bank_transfer body
    invoice_templates: dict[str, str] | None = None  # {type_key: html_body}
    invoice_footer_html: str | None = None
    invoice_header_html: str | None = None
    invoice_company_info: InvoiceCompanyInfo | None = None
    invoice_page_format: str | None = None  # Page format (A4, Letter, etc.)
    # Cancellation number settings
    cancellation_number_template: str | None = None
    cancellation_counter_reset: str | None = None
    cancellation_counter_value: int | None = None
    # VAT decision rules
    vat_rules: list[VatRule] | None = None
    # Number format preset (resolves to decimal_separator, thousands_separator, currency_position)
    number_format_preset: str | None = None
    # EU member states (list of ISO 3166-1 alpha-2 codes)
    eu_countries: list[str] | None = None

    @field_validator("invoice_counter_reset", "cancellation_counter_reset")
    @classmethod
    def validate_reset_mode(cls, v: str | None) -> str | None:
        """Validate counter reset mode."""
        if v and v not in ("daily", "yearly"):
            raise ValueError("Must be 'daily' or 'yearly'")
        return v

    @field_validator("invoice_page_format")
    @classmethod
    def validate_page_format(cls, v: str | None) -> str | None:
        """Validate page format."""
        allowed = ("A4", "A5", "Letter", "Legal", "B5", "Tabloid")
        if v and v not in allowed:
            raise ValueError(f"Must be one of: {', '.join(allowed)}")
        return v

    @field_validator("number_format_preset")
    @classmethod
    def validate_number_format_preset(cls, v: str | None) -> str | None:
        """Validate preset code against known presets."""
        if v is not None:
            from app.core.currency_formats import FORMAT_PRESETS

            if v not in FORMAT_PRESETS:
                allowed = ", ".join(sorted(FORMAT_PRESETS.keys()))
                raise ValueError(f"Must be one of: {allowed}")
        return v

    @field_validator("eu_countries")
    @classmethod
    def validate_eu_countries(cls, v: list[str] | None) -> list[str] | None:
        """Validate country codes are 2-letter uppercase ISO codes."""
        if v is not None:
            for code in v:
                if not (len(code) == 2 and code.isalpha() and code.isupper()):
                    raise ValueError(f"Invalid country code: {code}. Must be 2-letter uppercase ISO code.")
        return v


# --- Stripe Settings Schemas ---


class StripeSettings(BaseModel):
    """Stripe API configuration (for updates)."""

    publishable_key: str | None = None
    secret_key: str | None = None  # Full key when updating
    webhook_secret: str | None = None  # Webhook signing secret
    is_enabled: bool | None = None


class StripeSettingsResponse(BaseModel):
    """Stripe API configuration (for responses with conditional masking)."""

    publishable_key: str | None = None
    secret_key: str | None = None  # Masked for non-super-users
    webhook_secret: str | None = None  # Masked for non-super-users
    is_enabled: bool = False


# Re-exports for backward compatibility
from app.schemas.booking_schemas import (  # noqa: E402, F401
    BookingMatrixResponse,
    BookingOptionCreate,
    BookingOptionListResponse,
    BookingOptionResponse,
    BookingOptionUpdate,
    BookingPackageCreate,
    BookingPackageListResponse,
    BookingPackageResponse,
    BookingPackageUpdate,
    BookingPeriodCreate,
    BookingPeriodListResponse,
    BookingPeriodResponse,
    BookingPeriodUpdate,
    BulkDiscountCodeCreate,
    BulkDiscountCodeResponse,
    BulkDiscountEntry,
    DiscountCodeCreate,
    DiscountCodeListResponse,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)
