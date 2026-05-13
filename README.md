# SaaSConf

**Multi-tenant SaaS platform for conference and training management.**

![CI](https://github.com/yourusername/SaaSConf/actions/workflows/staging.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-check%20CI-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

SaaSConf is a full-stack, multi-tenant platform that streamlines the entire conference and training lifecycle. On the conference side: call for papers, program scheduling, sponsor management, and attendee communications. On the training side: annual program planning, trainer assignments, customer offers, invoicing with Stripe, a public registration portal, and a parking lot for attendee reassignments. Each tenant operates in complete data isolation with its own conferences, trainings, users, and settings.

## Features

### Platform

- **Multi-tenancy** -- Tenant isolation with role-based access control (super admin, tenant admin, conference admin, committee member)

### Conference Management

- **Conference lifecycle** -- Create, configure, publish, and archive conferences
- **Call for Papers (CFP)** -- Public submission portal, configurable form builder, multi-round review workflow with scoring scales
- **Program design** -- Day/track/session grid builder with time slot management
- **Messaging** -- Threaded messaging, bulk send, email templates, and recipient list management
- **Sponsors and packages** -- Sponsor tiers, package management, logo uploads, and invoicing
- **Volunteers** -- Role definitions, volunteer assignment, and coordination
- **Locations** -- Venue and room management with location types
- **Booking and pricing** -- Pricing matrix, discount codes, and booking packages
- **News and newsletters** -- Article publishing for conference communications
- **Admin dashboard** -- Centralized management with audit logging
- **Public portal** -- Applicant-facing portal for paper submissions and status tracking

### Training Management

- **Program years** -- Annual training calendar with placements, publish/update workflow with versioned snapshots
- **Trainer management** -- Profiles, availability, conflict detection, schedule PDFs with automatic email dispatch
- **Customers and offers** -- B2B customer management, offer creation with placements and attendees, document generation (PDF/DOCX), status lifecycle (Draft, Sent, Accepted, Rejected)
- **Training invoices** -- Create, send, cancel with credit notes, replace (billing correction), mark paid, Stripe payment links, offer invoicing
- **Registration portal** -- Public-facing registration with exam options, VAT calculation, bank transfer or Stripe payment
- **Attendee management** -- Central attendee identity (email-based dedup), event timeline, parking lot with reassignment and automatic invoice transfer
- **Pending invoicing** -- Track uninvoiced registrations and accepted offers
- **Payment reminders** -- Manual and automated reminders for overdue invoices
- **Analytics** -- Revenue tracking, training statistics, placement utilization

## Tech Stack

| Layer | Technology |
|------------|-----------|
| Backend | FastAPI 0.135, SQLAlchemy 2.0 (async), PostgreSQL 16.8, Redis 7.4, Alembic |
| Frontend | React 19, TypeScript 5.7, Vite 7, Tailwind CSS 4, TanStack Query 5 |
| Auth | JWT (PyJWT), Argon2id password hashing |
| Email | Resend |
| Monitoring | Sentry (backend + frontend) |
| Testing | pytest + pytest-asyncio, Vitest, Playwright |
| CI/CD | GitHub Actions, Docker, Nginx |

## Quick Start

The fastest way to get SaaSConf running is with Docker Compose.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/SaaSConf.git
   cd SaaSConf
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set secure values for `DB_PASSWORD`, `JWT_SECRET_KEY`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD`.

3. **Start all services**

   ```bash
   docker compose up
   ```

   This starts PostgreSQL, Redis, the FastAPI backend, and the React frontend.

4. **Access the application**

   | Service | URL |
   |---------|-----|
   | Frontend | [http://localhost:3000](http://localhost:3000) |
   | Backend API | [http://localhost:8000](http://localhost:8000) |
   | API docs (Swagger) | [http://localhost:8000/docs](http://localhost:8000/docs) |

   Sign in with the super admin credentials you configured in `.env`.

## Development Setup

For local development without Docker, use the provided `make` targets. This is the recommended approach for day-to-day development.

### Prerequisites

Before running `make init`, make sure the following are installed and running:

| Requirement | Install |
|-------------|---------|
| Python 3.12+ via **pyenv** | [github.com/pyenv/pyenv](https://github.com/pyenv/pyenv) |
| **pnpm 10+** | `npm install -g pnpm@10` |
| **PostgreSQL 15** on `:5432` | `brew install postgresql@15 && brew services start postgresql@15` |
| **Redis 7** on `:6379` | `brew install redis && brew services start redis` |

### First-time setup

```bash
make init
```

This single command:
1. Installs Python 3.12 via pyenv if missing
2. Creates the Python virtualenv and installs backend dependencies
3. Installs frontend dependencies with pnpm
4. Copies `backend/.env.example` → `backend/.env` (if not already present)
5. Generates a `PII_ENCRYPTION_KEY` in `backend/.env` automatically
6. Creates the PostgreSQL role and database from the values in `backend/.env`
7. Runs all Alembic migrations
8. Seeds the database (super admin, modules, currencies)

> After setup, review `backend/.env` and update `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, and any other values for your environment.

### Starting the dev servers

```bash
make dev-up
```

Starts the FastAPI backend (port 8000) and React frontend (port 3000) concurrently. Press `Ctrl+C` to stop both.

| Service | URL |
|---------|-----|
| Frontend | [http://localhost:3000](http://localhost:3000) |
| Backend API | [http://localhost:8000](http://localhost:8000) |
| API docs (Swagger) | [http://localhost:8000/docs](http://localhost:8000/docs) |

Sign in with the credentials set in `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `backend/.env`.

### Reset the database

To wipe and rebuild the local database from scratch:

```bash
make db-reset-native
```

This drops the database, recreates it, re-runs all migrations, and re-seeds. You will be prompted to confirm before any data is destroyed.

### Other useful targets

```bash
make help          # List all available targets
make migrate       # Run pending Alembic migrations
make test          # Run backend + frontend tests
make lint          # Lint backend + frontend
make typecheck     # Type-check backend + frontend
```

## Testing

### Backend tests

```bash
cd backend
source venv/bin/activate
pytest
```

### Frontend unit tests

```bash
cd frontend
pnpm test
```

### End-to-end tests

```bash
cd frontend
pnpm exec playwright install
pnpm exec playwright test
```

## Project Structure

```
SaaSConf/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── api/v1/         # REST API endpoints (conferences, trainings, settings)
│   │   ├── core/           # Auth, email, invoicing, Stripe, PDF generation
│   │   ├── db/             # Database engine, sessions, migrations
│   │   ├── models/         # SQLAlchemy ORM models
│   │   └── schemas/        # Pydantic request/response schemas
│   ├── tests/              # Backend test suite
│   └── requirements.txt
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Page-level components and routes
│   │   ├── types/          # TypeScript type definitions
│   │   └── utils/          # Utility functions
│   ├── e2e/                # Playwright E2E tests
│   └── package.json
├── deploy/                 # Deployment configurations
├── docs/                   # Project documentation
├── docker-compose.yml
└── .github/workflows/      # CI/CD pipelines
```

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, tech stack, and high-level overview |
| [Backend](docs/backend.md) | API structure, models, and backend conventions |
| [Frontend](docs/frontend.md) | Component architecture, state management, and routing |
| [Database](docs/database.md) | Schema design, migrations, and data model |
| [Auth and Security](docs/auth-and-security.md) | Authentication, authorization, and security policies |
| [API Reference](docs/api-reference.md) | Endpoint documentation and request/response formats |
| [Infrastructure](docs/infrastructure.md) | Deployment, Docker, CI/CD, and environment configuration |
| [How-To Guide](docs/howto.md) | Common tasks and development workflows |
| [Internationalization](docs/i18n.md) | i18n support and localization |

## Contributing

Contributions are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
