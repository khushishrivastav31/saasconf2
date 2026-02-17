# SaaSConf

**Multi-tenant SaaS platform for conference management.**

![CI](https://github.com/yourusername/SaaSConf/actions/workflows/staging.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-check%20CI-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

SaaSConf is a full-stack, multi-tenant platform that streamlines the entire conference lifecycle -- from call for papers through program scheduling, sponsor management, and attendee communications. Each tenant operates in complete data isolation with its own conferences, users, and settings.

## Features

- **Multi-tenancy** -- Tenant isolation with role-based access control (super admin, tenant admin, conference admin, committee member)
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

## Tech Stack

| Layer | Technology |
|------------|-----------|
| Backend | FastAPI 0.109, SQLAlchemy 2.0 (async), PostgreSQL 15, Redis 7, Alembic |
| Frontend | React 18, TypeScript 5, Vite 5, Tailwind CSS 3, React Query 5 |
| Auth | JWT (python-jose), Argon2id password hashing |
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

For local development without Docker, run the backend and frontend separately.

### Backend

Requires **Python 3.12+**, a running **PostgreSQL 15** instance, and **Redis 7**.

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Set the required environment variables (see `.env.example`) or create a `.env` file in the project root.

Run database migrations:

```bash
alembic upgrade head
```

Start the development server:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs) when `DEBUG=true`.

### Frontend

Requires **Node.js 20+**.

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts on [http://localhost:3000](http://localhost:3000) and proxies API requests to `VITE_API_URL` (defaults to `http://localhost:8000`).

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
npm test
```

### End-to-end tests

```bash
cd frontend
npx playwright install
npx playwright test
```

## Project Structure

```
SaaSConf/
├── backend/                # FastAPI application
│   ├── app/
│   │   ├── api/v1/         # REST API endpoints
│   │   ├── core/           # Auth, email, pagination, validators
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
