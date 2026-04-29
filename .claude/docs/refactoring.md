# Refactoring Guidelines

When modifying existing files, apply the "boy scout rule" — improve patterns incrementally. The codebase is functional and shipping.

## Backend: completed refactoring

**Status**: Major DRY refactoring completed. Net reduction: -1,185 lines (March 2026), continued through April with module splits.

**Core utilities introduced**:
- `app/core/attachment_urls.py` — Batch attachment URL lookups (fixes N+1 queries)
- `app/core/csv_export.py` — Streaming CSV exports with UTF-8 BOM

**Modules already split into packages** (no further action — the package layout is the refactor):
- `api/v1/registrations/` — `core.py`, `billing.py`, `items.py`, `_helpers.py`, `__init__.py` (uses `router.routes.extend()` pattern)
- `api/v1/cfp/` — `cfp_crud.py`, `paper_assignments.py`, `paper_cospeakers.py`, `paper_reviews.py`, `submissions.py`, `papers.py`, `__init__.py` (literal paths before catch-all)
- `api/v1/cfp_portal/papers/` — split from the 1,275-LOC monolith
- `api/v1/cfp_portal/messaging/` — split from the 838-LOC monolith (PR #152, April)
- `api/v1/analytics/` and `core/analytics/` — split from the 1,223-LOC monolith
- `api/v1/trainings/messaging/` — broadcast endpoints (PR #157)
- `api/v1/trainings/admin_threads.py` — admin Messages tab inbox (PR #168, April)
- `api/v1/trainings/news.py` — tenant-wide trainings news (PR #170, April)
- `api/v1/trainings/screen_overlays.py` — tenant-wide trainings overlays (PR #169, April)

**DRY improvements completed**:
- `_require_invoice_admin()` consolidated into `invoices/_helpers.py` (was duplicated in 4 files)
- `core/invoice_pdf.py` reduced from **1,403 LOC → 27 LOC** by splitting into `_styles.py`, `_utils.py`
- Conference and trainings messaging share `_resolve_senders`, `_fetch_message_attachments`, `_resolve_domain_entity_names`, `_link_attachments_to_message`, `_notify_other_participants` from `cfp_portal/messaging/_helpers.py` (PRs #150–#168)

**Large files that remain (refactor only when modifying)**:

| File | LOC | Notes |
|------|-----|------|
| `api/v1/messaging/threads.py` | 985 | Conference admin inbox; candidate for splitting list / detail / reply / archive routes |
| `api/v1/registrations/core.py` | 854 | Down from 1,087; still the biggest router in the package |
| `api/v1/portal/registration.py` | 742 | Down from 1,160; consider splitting if it crosses 1k again |
| `api/v1/volunteer_tasks.py` | 372 | Down from 1,034 (already largely refactored) |

## Frontend: completed refactoring

**Modules already split into folders**:
- `pages/portal/MessagesPage/` — `index.tsx`, `ThreadDetailPane.tsx`, `ComposeModal.tsx`, `AttachmentDisplay.tsx`, `utils.ts` (PR #153)
- `pages/ConferenceDetail/tabs/InvoicesTab/` — folder of 9 files (1,480 total LOC, but each ≤ 386)
- `pages/ConferenceDetail/tabs/SpeakerExpensesTab/` — 8 files (1,263 total, each ≤ 258)
- `pages/ConferenceDetail/tabs/RegistrationTab/` — 5 files (1,985 total, container 224)
- `pages/ConferenceDetail/tabs/settings/BadgeDesignerTab/` — 5 files (1,171 total, container 281)
- `pages/Trainings/tabs/MessagesTabAdmin/` — split admin Messages tab (PR #168, April)
- **`components/screen-overlays/`** — `OverlayForm`, `OverlayCard`, `OverlayPreviewModal`, `constants` extracted from `pages/ConferenceDetail/tabs/ScreenOverlaysTab/` so both conferences and trainings consume them (PR #173, April)

**Component extractions in April 2026**:
- `components/trainings/TrainingVariableButtons.tsx` — variable-pill cluster shared between Compose dialog and trainings settings template editor (PR #161, #166)
- `components/trainings/TrainingAttendeeSearchPicker.tsx` — typeahead for cross-placement compose (PR #160)
- `components/trainings/TrainingRecipientPicker.tsx` — all/specific radio + checkboxes
- `components/trainings/ComposeRecipientModeToggle.tsx` — pill toggle
- `pages/Trainings/tabs/SendTrainingNewsModal.tsx` — recipient targeting modal for news send (PR #172)

**Hook layer** (current state — 13 custom hooks; ~515 inline `useQuery`/`useMutation` calls remain across the codebase):
- When touching a component, extract to hooks:
  1. **Error state** (200+ instances) → `useErrorState()`
  2. **Modal/dialog management** (90+ instances) → `useModalState<Item>()`
  3. **Inline mutations** → `hooks/api/use*Mutations.ts`

**DRY improvements completed**:
- `STATUS_COLORS` consolidated into `config/statusColors.ts` (was duplicated in 7 files)
- Autosave → explicit save + unsaved changes warnings across all 9 form pages
- Overlay subcomponents shared between conference and trainings (PR #173)

**Largest components that remain (split when modifying — not proactively)**:

| File | LOC | Suggested split |
|------|-----|-----------------|
| `components/common/richtext/EditorToolbar.tsx` | 1,001 | Split toolbar sections (color, alignment, table, link/image) |
| `pages/ConferenceDetail/tabs/ProgramDesignTab/ProgramGrid.tsx` | 876 | `GridCell`, `GridHeader`, `GridControls` |
| `pages/ConferenceDetail/tabs/settings/BadgeDesignerTab/ConditionalImagesSection.tsx` | 667 | Field editor + preview |
| `pages/portal/PaperDetailPage.tsx` | 637 | `PaperEditor`, `FeedbackSection`, `CoSpeakerManager` |
| `pages/PublicRegistration/SinglePageForm.tsx` | 610 | `AttendeeSection`, `BillingSection`, `PricingCalculator` |

## Deferred refactors (parked, not in flight)

See `~/.claude/projects/-Users-josediaz-SaaSConf/memory/project_deferred_followups.md` for rationale.

- **`pages/ConferenceDetail/tabs/settings/RecipientListsTab.tsx`** (~989 LOC) — only pick up if the file starts causing real friction (bugs, merge conflicts, onboarding pain). Refactor needs tests first (~2 h).
- **`api/v1/messaging/threads.py`** (985 LOC) — conference admin inbox; candidate for the same per-domain split that was applied to `messaging.py` and `papers.py`.

## What NOT to refactor
- Don't refactor files you're not already modifying
- Don't split schema files just for size
- Don't add abstractions for one-time patterns
- Don't migrate all inline queries to hooks at once
- The 17 `TYPE_CHECKING` imports in models are intentional — leave them

## Improvement progress — all completed
- CRIT #15-17: Migration failure masking, deployment rollback, data retention cleanup
- HIGH #1-5, #18-23: CI pipeline, linting, Docker pins, concurrency, async fixes, rate limiting, streaming exports, error boundaries
- MED #6-10, #24-28: Pydantic v2, mypy, VS Code, Makefile, CSP, N+1 fixes, pagination, React.memo
- LOW #11-14: Pre-commit hooks, constants, health probes, coverage artifacts
- CI Fixes Round 3: All ruff/mypy/test fixes, staging deploy, PG16 upgrade, nginx fix, full pipeline green
