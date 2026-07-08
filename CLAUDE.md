# SaaSConf

Multi-tenant SaaS platform for conference and training management. Each tenant manages conferences (CFPs, registrations, sponsors, programs) and trainings (program years, placements, offers, invoices, attendees, parking lot, registration portal). Tenant isolation via PostgreSQL Row-Level Security. Performance is a first-class requirement.

## Architecture

- **Backend** — FastAPI + SQLAlchemy async + PostgreSQL (port 8000). Async throughout: `AsyncSession`, `asyncio.to_thread()` for blocking I/O, async generators for streaming.
- **Frontend** — React + TypeScript + TanStack Query + Tailwind CSS (port 3000).
- **Migrations** — Alembic, sequential (`001_`, `002_`, ...). Commit migration files alongside the code that needs them.
- **Multi-tenancy** — Shared DB, shared schema, RLS isolation. Every tenant-scoped table carries `tenant_id`.

## Workflow

All changes route through a topic branch + PR. Never commit or push to `main` directly. CI gates every merge.

### 1 — Branch

On the first `Edit`/`Write` of a session while on `main`, silently create a topic branch: `git checkout -b <type>/<short-kebab-topic>`, where `<type>` matches the coming commit prefix (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`). Mention the branch name so the user can course-correct. Branch creation is free, reversible, and invisible — don't ask first.

### 2 — Develop + verify

Follow this sweep before asking to merge. **Every step is mandatory** — CI rejects what you skip, and skipping any of them will waste a CI cycle you could have avoided locally.

**Red-Green-Refactor — mandatory for every feature or fix:**

1. **RED** — Write the test(s) first. Run them and confirm they fail for the right reason before writing any implementation code. Backend: `pytest` in `backend/tests/`; frontend: `vitest` in sibling `__tests__/` dirs.
2. **GREEN** — Write the minimum implementation to make the failing tests pass. Run the targeted tests again to confirm green.
3. **REFACTOR** — Clean up the implementation (naming, duplication, structure) without changing behaviour. Tests stay green throughout.
4. `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v` — targeted tests first.
5. `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml` — type-check **the whole `app/` tree**, not just the file you touched.
6. `cd backend && ruff check app/ && ruff format --check app/` — lint + format **the whole `app/` tree**.
7. `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/` — type-check + lint **the whole `src/` tree**. Targeted per-file lint is a debugging convenience, not a substitute.
8. Full sweep: `cd backend && venv/bin/python -m pytest tests/ -n 4 -q` and `cd frontend && pnpm test`. Use `-n 4` workers — `-n 8`+ causes SQLAlchemy race conditions in `test_trainings.py` and `test_user_update_address.py` that are flaky at high parallelism but pass cleanly at 4 workers or in serial.
9. **OpenAPI schema drift** — if you added/changed any backend endpoint, route prefix, request/response schema, or response code, run `cd frontend && JWT_SECRET_KEY=test-secret-key-for-ci-pipeline-minimum-32-chars SUPER_ADMIN_PASSWORD=TestPassword123! pnpm gen:api` and commit the updated `frontend/src/types/api.generated.ts`. CI's "OpenAPI schema drift" check will fail the PR otherwise. Verify locally with `pnpm gen:api:check` — it must print no output.
10. For UI or user-visible changes, update the in-app handbook at `frontend/src/pages/Handbook/handbookSections.tsx`.
11. **Security audit — run before every commit.** Run the same dependency audit CI enforces and resolve anything it flags (bump the package, or add an `--ignore-vuln` only with a justifying comment, matching CI) before committing:
    - Backend: `cd backend && venv/bin/pip-audit -r requirements.txt --ignore-vuln CVE-2026-4539 --ignore-vuln PYSEC-2025-183` (install with `venv/bin/pip install pip-audit` if missing). Keep the `--ignore-vuln` list in sync with the `security-audit` job in `.github/workflows/ci.yml`.
    - Frontend: `cd frontend && pnpm audit --audit-level=critical`.

**Why "whole tree" matters**: dependency bumps (Dependabot, manual upgrades) can add new lint or type-check rules that fire on code you didn't touch. A per-file check on your diff will pass while the full sweep fails on CI. Always run steps 3–6 across the full tree before pushing, especially on any PR that modifies `requirements.txt`, `package.json`, or lockfiles.

### 3 — Ship

When the sweep is green, present the proposed commit message, scope, and PR title in a single message and ask once. On approval, execute atomically:

```
git add <files>
git commit -m "<conventional-commit>"
git push -u origin <branch>
gh pr create --title "..." --body "..."
gh pr merge --auto --squash
```

CI must gate the merge. Never run `gh pr merge` without `--auto`. Red CI leaves the PR open — surface the failure; don't bypass it. Commits carry a `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.

### Escape hatches (still ask first)

- **"commit only"** — commit + push + open PR, but no `--auto`. PR stays open for manual merge.
- **"push to main — trivial"** — single-line doc fixes may go straight to `main`. User must say the literal phrase.

## Performance

### Backend

- No N+1 queries — use `joinedload()`, `selectinload()`, or `batch_get_attachment_urls()`.
- Paginate list endpoints — `skip` / `limit` with default 100, max 500.
- Never block the event loop — wrap blocking I/O with `asyncio.to_thread()`.
- Stream large exports — `StreamingResponse` in 1,000-row batches; cap at 50k rows.
- Index columns used in `WHERE` / `JOIN` / `ORDER BY` — especially `tenant_id`, `conference_id`, `status`, and FKs.

### Frontend

- `React.memo` on list-rendered components.
- `useMemo` / `useCallback` for expensive computations and stable references.
- Choose `staleTime` deliberately — `0` for fresh data, longer for stable data.
- Lazy-load routes with `React.lazy()`.
- Don't create objects or arrays inline in render paths.

## UI conventions

- **Dark mode** — class-based via `ThemeContext`; every new component ships with `dark:` variants.
- **Responsive** — portal surfaces mobile-first, admin surfaces desktop-first. Touch targets `min-h-[44px]` in portal.
- **Full palette + breakpoint tables** — see `.claude/docs/ui-conventions.md` before adding new colors or layouts.

## Code conventions

- **Pydantic v2** — `model_config = ConfigDict(from_attributes=True)`. No legacy `class Config`.
- **SQL** — SQLAlchemy ORM or parameterized queries only. No f-strings in SQL.
- **Auth** — protect endpoints with `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, or `require_module()`.
- **New tables** — `tenant_id` FK + RLS policy; no exceptions.
- **Uploads** — `validate_upload()` from `app/core/file_validation.py`.
- **Validation** — use `validators.ts` / `validators.py`. No ad-hoc regex.
- **Country fields** — `<select>` with `COUNTRY_OPTIONS`; store ISO codes.
- **VAT fields** — `<VatNumberInput>` component.
- **HTML, user input, auth, secrets** — read `.claude/docs/security.md` before touching.

## OpenSpec change lifecycle

Change specs live under `openspec/changes/<JIRA-KEY>-<slug>/` while in flight,
where `<JIRA-KEY>` is the Jira ticket identifier (e.g. `main-12345`). There is
no sequential numbering — the Jira key is the sole identifier.
Before a PR merges, move the spec folder from `openspec/changes/` to
`openspec/shipped/` as part of that same PR. `openspec/changes/` should only
contain work that has not yet shipped. `openspec/specs/` holds the
source-of-truth feature specs and is never pruned.

**Review gate — always stop after writing the spec.** When a task starts with
OpenSpec, write the `openspec/changes/<JIRA-KEY>-<slug>/` folder
(`proposal.md`, `design.md`, `tasks.md`) and then **stop and wait for the user
to review and approve it before making any code or test changes**. Do not begin
the RED/GREEN implementation (including tests) until the user has approved the
spec folder.

## Local dev

`docker compose up` runs the full stack (Postgres, Redis, FastAPI, React). For native backend/frontend workflows, see the **Development Setup** section of `README.md`. Secrets live in `.env` (template: `.env.example`).

## Extended documentation

Read on-demand when working on a given area:

- `.claude/docs/security.md` — OWASP rules, field validation, auth flows. **Read before touching auth, PII, or user input.**
- `.claude/docs/ui-conventions.md` — dark-mode palette, responsive breakpoints.
- `.claude/docs/modules.md` — Registration, Screen Overlays, Booking, Volunteers, Alumni, Deadlines, Sponsor Contracts.
- `.claude/docs/invoices.md` — Invoice PDF generation, number generation, settings, frontend.
- `.claude/docs/trainings.md` — Training module architecture, invoice / offer / attendee flows.
- `.claude/docs/devops.md` — CI/CD, Docker, Nginx, testing config, email, rate limiting, CSV exports.
- `.claude/docs/refactoring.md` — Refactoring guidelines, hook extraction patterns.

## Session state

Session-specific context (in-flight work, recent PRs, deferred items) is tracked in the memory system at `~/.claude/projects/-Users-josediaz-SaaSConf/memory/`. This file is evergreen project rules only — do not journal session activity here.
