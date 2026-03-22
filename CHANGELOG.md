# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SECURITY.md with vulnerability disclosure policy
- Docker image SHA pinning for supply chain integrity
- Static asset caching headers in nginx reverse proxy
- Configurable database connection pool and uvicorn workers via environment
- Bundle size monitoring in CI
- Workflow timeouts and manual dispatch trigger for staging CI/CD

### Changed
- Pre-commit hooks synced with CI versions (Ruff v0.15.5, mypy v1.19.1)
- OPS_API_KEY no longer falls back to SUPER_ADMIN_PASSWORD
- Staging deployment secrets moved from hardcoded values to GitHub Secrets
- Redis appendonly now uses `everysec` fsync policy
- Nginx proxy timeouts increased to 120s for large exports
- Dependabot configured with minor/patch grouping to reduce PR noise
- PR template enhanced with handbook and deployment checklist items
- README tech stack versions updated to current

### Fixed
- Removed debug console.log statements from production frontend code
- ProfilePage test act() warnings resolved

### Security
- Removed hardcoded staging server IP from CI workflows
- Enforced OPS_API_KEY requirement (no silent fallback)
- Pinned all Docker base images by SHA256 digest

## [0.1.0] - 2025-09-01

### Added
- Multi-tenant architecture with PostgreSQL Row-Level Security
- Conference lifecycle management (create, configure, publish, archive)
- Call for Papers portal with paper submission and multi-round review workflow
- Program Design module (days, tracks, sessions, time slots, grid view)
- Program publishing workflow with email notifications
- Sponsor management with package tiers and invoicing
- Invoice management with PDF generation (WeasyPrint) and ZUGFeRD support
- Messaging system (threads, bulk send, templates, recipient lists)
- Booking system with pricing matrix, discount codes, and packages
- Registration portal with Stripe payment integration
- Conference News/Newsletter feature with admin CRUD and portal feed
- Location management with hierarchical structure
- Volunteer management with role assignment
- Rich text editor (TipTap) for content creation
- Configurable paper submission form builder with role-specific variants
- Audit logging for admin actions
- Badge designer with per-role templates
- Email template system with variable substitution
- Analytics dashboard (registrations, revenue, attendance, financials)
- Service provider management
- Screen overlay announcements for portal users
- Deadline management with portal visibility

### Infrastructure
- FastAPI backend with async SQLAlchemy and PostgreSQL
- React frontend with TypeScript, Vite, and Tailwind CSS
- Redis for token blacklist and caching
- Alembic database migrations (144 versions)
- Docker development and production configurations
- CI/CD pipeline with GitHub Actions
- E2E testing with Playwright
- Automated backups with GFS retention, encryption, and S3 offsite
- Pre-commit hooks (Ruff, ESLint, mypy, hadolint, conventional commits)
- Dependabot for automated dependency updates
- Sentry error monitoring integration
