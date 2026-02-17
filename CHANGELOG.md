# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Conference News/Newsletter feature with admin CRUD and portal feed
- Program Design module (days, tracks, sessions, time slots, grid view)
- Program publishing workflow with email notifications
- Sponsor management with package tiers
- Invoice management with PDF generation
- Messaging system (threads, bulk send, templates, recipient lists)
- Call for Papers portal with paper submission and review workflow
- Booking system with pricing matrix, discount codes, and packages
- Multi-tenant architecture with tenant isolation
- Conference lifecycle management (create, publish, archive)
- Location management with hierarchical structure
- Volunteer management with role assignment
- Rich text editor (TipTap) for content creation
- Form builder for custom paper submission forms
- Audit logging for admin actions
- Applicant activity tracking
- Conference team management
- Service provider management
- Admin settings (session types, score scales, committee roles, etc.)
- Email template system with variable substitution
- Rate limiting and CORS security
- Sentry error monitoring integration
- Docker development and production configurations
- CI/CD pipeline with GitHub Actions
- E2E testing with Playwright
- Comprehensive API documentation

### Infrastructure
- FastAPI backend with async SQLAlchemy and PostgreSQL
- React frontend with TypeScript, Vite, and Tailwind CSS
- Redis for token blacklist and caching
- Alembic database migrations (84+ versions)
- Pre-commit hooks (Ruff, ESLint, Prettier)
- Dependabot for automated dependency updates
