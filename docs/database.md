# Database

This document covers the database layer: ORM setup, models, migrations, seeding, and test database configuration.

---

## Technology

| Component | Technology |
|-----------|-----------|
| Database | PostgreSQL 15 |
| ORM | SQLAlchemy 2.0 (async) |
| Driver | asyncpg |
| Migrations | Alembic |
| Connection pool | 10 connections, 20 overflow |

---

## Connection Setup

**Source:** `backend/app/db/session.py`

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
```

Sessions are injected via FastAPI dependency:

```python
DbSessionDep = Annotated[AsyncSession, Depends(get_db)]
```

### RLS Context

Every authenticated request sets PostgreSQL session variables for Row-Level Security:

```python
async def set_rls_context(session, tenant_id=None, is_super_admin=False):
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

---

## Models Overview

**Source:** `backend/app/models/__init__.py`

All models use the declarative base from `backend/app/db/base.py`.

### User & Authentication

| Model | Table | Key Columns |
|-------|-------|-------------|
| `User` | `users` | id, email, hashed_password, role, tenant_id, is_active |
| `RefreshToken` | `refresh_tokens` | id, user_id, token_hash, expires_at |
| `ApplicantEmailVerification` | `applicant_email_verifications` | id, applicant_id, token, expires_at |
| `ApplicantRefreshToken` | `applicant_refresh_tokens` | id, applicant_id, token_hash, expires_at |

### Tenant & Organization

| Model | Table | Key Columns |
|-------|-------|-------------|
| `Tenant` | `tenants` | id, name, slug, is_active, logo_url |
| `Module` | `modules` | id, code, name, description |
| `TenantModule` | `tenant_modules` | id, tenant_id, module_id |

### Conference

| Model | Table | Key Columns |
|-------|-------|-------------|
| `Conference` | `conferences` | id, tenant_id, name, abbreviation, locale, team_members (JSONB) |
| `ConferenceCFP` | `conference_cfps` | conference_id, cfp_id |
| `ConferenceLocation` | `conference_locations` | conference_id, location_id |
| `ConferenceVolunteer` | `conference_volunteers` | conference_id, volunteer_id |
| `UserConferenceAccess` | `user_conference_access` | user_id, conference_id, is_admin |

### Call for Papers (CFP)

| Model | Table | Key Columns |
|-------|-------|-------------|
| `CallForPapers` | `call_for_papers` | id, tenant_id, title, status, submission_deadline |
| `CFPApplicant` | `cfp_applicants` | id, tenant_id, email, name, phone |
| `Submission` | `submissions` | id, cfp_id, applicant_id, title, status |
| `ConferencePaperFormSchema` | `conference_paper_form_schemas` | id, conference_id, cfp_id |
| `PaperFormField` | `paper_form_fields` | id, schema_id, field_type, label, position |

### Reviews

| Model | Table | Key Columns |
|-------|-------|-------------|
| `PaperReview` | `paper_reviews` | id, submission_id, reviewer_id, status |
| `ReviewAnswer` | `review_answers` | id, review_id, question_id, score |
| `ReviewCriterion` | `review_criteria` | id, tenant_id, name, weight |
| `ReviewQuestion` | `review_questions` | id, criterion_id, text |
| `ReviewScoreScale` | `review_score_scales` | id, tenant_id, name |
| `ReviewScaleOption` | `review_scale_options` | id, scale_id, value, label |
| `ReviewFormSettings` | `review_form_settings` | id, conference_id, cfp_id |

### Settings

| Model | Table | Key Columns |
|-------|-------|-------------|
| `BookingOption` | `booking_options` | id, conference_id, name, price |
| `BookingPeriod` | `booking_periods` | id, conference_id, name, start_date, end_date |
| `DiscountCode` | `discount_codes` | id, conference_id, code, discount_percent |
| `DiscountCodeOption` | `discount_code_options` | id, discount_code_id, booking_option_id |
| `EmailTemplate` | `email_templates` | id, conference_id, template_type, subject, body |
| `PronounOption` | `pronoun_options` | id, tenant_id, label |
| `SessionType` | `session_types` | id, conference_id, name, color |
| `TenantLocationType` | `tenant_location_types` | id, tenant_id, name |
| `VolunteerRole` | `volunteer_roles` | id, conference_id, name |

### Program

| Model | Table | Key Columns |
|-------|-------|-------------|
| `ProgramDay` | `program_days` | id, conference_id, date, name |
| `ProgramTrack` | `program_tracks` | id, conference_id, name, color, position |
| `ProgramTimeSlot` | `program_time_slots` | id, day_id, start_time, end_time |
| `ProgramSession` | `program_sessions` | id, conference_id, slot_id, track_id, title, paper_id, speaker_name |

### Messaging

| Model | Table | Key Columns |
|-------|-------|-------------|
| `MessageThread` | `message_threads` | id, conference_id, tenant_id, subject, bulk_id |
| `Message` | `messages` | id, thread_id, sender_type, sender_id, body |
| `MessageParticipant` | `message_participants` | id, thread_id, participant_type, participant_id, last_read_at |
| `MessageTemplate` | `message_templates` | id, conference_id, name, subject, body |
| `RecipientList` | `recipient_lists` | id, conference_id, name |
| `RecipientListMember` | `recipient_list_members` | id, list_id, recipient_type, recipient_id |
| `ThreadFlag` | `thread_flags` | id, thread_id, user_id, flag_type |

### Other

| Model | Table | Key Columns |
|-------|-------|-------------|
| `Location` | `locations` | id, tenant_id, name, address, city, country |
| `Volunteer` | `volunteers` | id, tenant_id, name, email, phone |
| `Sponsor` | `sponsors` | id, conference_id, name, tier |
| `ServiceProvider` | `service_providers` | id, location_id, name, type |
| `Invoice` | `invoices` | id, conference_id, sponsor_id, amount, status |
| `Attachment` | `attachments` | id, tenant_id, entity_type, entity_id, filename, file_data |
| `AuditLog` | `audit_logs` | id, tenant_id, user_id, action, entity_type, entity_id |
| `ApplicantActivityLog` | `applicant_activity_logs` | id, tenant_id, applicant_id, activity_type |
| `ApplicantActivityType` | `applicant_activity_types` | id, code, description |
| `PlatformCurrency` | `platform_currencies` | id, code, name, symbol |

---

## Key Patterns

### tenant_id everywhere

All tenant-scoped models include `tenant_id` as a foreign key to `tenants.id`. RLS policies filter on this column.

### DateTime with timezone

All timestamp columns use `DateTime(timezone=True)`:

```python
created_at: Mapped[datetime] = mapped_column(
    DateTime(timezone=True), server_default=func.now()
)
```

Always use `utcnow()` from `app.core.utils`, never `datetime.utcnow()`.

### JSONB for embedded data

The `Conference` model stores team members as JSONB:

```python
team_members: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
```

Pydantic `TeamMember` schema validates each entry. This avoids a separate table for small embedded lists.

---

## Migrations

**Location:** `backend/app/db/migrations/versions/`

The project has 79 Alembic migrations (001 through 079).

### Creating a migration

```bash
cd backend
alembic revision --autogenerate -m "description_of_change"
```

This generates a new file like `080_description_of_change.py` in the migrations directory.

### Naming convention

Files are named `NNN_description.py` where `NNN` is a zero-padded sequence number.

### Running migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Downgrade one step
alembic downgrade -1

# Show current revision
alembic current
```

### Recent migrations

| # | Description |
|---|-------------|
| 079 | (latest) |
| 078 | Add conference locale column |
| 077 | Enable unaccent extension |
| 076 | Program publication |
| 075 | Messaging notes and flags |
| 074 | Messaging enhancements |
| 073 | Backfill default settings |
| 072 | Applicant password resets |
| 071 | Messaging system |
| 070 | Tracks per day |
| 069 | Session free slots |
| 068 | Drop event types |
| 067 | Program event types |
| 066 | Program design |

---

## Seeding

### Database seed

**Source:** `backend/app/db/seed.py`

Creates initial data (super admin user, default modules, etc.).

### Utility scripts

**Location:** `backend/scripts/`

- `seed_conference_settings.py` — seed default settings for a conference
- `seed_papers_from_csv.py` — import paper submissions from CSV
- `update_applicant_emails.py` — bulk update applicant email addresses

---

## Test Database

**Source:** `backend/tests/conftest.py`

### Setup

Tests use a separate database (`saasconf_test`) and create tables directly with SQLAlchemy's `Base.metadata.create_all` instead of running Alembic migrations.

```python
async def _create_tables() -> None:
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
        await conn.run_sync(Base.metadata.create_all)
```

### Key points

- **NullPool**: Tests use `NullPool` to prevent connection reuse across event loops
- **PostgreSQL extensions**: Must be created manually (e.g., `unaccent`) since `create_all` doesn't run migrations
- **RLS bypass**: Test sessions set `app.is_super_admin = 'true'` to bypass RLS
- **Isolation**: Tables are truncated between tests for isolation
- **Environment variables**: Set before importing app code:
  - `DATABASE_URL` — points to test database
  - `JWT_SECRET_KEY` — test-only key
  - `REDIS_URL` — uses Redis DB 1 (separate from dev DB 0)

### Adding a new PostgreSQL extension

If you add a migration that creates a new PostgreSQL extension, also add it to `_create_tables()` in `conftest.py`:

```python
async def _create_tables() -> None:
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS your_extension"))
        await conn.run_sync(Base.metadata.create_all)
```
