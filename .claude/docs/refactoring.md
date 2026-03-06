# Refactoring Guidelines

When modifying existing files, apply the "boy scout rule" — improve patterns incrementally. The codebase is functional and shipping.

## Backend: Completed Refactoring (March 2026)

**Status**: Major DRY refactoring completed. Net reduction: -1,185 lines.

**New Core Utilities**:
- `app/core/attachment_urls.py` — Batch attachment URL lookups (fixes N+1 queries)
- `app/core/csv_export.py` — Streaming CSV exports with UTF-8 BOM

**Refactored Modules**:
- **Registrations** — Split into `registrations/core.py`, `billing.py`, `items.py`, `_helpers.py`, `__init__.py` (uses `router.routes.extend()` pattern)
- **CFP** — Split into `cfp/cfp_crud.py`, `paper_assignments.py`, `paper_cospeakers.py`, `paper_reviews.py`, `submissions.py`, `__init__.py` (literal paths before catch-all)

**Remaining Large Files** (refactor only when modifying):
- `cfp_portal/papers.py` (1,142 lines)
- `volunteer_tasks.py` (1,004 lines)
- `messaging/threads.py` (962 lines)
- `cfp_portal/messaging.py` (838 lines)

## Frontend: Hook Extraction

**Current state**: 12 custom hooks; 515 inline `useQuery`/`useMutation` calls across 95 files.

**When touching a component, extract to hooks**:
1. **Error state** (200+) → `useErrorState()`
2. **Modal/dialog management** (90+) → `useModalState<Item>()`
3. **Inline mutations** → `hooks/api/use*Mutations.ts`

**Largest components to split when modifying** (not proactively):
- RegistrationTab (1,351 lines) → BookingOptionSelect, AttendeeFields, SessionSelector
- ScreenOverlaysTab (1,204 lines) → OverlayEditor, OverlayPreview, OverlayList
- ProgramGrid (1,144 lines) → GridCell, GridHeader, GridControls

## What NOT to Refactor
- Don't refactor files you're not already modifying
- Don't split schema files just for size
- Don't add abstractions for one-time patterns
- Don't migrate all inline queries to hooks at once
- The 17 `TYPE_CHECKING` imports in models are intentional — leave them

## Improvement Progress — All Completed
- CRIT #15-17: Migration failure masking, deployment rollback, data retention cleanup
- HIGH #1-5, #18-23: CI pipeline, linting, Docker pins, concurrency, async fixes, rate limiting, streaming exports, error boundaries
- MED #6-10, #24-28: Pydantic v2, mypy, VS Code, Makefile, CSP, N+1 fixes, pagination, React.memo
- LOW #11-14: Pre-commit hooks, constants, health probes, coverage artifacts
- CI Fixes Round 3: All ruff/mypy/test fixes, staging deploy, PG16 upgrade, nginx fix, full pipeline green
