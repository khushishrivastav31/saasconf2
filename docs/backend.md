# SaaSConf Backend Developer Documentation

Multi-tenant SaaS platform for conference management. Built with **FastAPI**, **async SQLAlchemy**, **PostgreSQL** (with Row-Level Security), and **Redis**.

---

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [Entry Point and Application Lifecycle](#entry-point-and-application-lifecycle)
3. [Configuration](#configuration)
4. [Router Organization](#router-organization)
5. [Sub-package Pattern](#sub-package-pattern)
6. [Models](#models)
7. [Schema Patterns](#schema-patterns)
8. [Core Utilities](#core-utilities)
9. [Database and Migrations](#database-and-migrations)
10. [Authentication and Authorization](#authentication-and-authorization)
11. [Key Dependencies](#key-dependencies)
12. [Common Patterns and Gotchas](#common-patterns-and-gotchas)

---

## Directory Structure

```
backend/
  alembic.ini                          # Alembic configuration
  requirements.txt                     # Python dependencies
  app/
    main.py                            # FastAPI entry point
    config.py                          # Pydantic Settings
    api/
      v1/
        router.py                      # Main router (combines all sub-routers)
        auth.py                        # Authentication endpoints
        attachments.py                 # File attachment endpoints
        form_schema.py                 # Paper form schema endpoints
        invoices.py                    # Invoice endpoints
        locations.py                   # Location endpoints
        modules.py                     # Module admin endpoints
        tenants.py                     # Tenant admin endpoints
        users.py                       # User management endpoints
        volunteers.py                  # Volunteer endpoints
        tenant_company.py              # Tenant company profile
        user_conference_access.py      # Conference access management
        applicant_activity.py          # Applicant activity logs
        audit.py                       # Audit log endpoints
        admin_settings.py              # Platform admin settings
        service_providers.py           # Service provider endpoints
        sponsors.py                    # Sponsor endpoints
        sponsor_contracts.py           # Sponsor contract management
        conferences/                   # Conference CRUD (sub-package)
          __init__.py                  # Barrel export
          _shared.py                   # Shared helpers
          core.py                      # Core CRUD
          associations.py              # Conference associations
          logo.py                      # Conference logo upload
        cfp/                           # Call for Papers (sub-package)
          __init__.py
          shared.py
          committee.py                 # Committee member management
          applicants.py                # Applicant management
          papers.py                    # Paper management
          topics.py                    # Topic management
        cfp_portal/                    # CFP Portal (sub-package)
          __init__.py
          shared.py
          auth.py                      # Applicant authentication
          papers.py                    # Paper submission (portal)
          reviews.py                   # Review endpoints (portal)
          messaging.py                 # Messaging (portal)
          form_schema.py               # Dynamic form schema (portal)
        settings/                      # Conference settings (sub-package)
          __init__.py                  # Barrel export (17 sub-routers)
          _shared.py                   # Shared helpers
          booking_matrix.py
          booking_options.py
          booking_packages.py
          booking_periods.py
          committee_roles.py
          currencies.py
          discount_codes.py
          email_templates.py
          location_types.py
          pronouns.py
          review_criteria.py
          review_form_settings.py
          review_questions.py
          score_scales.py
          session_types.py
          sponsor_packages.py
          volunteer_roles.py
        program/                       # Program design (sub-package)
          __init__.py
          _shared.py
          days.py                      # Program days
          tracks.py                    # Program tracks
          slots.py                     # Time slots
          sessions.py                  # Sessions
          grid.py                      # Grid view
          publish.py                   # Program publication
        messaging/                     # Messaging system (sub-package)
          __init__.py
          _shared.py
          threads.py                   # Message threads
          bulk.py                      # Bulk messaging
          attachments.py               # Message attachments
          templates.py                 # Message templates
          recipient_lists.py           # Recipient list management
          global_unread.py             # Cross-conference unread counts
    models/                            # SQLAlchemy models
      __init__.py                      # Re-exports all models
      user.py
      tenant.py
      conference.py
      cfp.py
      form_schema.py
      review.py
      settings.py
      program.py
      messaging.py
      sponsor.py
      sponsor_contract.py             # Sponsor contracts + versions
      ...
    schemas/                           # Pydantic schemas
      cfp.py
      cfp_portal.py
      settings.py
      program.py
      form_schema.py
      ...
    core/                              # Core utilities
      dependencies.py                  # Auth dependencies and DI
      security.py                      # Password hashing and JWT
      pagination.py                    # Paginated query helper
      exceptions.py                    # Exception hierarchy
      file_validation.py              # Upload validation
      email.py                         # Resend email integration
      search.py                        # Accent-insensitive search
      utils.py                         # utcnow() helper
      validators.py                    # Phone + email validation
      address.py                       # Country-specific formatting
      html_sanitize.py                 # nh3 HTML sanitization
      token_blacklist.py               # Redis token revocation
      email_templates.py               # Email template rendering
    db/
      base.py                          # DeclarativeBase
      session.py                       # Async engine, session factory, RLS
      migrations/
        env.py                         # Alembic environment
        versions/                      # Migration scripts (numbered)
```

---

## Entry Point and Application Lifecycle

**File:** `backend/app/main.py`

The FastAPI app is created with a lifespan handler that manages Redis connections:

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    _check_production_safety()
    await init_redis()
    yield
    # Shutdown
    await close_redis()
```

### Middleware Stack

Middleware is applied in this order (outermost first):

| Middleware | Purpose |
|---|---|
| `SecurityHeadersMiddleware` | Sets `X-Content-Type-Options`, `X-Frame-Options`, CSP, HSTS (non-debug only), `Referrer-Policy`, `Permissions-Policy`, `X-XSS-Protection` |
| `CORSMiddleware` | Allows configured origins with credentials, standard HTTP methods |
| SlowAPI rate limiter | Per-IP rate limiting via `slowapi` |

### Exception Handlers

Custom exception handlers map the `SaaSConfException` hierarchy to HTTP status codes. All handlers manually inject CORS headers via `_cors_response()` because FastAPI exception handlers bypass `CORSMiddleware`:

| Exception | HTTP Status | `type` field |
|---|---|---|
| `AuthenticationError` | 401 | `authentication_error` |
| `AuthorizationError` | 403 | `authorization_error` |
| `NotFoundError` | 404 | `not_found_error` |
| `SaaSConfException` (catch-all) | 400 | `error` |
| `Exception` (unhandled) | 500 | `server_error` |

Unhandled exceptions are explicitly captured by Sentry (because the catch-all handler prevents automatic propagation). In debug mode, the actual error type and message are returned in the 500 response body.

### API Docs

- `/docs` (Swagger) and `/redoc` are only enabled when `DEBUG=True`.
- All API routes are mounted under `/api/v1`.
- Health check is at `GET /health` (always available, outside `/api/v1`).

### Production Safety Warnings

On startup, `_check_production_safety()` logs warnings if:

- `DEBUG=True` in a non-development environment
- `SUPER_ADMIN_EMAIL` is still the default
- `CORS_ORIGINS` contains localhost entries
- `RESEND_API_KEY` is not set (emails will only be logged, not sent)

---

## Configuration

**File:** `backend/app/config.py`

Uses `pydantic-settings` `BaseSettings` with `.env` file support. Settings are cached via `@lru_cache` in `get_settings()`.

| Setting | Type | Default | Notes |
|---|---|---|---|
| `APP_NAME` | `str` | `"SaaSConf"` | |
| `APP_VERSION` | `str` | `"0.1.0"` | |
| `DEBUG` | `bool` | `False` | Enables `/docs`, `/redoc`, verbose error responses |
| `DATABASE_URL` | `str` | `postgresql+asyncpg://localhost:5432/saasconf` | Must use `asyncpg` driver |
| `REDIS_URL` | `str` | `redis://localhost:6379` | Used for token blacklist |
| `JWT_SECRET_KEY` | `str` | **(required)** | Minimum 32 characters, validated at startup |
| `JWT_ALGORITHM` | `str` | `"HS256"` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `int` | `15` | Short-lived access tokens |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `int` | `7` | |
| `CORS_ORIGINS` | `list[str]` | `["http://localhost:3000", ...]` | Six localhost origins for dev |
| `MAX_UPLOAD_SIZE_MB` | `int` | `10` | |
| `RATE_LIMIT_LOGIN` | `str` | `"10/minute"` | SlowAPI format; paired with 5-attempt per-email lockout |
| `RATE_LIMIT_API` | `str` | `"100/minute"` | SlowAPI format |
| `SUPER_ADMIN_EMAIL` | `str` | `"admin@saasconf.com"` | Initial super admin account |
| `SUPER_ADMIN_PASSWORD` | `str` | **(required)** | Minimum 10 characters |
| `SENTRY_DSN` | `str` | `""` | Empty string disables Sentry |
| `SENTRY_ENVIRONMENT` | `str` | `"development"` | |
| `RESEND_API_KEY` | `str` | `""` | Empty string falls back to console logging |
| `RESEND_FROM_EMAIL` | `str` | `"noreply@sonrisa.ventures"` | |
| `RESEND_FROM_NAME` | `str` | `"SaaSConf"` | |

### Startup Validation

A `@model_validator` runs after construction and enforces:

- `JWT_SECRET_KEY` is not empty or the placeholder value, and is at least 32 characters.
- `SUPER_ADMIN_PASSWORD` is at least 10 characters.

If either check fails, the application will not start.

---

## Router Organization

**File:** `backend/app/api/v1/router.py`

The main `api_router` composes all endpoint routers. Every route is prefixed with `/api/v1` when mounted in `main.py`.

| Router import | Prefix | Tags | Access level |
|---|---|---|---|
| `auth` | `/auth` | Authentication | Public |
| `tenants` | `/admin/tenants` | Tenants | Super admin |
| `modules` | `/admin/modules` | Modules | Super admin |
| `audit` | `/admin/audit-logs` | Audit | Super admin |
| `admin_settings` | `/admin/settings` | Admin Settings | Super admin |
| `users` | `/users` | Users | Tenant admin+ |
| `user_conference_access` | `/user-conference-access` | User Conference Access | Tenant admin+ |
| `tenant_company` | `/my-company` | My Company | Tenant admin |
| `applicant_activity` | `/applicant-activity` | Applicant Activity | Tenant admin |
| `conferences` | `/conferences` | Conferences | Module access |
| `volunteers` | `/volunteers` | Volunteers | Module access |
| `locations` | `/locations` | Locations | Module access |
| `cfp` | `/cfp` | Call for Papers | Module access |
| `settings` | `/conferences/{conference_id}/settings` | Settings | Conference admin+ |
| `form_schema` | `/conferences/{conference_id}/paper-form-schema` | Paper Form Schema | Conference admin+ |
| `service_providers` | `/locations/{location_id}/service-providers` | Service Providers | Module access |
| `sponsors` | `/conferences/{conference_id}/sponsors` | Sponsors | Conference admin+ |
| `sponsor_contracts` | `/conferences/{conference_id}/sponsors/{sponsor_id}/contract` | Sponsor Contracts | Conference admin+ |
| `invoices` | `/conferences/{conference_id}/invoices` | Invoices | Conference admin+ |
| `program` | `/conferences/{conference_id}/program` | Program | Conference admin+ |
| `messaging` | `/conferences/{conference_id}/messaging` | Messaging | Conference admin+ |
| `global_unread_router` | `/messaging` | Messaging | Authenticated |
| `attachments` | `/attachments` | Attachments | Authenticated |
| `cfp_portal` | *(no prefix)* | CFP Portal | Public/applicant auth |

### Full URL Examples

```
GET  /api/v1/auth/login
GET  /api/v1/admin/tenants
GET  /api/v1/conferences
GET  /api/v1/conferences/{id}/settings/session-types
GET  /api/v1/conferences/{id}/program/days
POST /api/v1/cfp/papers
GET  /api/v1/messaging/unread-count          (global unread)
GET  /api/v1/conferences/{id}/messaging/threads
```

---

## Sub-package Pattern

When an endpoint file grows beyond a manageable size, it is refactored into a **sub-package** with this structure:

```
endpoint_name/
  __init__.py      # Barrel export: creates APIRouter, includes all sub-routers
  _shared.py       # Shared helper functions (e.g., resolve conference, check admin)
  feature_a.py     # Individual feature router
  feature_b.py     # Individual feature router
```

### Barrel `__init__.py` Pattern

```python
# backend/app/api/v1/settings/__init__.py
from fastapi import APIRouter
from .session_types import router as session_types_router
from .volunteer_roles import router as volunteer_roles_router
# ... more imports ...

router = APIRouter()
router.include_router(session_types_router)
router.include_router(volunteer_roles_router)
# ... more includes ...
```

The parent `router.py` imports and mounts this package router as if it were a single module:

```python
from app.api.v1 import settings
api_router.include_router(settings.router, prefix="/conferences/{conference_id}/settings", tags=["Settings"])
```

### Shared Helper Pattern (`_shared.py`)

Each sub-package has a `_shared.py` (or `shared.py` in `cfp/` and `cfp_portal/`) that provides common operations used by all sub-modules:

```python
# backend/app/api/v1/settings/_shared.py

async def _resolve_conference(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> Conference:
    """Resolve and verify the conference belongs to the user's tenant."""
    result = await db.execute(select(Conference).where(Conference.id == conference_id))
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    if current_user.tenant_id is not None and conference.tenant_id != current_user.tenant_id:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    return conference

async def _check_conference_admin(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """Check if user has admin access (tenant admin or conference-specific)."""
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")
```

Sub-modules import from `_shared.py`:

```python
from ._shared import _resolve_conference, _check_conference_admin
```

### Sub-packages and Their Modules

| Package | Modules | Description |
|---|---|---|
| `conferences/` | `core.py`, `associations.py`, `logo.py` | Conference CRUD, linking, logo upload |
| `program/` | `days.py`, `tracks.py`, `slots.py`, `sessions.py`, `grid.py`, `publish.py` | Full program design |
| `messaging/` | `threads.py`, `bulk.py`, `attachments.py`, `templates.py`, `recipient_lists.py`, `global_unread.py` | In-app messaging system |
| `settings/` | 17 modules (see [Directory Structure](#directory-structure)) | Conference-scoped settings |
| `cfp/` | `committee.py`, `applicants.py`, `papers.py`, `topics.py` | Call for Papers management |
| `cfp_portal/` | `auth.py`, `papers.py`, `reviews.py`, `messaging.py`, `form_schema.py` | Public-facing applicant portal |

---

## Models

**File:** `backend/app/models/__init__.py`

All models inherit from `app.db.base.Base` (SQLAlchemy `DeclarativeBase`). Models use the SQLAlchemy 2.0 `Mapped[]` annotation style.

### Model Example

```python
# backend/app/models/conference.py
class Conference(Base):
    __tablename__ = "conferences"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    social_links: Mapped[dict] = mapped_column(JSONB, default=dict)
    team_members: Mapped[list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="conferences")
    cfps: Mapped[list["CallForPapers"]] = relationship(
        "CallForPapers", secondary="conference_cfps", viewonly=True,
    )
```

### Model Inventory (45+ Models)

#### User and Authentication

| Model | Table | File | Description |
|---|---|---|---|
| `User` | `users` | `user.py` | Platform users (super admin, tenant admin, regular user) |
| `RefreshToken` | `refresh_tokens` | `token.py` | Stored refresh token hashes |
| `ApplicantEmailVerification` | `applicant_email_verifications` | `applicant_token.py` | Portal email verification tokens |
| `ApplicantRefreshToken` | `applicant_refresh_tokens` | `applicant_token.py` | Portal refresh tokens |

#### Tenant

| Model | Table | File | Description |
|---|---|---|---|
| `Tenant` | `tenants` | `tenant.py` | Company/organization |
| `Module` | `modules` | `module.py` | Platform feature modules |
| `TenantModule` | `tenant_modules` | `module.py` | Module assignment to tenants |

#### Conference

| Model | Table | File | Description |
|---|---|---|---|
| `Conference` | `conferences` | `conference.py` | Conference event |
| `ConferenceCFP` | `conference_cfps` | `associations.py` | Conference-to-CFP link (M2M) |
| `ConferenceLocation` | `conference_locations` | `associations.py` | Conference-to-Location link (M2M) |
| `ConferenceVolunteer` | `conference_volunteers` | `associations.py` | Conference-to-Volunteer link (M2M) |
| `UserConferenceAccess` | `user_conference_access` | `user_conference_access.py` | Per-user conference permissions |

#### Call for Papers

| Model | Table | File | Description |
|---|---|---|---|
| `CallForPapers` | `call_for_papers` | `cfp.py` | CFP configuration |
| `CFPApplicant` | `cfp_applicants` | `cfp.py` | Applicant profiles |
| `Submission` | `submissions` | `cfp.py` | Paper submissions (legacy) |
| `ConferencePaperFormSchema` | `conference_paper_form_schemas` | `form_schema.py` | Dynamic form configuration |
| `PaperFormField` | `paper_form_fields` | `form_schema.py` | Individual form fields |

#### Reviews

| Model | Table | File | Description |
|---|---|---|---|
| `PaperReview` | `paper_reviews` | `review.py` | Review records |
| `ReviewAnswer` | `review_answers` | `review.py` | Individual review answers |
| `ReviewCriterion` | `review_criteria` | `review.py` | Evaluation criteria |
| `ReviewQuestion` | `review_questions` | `review.py` | Review form questions |
| `ReviewScoreScale` | `review_score_scales` | `review.py` | Score scale definitions |
| `ReviewScaleOption` | `review_scale_options` | `review.py` | Score scale option values |
| `ReviewFormSettings` | `review_form_settings` | `review.py` | Review form configuration |

#### Settings

| Model | Table | File | Description |
|---|---|---|---|
| `BookingOption` | `booking_options` | `settings.py` | Booking pricing options |
| `BookingPeriod` | `booking_periods` | `settings.py` | Booking time periods |
| `DiscountCode` | `discount_codes` | `settings.py` | Discount codes |
| `DiscountCodeOption` | `discount_code_options` | `settings.py` | Discount-to-option mapping |
| `DiscountCodePeriod` | `discount_code_periods` | `settings.py` | Discount-to-period mapping |
| `SponsorPackage` | `sponsor_packages` | `settings.py` | Sponsor package tiers |
| `EmailTemplate` | `email_templates` | `settings.py` | Customizable email templates |
| `PronounOption` | `pronoun_options` | `settings.py` | Pronoun choices |
| `SessionType` | `session_types` | `settings.py` | Session type definitions |
| `TenantLocationType` | `tenant_location_types` | `settings.py` | Location type taxonomy |
| `VolunteerRole` | `volunteer_roles` | `settings.py` | Volunteer role definitions |

#### Program

| Model | Table | File | Description |
|---|---|---|---|
| `ProgramDay` | `program_days` | `program.py` | Program schedule day |
| `ProgramTrack` | `program_tracks` | `program.py` | Parallel session tracks |
| `ProgramTimeSlot` | `program_time_slots` | `program.py` | Time slot definition |
| `ProgramSession` | `program_sessions` | `program.py` | Scheduled session in a slot |

#### Messaging

| Model | Table | File | Description |
|---|---|---|---|
| `MessageThread` | `message_threads` | `messaging.py` | Conversation thread |
| `Message` | `messages` | `messaging.py` | Individual message |
| `MessageParticipant` | `message_participants` | `messaging.py` | Thread participant |
| `MessageTemplate` | `message_templates` | `messaging.py` | Reusable message templates |
| `RecipientList` | `recipient_lists` | `messaging.py` | Saved recipient lists |
| `RecipientListMember` | `recipient_list_members` | `messaging.py` | Members of a recipient list |
| `ThreadFlag` | `thread_flags` | `messaging.py` | Thread status flags |

#### Other

| Model | Table | File | Description |
|---|---|---|---|
| `Location` | `locations` | `location.py` | Venue locations |
| `Volunteer` | `volunteers` | `volunteer.py` | Volunteer records |
| `Sponsor` | `sponsors` | `sponsor.py` | Conference sponsors |
| `SponsorContract` | `sponsor_contracts` | `sponsor_contract.py` | Sponsor contract (one per sponsor) |
| `SponsorContractVersion` | `sponsor_contract_versions` | `sponsor_contract.py` | Immutable version snapshots |
| `ServiceProvider` | `service_providers` | `service_provider.py` | Location service providers |
| `Invoice` | `invoices` | `invoice.py` | Financial invoices |
| `Attachment` | `attachments` | `attachment.py` | Uploaded file references |
| `AuditLog` | `audit_logs` | `audit.py` | Action audit trail |
| `ApplicantActivityLog` | `applicant_activity_logs` | `applicant_activity.py` | Applicant portal activity |
| `ApplicantActivityType` | *(enum)* | `applicant_activity.py` | Activity type enum |
| `PlatformCurrency` | `platform_currencies` | `platform_currency.py` | Supported currencies |

### Model Conventions

- **Primary keys:** `UUID(as_uuid=True)` with `default=uuid.uuid4`.
- **Tenant scoping:** Most models have a `tenant_id` foreign key with `ondelete="CASCADE"`.
- **Timestamps:** `created_at` uses `server_default=func.now()`. `updated_at` uses both `server_default=func.now()` and `onupdate=func.now()`.
- **Soft JSON storage:** `JSONB` columns are used for flexible data like `settings`, `social_links`, and `team_members`.
- **Type hints:** `TYPE_CHECKING` guards are used for relationship type annotations to avoid circular imports.
- **Relationships:** Use `viewonly=True` on many-to-many relationships to prevent accidental writes through the association table.

### User Roles

Defined in `backend/app/models/user.py`:

```python
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"   # Platform administrator (tenant_id = None)
    TENANT_ADMIN = "tenant_admin" # Company administrator
    USER = "user"                 # Regular company user
```

---

## Schema Patterns

**Directory:** `backend/app/schemas/`

All schemas use **Pydantic v2** `BaseModel`. The naming convention follows a consistent Create/Update/Response triple:

```python
class SessionTypeCreate(BaseModel):
    """Required fields for creating a new session type."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100)
    duration_minutes: int = Field(ge=1)

class SessionTypeUpdate(BaseModel):
    """All fields optional for partial updates."""
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = None
    duration_minutes: int | None = Field(None, ge=1)

class SessionTypeResponse(BaseModel):
    """Full model returned from API."""
    id: UUID
    tenant_id: UUID
    name: str
    slug: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True  # Enables ORM mode (model_validate from SQLAlchemy objects)
```

### List Response Pattern

Paginated list endpoints return a wrapper schema:

```python
class SessionTypeListResponse(BaseModel):
    items: list[SessionTypeResponse]
    total: int

# For endpoints using the paginate() utility:
class CFPListResponse(BaseModel):
    items: list[CFPResponse]
    total: int
    page: int
    page_size: int
    pages: int
```

### Validation Patterns

**Field validators** use the `@field_validator` decorator (Pydantic v2):

```python
from app.core.validators import validate_phone
from app.core.html_sanitize import sanitize_html

class ApplicantCreate(BaseModel):
    phone: str | None = Field(None, max_length=50)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        return validate_phone(v)  # E.164 normalization via libphonenumber
```

**Model validators** for cross-field validation:

```python
class CommitteeMemberCreate(BaseModel):
    applicant_id: UUID | None = None
    first_name: str | None = None
    email: EmailStr | None = None
    password: str | None = None

    @model_validator(mode="after")
    def check_applicant_or_new_user(self) -> "CommitteeMemberCreate":
        if self.applicant_id is None:
            if not self.first_name or not self.email or not self.password:
                raise ValueError("When applicant_id is not provided, first_name, email, and password are required")
        return self
```

**HTML sanitization** on rich text fields:

```python
class CFPBase(BaseModel):
    code_of_conduct: str | None = None

    @field_validator("code_of_conduct", "incentives_conditions", "tips_for_submission", ...)
    @classmethod
    def sanitize_rich_text(cls, v: str | None) -> str | None:
        return sanitize_html(v) if v else v
```

### IMPORTANT GOTCHA: Validators Run on Response Objects

Pydantic v2 validators run during **all** model construction, including when constructing response objects from database data. If the database contains data that fails validation (e.g., a phone number stored in a non-E.164 format), constructing the `Response` schema will raise a `ValidationError`, resulting in a **500 Internal Server Error**.

**How to avoid this:**

1. Do not put validators on `Response` schemas unless you are certain the DB data is always valid.
2. If a `Response` schema inherits from a `Base` schema that has validators, those validators will fire on response construction too.
3. When adding a new validator, check if the same field appears in the corresponding `Response` schema. If so, either ensure all existing DB data passes validation, or define the `Response` schema separately without the validator.

---

## Core Utilities

### dependencies.py

**File:** `backend/app/core/dependencies.py`

Provides FastAPI dependency injection for authentication and authorization.

#### CurrentUser Container

```python
class CurrentUser:
    user_id: UUID
    tenant_id: UUID | None      # None for super admins
    role: str
    modules: list[str]

    @property
    def is_super_admin(self) -> bool: ...
    @property
    def is_tenant_admin(self) -> bool: ...
    def has_module(self, module_code: str) -> bool: ...  # Super admins always return True
```

#### Dependency Functions

| Function | Returns | Purpose |
|---|---|---|
| `get_token_from_header()` | `str` | Extracts Bearer token from `Authorization` header |
| `get_current_user()` | `CurrentUser` | Decodes JWT, checks blacklist, verifies tenant is active, sets RLS context |
| `get_current_active_user()` | `User` | Fetches full `User` model from DB, verifies user is active |
| `require_super_admin()` | `CurrentUser` | Raises `AuthorizationError` unless super admin |
| `require_tenant_admin()` | `CurrentUser` | Raises `AuthorizationError` unless tenant admin or super admin |
| `require_conference_admin()` | `CurrentUser` | Checks super admin OR tenant admin OR conference-specific admin access |
| `require_module(module_code)` | *dependency factory* | Returns a dependency that checks module access |
| `check_conference_admin_access()` | `bool` | Queries `UserConferenceAccess` table for a specific user/conference pair |
| `get_client_ip()` | `str \| None` | Extracts client IP from `X-Forwarded-For` or direct connection |

#### Type Aliases

Use these in endpoint signatures for clean dependency injection:

```python
from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, SuperAdminDep

@router.get("/conferences")
async def list_conferences(
    current_user: CurrentUserDep,    # Annotated[CurrentUser, Depends(get_current_user)]
    db: DbSessionDep,               # Annotated[AsyncSession, Depends(get_db)]
) -> ...:
```

| Alias | Resolves to |
|---|---|
| `CurrentUserDep` | `Annotated[CurrentUser, Depends(get_current_user)]` |
| `ActiveUserDep` | `Annotated[User, Depends(get_current_active_user)]` |
| `SuperAdminDep` | `Annotated[CurrentUser, Depends(require_super_admin)]` |
| `TenantAdminDep` | `Annotated[CurrentUser, Depends(require_tenant_admin)]` |
| `DbSessionDep` | `Annotated[AsyncSession, Depends(get_db)]` |

#### Module Gating Example

```python
@router.get("/conferences", dependencies=[Depends(require_module("conference"))])
async def list_conferences(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ...:
    ...
```

---

### security.py

**File:** `backend/app/core/security.py`

#### Password Hashing (Argon2id)

```python
# Argon2 configuration
ph = PasswordHasher(
    time_cost=3,       # 3 iterations
    memory_cost=65536,  # 64 MB
    parallelism=4,      # 4 threads
)

hash_password(password: str) -> str           # Hash a plaintext password
verify_password(plain: str, hashed: str) -> bool  # Verify (returns False on mismatch, never raises)
```

#### JWT Token Management

```python
create_access_token(
    user_id: UUID,
    tenant_id: UUID | None,
    role: str,
    modules: list[str] | None = None,
    is_tenant_super_user: bool = False,
) -> str
# Payload: sub, tenant_id, role, modules, is_tenant_super_user, exp, iat, type="access", jti

create_refresh_token(user_id: UUID) -> tuple[str, str, datetime]
# Returns (raw_token, sha256_hash, expiry_datetime)
# Payload: sub, exp, iat, type="refresh", jti

decode_token(token: str, token_type: str = "access") -> dict[str, Any]
# Raises AuthenticationError on invalid/expired tokens or type mismatch
```

#### Utility Functions

```python
hash_token(token: str) -> str                 # SHA-256 hash for DB storage/lookup
generate_secure_password(length: int = 16) -> str  # Cryptographically secure random password
```

---

### pagination.py

**File:** `backend/app/core/pagination.py`

```python
@dataclass
class PaginatedResult:
    items: list[Any]
    total: int

async def paginate(
    db: AsyncSession,
    query: Select,        # Pre-filtered SQLAlchemy query
    page: int = 1,        # 1-based page number
    page_size: int = 50,  # Items per page
) -> PaginatedResult:
```

Usage in an endpoint:

```python
query = select(Conference).where(Conference.tenant_id == tenant_id).order_by(Conference.name)
result = await paginate(db, query, page=page, page_size=page_size)
# result.items -> list of Conference ORM objects
# result.total -> total count (ignoring pagination)
```

The function runs two queries: one `SELECT count(*)` over a subquery, and one with `OFFSET`/`LIMIT`.

---

### exceptions.py

**File:** `backend/app/core/exceptions.py`

```
SaaSConfException (base)           -> 400 Bad Request
  AuthenticationError              -> 401 Unauthorized
  AuthorizationError               -> 403 Forbidden
    ModuleNotAssignedError         -> 403 Forbidden
  NotFoundError                    -> 404 Not Found
    TenantNotFoundError            -> 404 Not Found
    UserNotFoundError              -> 404 Not Found
    ModuleNotFoundError            -> 404 Not Found
  ValidationError                  -> 400 Bad Request
```

All exceptions accept `message: str` and optional `details: Any`:

```python
raise NotFoundError(f"Conference with ID '{conference_id}' not found")
raise ValidationError("A session type with this slug already exists")
raise AuthorizationError("Admin access to this conference required")
```

---

### file_validation.py

**File:** `backend/app/core/file_validation.py`

Provides defense-in-depth file upload validation. The `filetype` library reads magic bytes to detect the real MIME type, independent of the client-supplied `Content-Type` header.

#### Entity-Specific MIME Allowlists

```python
ALLOWED_MIME_TYPES = {
    "applicant_picture": {"image/jpeg", "image/png", "image/webp"},
    "applicant_video":   {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "paper_video":       {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"},
    "conference_logo":   {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "tenant_logo":       {"image/jpeg", "image/png", "image/webp", "image/gif"},
    "sponsor_logo":      {"image/jpeg", "image/png", "image/webp", "image/gif"},
}
```

Unknown entity types fall back to `DEFAULT_ALLOWED_MIME_TYPES` (images, PDFs, Office docs, text, CSV, video).

#### Functions

| Function | Purpose |
|---|---|
| `validate_upload(file_data, claimed_content_type, entity_type) -> str` | Returns verified MIME type. Raises `ValidationError` on disallowed or unverifiable types. Falls back to claimed type for text/Office formats that lack magic bytes. |
| `sanitize_filename(name) -> str` | Strips null bytes, path separators, `..` traversal, leading/trailing dots, and dangerous double extensions (`.php.jpg` becomes `.jpg`). Returns `"unnamed"` for empty results. |
| `strip_image_metadata(file_data, content_type) -> bytes` | Re-encodes JPEG/PNG/WebP images via Pillow to strip EXIF and other metadata. Returns original bytes for non-image or unsupported formats. |
| `safe_content_disposition(filename, disposition) -> str` | Builds a safe `Content-Disposition` header with proper escaping. Uses RFC 5987 `filename*` encoding for non-ASCII filenames. |

---

### email.py

**File:** `backend/app/core/email.py`

Sends emails via the [Resend](https://resend.com) API. Falls back to console logging when `RESEND_API_KEY` is not set (development mode).

#### Core Send Function

```python
async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
) -> bool:
```

Returns `True` on success, `False` on failure (never raises).

#### High-Level Email Functions

| Function | Template Type | Conference Email Check |
|---|---|---|
| `send_verification_email()` | `APPLICANT_VERIFICATION` or `COMMITTEE_VERIFICATION` | No (always sent) |
| `send_submission_confirmation_email()` | `SUBMISSION_CONFIRMATION` | Yes |
| `send_cospeaker_invitation_email()` | `CO_SPEAKER_INVITATION` | Yes |
| `send_password_reset_email()` | `PASSWORD_RESET` | No (always sent) |
| `send_tenant_user_welcome_email()` | `TENANT_USER_WELCOME` | No (not conference-scoped) |
| `send_new_message_notification()` | `NEW_MESSAGE_NOTIFICATION` | Yes |
| `send_direct_message_email()` | *(inline template)* | No (used when in-app messaging is disabled) |

Emails are rendered through `app.core.email_templates.render_email()`, which supports per-conference template overrides.

The `_is_email_enabled_for_conference()` helper checks `conference.settings["email_sending_enabled"]` before sending non-critical emails. Verification and password reset emails are always sent.

---

### email_templates.py

**File:** `backend/app/core/email_templates.py`

Renders email content by replacing `[Placeholder]` tokens with context values. Supports per-conference template overrides stored in the `email_templates` table.

#### Template Types (`EmailTemplateType`)

| Type | Purpose |
|------|---------|
| `applicant_verification` | Email verification for CFP applicants |
| `committee_verification` | Email verification for committee members |
| `submission_confirmation` | Paper submission confirmation |
| `co_speaker_invitation` | Co-speaker invitation link |
| `password_reset` | Password reset link |
| `tenant_user_welcome` | Welcome email for new tenant users |
| `new_message_notification` | In-app message notification |
| `sponsor_contract_send` | Sponsor contract delivery with DOCX attachment |

#### Context Builders

- `render_email(db, conference_id, template_type, context)` — loads template, replaces placeholders, returns `(subject, html_body)`
- `build_sponsor_contract_context(sponsor, contract, package, custom_message)` — builds context dict for `sponsor_contract_send` with `[Recipient Name]`, `[Package Name]`, `[Custom Message]`, `[Contract Content]`

---

### search.py

**File:** `backend/app/core/search.py`

```python
def unaccent_ilike(column: ColumnElement, term: str) -> ColumnElement:
    """Accent-insensitive ILIKE using PostgreSQL unaccent extension."""
    return func.unaccent(column).ilike(func.unaccent(f"%{term}%"))
```

Requires the PostgreSQL `unaccent` extension to be installed. Wraps both the column and the search term so that `muller` matches `Muller`, `cafe` matches `cafe`, etc.

Usage:

```python
from app.core.search import unaccent_ilike

query = select(User).where(unaccent_ilike(User.first_name, search_term))
```

---

### utils.py

**File:** `backend/app/core/utils.py`

```python
def utcnow() -> datetime:
    """Timezone-aware UTC now. Use instead of datetime.utcnow()."""
    return datetime.now(timezone.utc)
```

Always use `utcnow()` instead of `datetime.utcnow()` (which returns a naive datetime). This ensures all timestamps are timezone-aware and consistent.

---

### validators.py

**File:** `backend/app/core/validators.py`

```python
def validate_phone(value: str | None) -> str | None:
def validate_email_format(value: str | None) -> str | None:
```

**`validate_phone`:**
- Uses `libphonenumber` (Google's phone number library) for validation.
- Requires international format with country code (e.g., `+49123456789`).
- Returns the E.164 normalized value on success, raises `ValueError` on invalid input.
- Passes through `None` and empty string unchanged.
- Designed for direct use in Pydantic `@field_validator` decorators.

**`validate_email_format`:**
- Regex-based email validation (`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`).
- Returns `None` on valid input, error string on invalid.
- Same regex is shared between backend and frontend (`validators.ts`).

---

### address.py

**File:** `backend/app/core/address.py`

Formats postal addresses according to country-specific conventions.

```python
def format_address(
    *,
    address_line1: str | None = None,
    address_line2: str | None = None,
    city: str | None = None,
    state: str | None = None,
    postal_code: str | None = None,
    country: str | None = None,
    country_code: str | None = None,
) -> str | None:
```

Supported country formats: DE, AT, CH, US, CA, GB, FR, BE, NL, JP. Falls back to comma-separated format for unknown countries.

Country resolution accepts ISO 3166-1 alpha-2 codes, or common names in English and native language (e.g., `"Deutschland"` resolves to `"DE"`).

---

### html_sanitize.py

**File:** `backend/app/core/html_sanitize.py`

Server-side HTML sanitization using [nh3](https://github.com/messense/nh3) (Rust-based, bindings for the `ammonia` library).

```python
def sanitize_html(html: str) -> str:
```

This is a **defense-in-depth** measure. The frontend also sanitizes with DOMPurify, but server-side sanitization ensures safety regardless of client behavior.

**Allowed tags:** `p`, `br`, `hr`, headings, `blockquote`, `pre`, `code`, lists, inline formatting (`strong`, `em`, `u`, `s`, etc.), tables, `img`, `a`, `span`.

**Allowed attributes:** `href`/`title`/`target` on `<a>`, `src`/`alt`/`width`/`height` on `<img>`, `colspan`/`rowspan` on table cells, `class` on `span`/`p`/`pre`/`code`.

**Allowed URL schemes:** `http`, `https`, `mailto`. All links get `rel="noopener noreferrer"`.

Everything else (including `<script>`, `<iframe>`, `<svg>`, event handlers) is stripped.

---

### token_blacklist.py

**File:** `backend/app/core/token_blacklist.py`

Redis-based access token revocation for logout.

**Design:** Fail-open. If Redis is unavailable, tokens are NOT considered blacklisted. This prioritizes availability over instant revocation, which is acceptable because access tokens are already short-lived (15 minutes by default).

```python
async def init_redis() -> None       # Called at app startup (lifespan handler)
async def close_redis() -> None      # Called at app shutdown
async def blacklist_token(jti: str, ttl_seconds: int) -> None  # Add token JTI with auto-expiry
async def is_token_blacklisted(jti: str) -> bool                # Check blacklist (False on Redis failure)
```

Tokens are stored with key `token_blacklist:{jti}` and TTL matching the token's remaining lifetime, so they auto-expire from Redis when they would have expired naturally.

---

## Database and Migrations

### Session Management

**File:** `backend/app/db/session.py`

Uses SQLAlchemy async engine with `asyncpg`:

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,     # SQL logging in debug mode
    pool_pre_ping=True,      # Connection health check
    pool_size=10,
    max_overflow=20,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Objects remain usable after commit
    autocommit=False,
    autoflush=False,         # Explicit flush/commit required
)
```

The `get_db()` dependency yields an `AsyncSession` and ensures cleanup:

```python
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
```

### Row-Level Security (RLS)

PostgreSQL RLS is used for tenant data isolation. RLS context is set on every request via session configuration variables:

```python
async def set_rls_context(
    session: AsyncSession,
    tenant_id: str | None = None,
    is_super_admin: bool = False,
) -> None:
    if tenant_id:
        await session.execute(
            text("SELECT set_config('app.current_tenant_id', :tid, true)"),
            {"tid": str(tenant_id)}
        )
    await session.execute(
        text("SELECT set_config('app.is_super_admin', :sa, true)"),
        {"sa": str(is_super_admin).lower()}
    )
```

The `get_current_user()` dependency calls `set_rls_context()` automatically, so all subsequent queries in that request are tenant-scoped.

For background tasks or scripts that need RLS context outside a request:

```python
async with get_db_with_rls(tenant_id="...", is_super_admin=False) as session:
    # Session has RLS context set
    ...
```

### Alembic Migrations

**Config:** `backend/alembic.ini`
**Scripts:** `backend/app/db/migrations/versions/`

Migrations use **synchronous** `psycopg2` (not `asyncpg`) because Alembic does not support async engines. The `env.py` automatically replaces `+asyncpg` with an empty string in the URL:

```python
sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
```

#### Common Migration Commands

```bash
# Generate a new migration from model changes
cd backend
alembic revision --autogenerate -m "description_of_change"

# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Show current migration state
alembic current

# Show migration history
alembic history
```

#### Migration Naming Convention

Migration files are numbered sequentially (e.g., `063_booking_packages.py`, `064_add_paper_form_schema.py`). Use a descriptive suffix that indicates the change.

---

## Authentication and Authorization

### Authentication Flow

1. **Login:** `POST /api/v1/auth/login` validates credentials and returns an access token + refresh token.
2. **Access token:** Short-lived JWT (15 min). Sent as `Authorization: Bearer <token>`. Contains `sub` (user ID), `tenant_id`, `role`, `modules`, `jti`.
3. **Refresh token:** Longer-lived JWT (7 days). Stored as a SHA-256 hash in the `refresh_tokens` table. Used to obtain new access tokens without re-authentication.
4. **Logout:** Blacklists the access token's `jti` in Redis. The refresh token hash is deleted from the database.

### Authorization Hierarchy

```
Super Admin
  Can access everything, bypasses RLS and module checks.
  tenant_id is NULL in the JWT.

Tenant Admin
  Full access to their tenant's resources.
  Can manage users, conferences, settings.

User (regular)
  Access controlled by:
  - Module assignments (via TenantModule)
  - Conference-specific access (via UserConferenceAccess)
  - has_all_conference_access flag on User model

Applicant (CFP Portal)
  Separate authentication system (ApplicantRefreshToken).
  Access limited to CFP portal endpoints.
```

### Applying Authorization in Endpoints

```python
# Super admin only
@router.get("/admin/tenants")
async def list_tenants(current_user: SuperAdminDep, db: DbSessionDep) -> ...:

# Tenant admin or super admin
@router.get("/users")
async def list_users(current_user: TenantAdminDep, db: DbSessionDep) -> ...:

# Any authenticated user
@router.get("/conferences")
async def list_conferences(current_user: CurrentUserDep, db: DbSessionDep) -> ...:

# Module-gated
@router.get("/cfp", dependencies=[Depends(require_module("cfp"))])
async def list_cfps(current_user: CurrentUserDep, db: DbSessionDep) -> ...:

# Conference admin (super admin OR tenant admin OR conference-specific admin)
@router.get("/conferences/{conference_id}/settings/session-types")
async def list_session_types(conference_id: UUID, current_user: CurrentUserDep, db: DbSessionDep) -> ...:
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)
    ...
```

---

## Key Dependencies

From `backend/requirements.txt`:

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.109.0 | Web framework |
| `uvicorn[standard]` | 0.27.0 | ASGI server |
| `python-multipart` | 0.0.6 | Form data / file uploads |
| `sqlalchemy` | 2.0.25 | ORM (async) |
| `asyncpg` | 0.29.0 | PostgreSQL async driver |
| `psycopg2-binary` | 2.9.9 | PostgreSQL sync driver (for Alembic) |
| `alembic` | 1.13.1 | Database migrations |
| `redis` | 5.0.1 | Token blacklist |
| `python-jose[cryptography]` | 3.3.0 | JWT encoding/decoding |
| `argon2-cffi` | 23.1.0 | Argon2id password hashing |
| `passlib` | 1.7.4 | Password utilities |
| `pydantic` | 2.5.3 | Data validation |
| `pydantic-settings` | 2.1.0 | Environment-based settings |
| `email-validator` | 2.1.0 | Email address validation (`EmailStr`) |
| `phonenumbers` | 9.0.24 | Phone number validation (libphonenumber) |
| `slowapi` | 0.1.9 | Rate limiting |
| `sentry-sdk[fastapi]` | 2.19.2 | Error monitoring |
| `python-dotenv` | 1.0.0 | `.env` file loading |
| `httpx` | 0.26.0 | Async HTTP client |
| `filetype` | 1.2.0 | Magic byte MIME detection |
| `Pillow` | 11.1.0 | Image processing (metadata stripping) |
| `nh3` | 0.2.21 | HTML sanitization (Rust-based) |
| `resend` | 2.7.0 | Email delivery API |
| `mammoth` | 1.11.0 | DOCX → HTML conversion (contract upload) |
| `fpdf2` | 2.8.3 | HTML → PDF generation (contract export) |
| `striprtf` | 0.0.26 | RTF → text conversion (contract upload) |
| `python-docx` | 1.1.2 | DOCX support |
| `html2docx` | 1.6.0 | HTML → DOCX generation (contract export) |
| `python-stdnum` | 2.2 | VAT number validation (offline format check) |

---

## Common Patterns and Gotchas

### Endpoint Pattern (CRUD with Audit Logging)

A typical endpoint follows this pattern:

```python
@router.post("/session-types", response_model=SessionTypeResponse)
async def create_session_type(
    conference_id: UUID,                    # From URL path (injected by FastAPI)
    st_data: SessionTypeCreate,             # Request body (Pydantic schema)
    current_user: CurrentUserDep,           # JWT auth + RLS
    db: DbSessionDep,                       # Database session
    request: Request,                       # For IP/User-Agent
) -> SessionTypeResponse:
    # 1. Resolve and verify conference access
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # 2. Business validation (e.g., uniqueness)
    existing = await db.execute(select(SessionType).where(...))
    if existing.scalar_one_or_none():
        raise ValidationError("A session type with this slug already exists")

    # 3. Create the model
    session_type = SessionType(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        **st_data.model_dump(),
    )
    db.add(session_type)

    # 4. Create audit log
    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="session_type.create",
        resource_type="session_type",
        resource_id=session_type.id,
        details={"name": session_type.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # 5. Commit and refresh
    await db.commit()
    await db.refresh(session_type)

    # 6. Return response
    return SessionTypeResponse(...)
```

### Update Pattern (Partial Updates)

```python
update_data = st_data.model_dump(exclude_unset=True)  # Only fields the client sent
for field, value in update_data.items():
    setattr(session_type, field, value)
```

### Delete with Reference Check

Before deleting a settings entity, check if other entities reference it:

```python
paper_count = (await db.execute(
    select(func.count()).where(CFPPaper.session_type_id == session_type_id)
)).scalar() or 0

if paper_count > 0:
    raise ValidationError(
        f"Cannot delete '{st_name}'. {paper_count} papers are using this session type."
    )
```

### Tenant Isolation in Queries

Every query for tenant-scoped data must include a tenant filter. RLS provides a safety net, but queries should still filter explicitly:

```python
query = select(SessionType).where(
    SessionType.conference_id == conference.id,
    SessionType.tenant_id == conference.tenant_id,  # Explicit tenant filter
)
```

### NotFoundError for Authorization Masking

When a resource exists but belongs to a different tenant, return a `NotFoundError` (not `AuthorizationError`) to avoid leaking resource existence:

```python
if current_user.tenant_id is not None and conference.tenant_id != current_user.tenant_id:
    raise NotFoundError(f"Conference with ID '{conference_id}' not found")
```

### CORS on Exception Responses

FastAPI exception handlers bypass `CORSMiddleware`. The `_cors_response()` helper in `main.py` manually adds CORS headers to error responses so the browser does not block them. All custom exception handlers use this helper instead of returning a plain `JSONResponse`.

### Adding a New Endpoint Module

1. Create the endpoint file in `backend/app/api/v1/` (or a sub-package for large modules).
2. Define a `router = APIRouter()`.
3. Import and include it in `backend/app/api/v1/router.py` with the appropriate prefix and tags.
4. Create corresponding Pydantic schemas in `backend/app/schemas/`.
5. Create or update SQLAlchemy models in `backend/app/models/` and re-export from `__init__.py`.
6. Generate an Alembic migration: `alembic revision --autogenerate -m "add_new_feature"`.
7. Apply the migration: `alembic upgrade head`.

### Adding a New Settings Sub-Module

1. Create `backend/app/api/v1/settings/new_setting.py` with a `router = APIRouter()`.
2. Import `_resolve_conference` and `_check_conference_admin` from `._shared`.
3. Add routes like `GET /new-settings`, `POST /new-settings`, etc.
4. Import and include the router in `backend/app/api/v1/settings/__init__.py`.
5. Add the model/schema as described above.
