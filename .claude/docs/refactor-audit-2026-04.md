# Refactor Audit — what could we refactor, what would we gain

## Context

You just shipped a stack of cross-domain features (PRs #160–#173) that mirrored conference patterns into trainings: messaging, news, screen overlays, plus the `is_me` flag, mode toggle, and admin inboxes. The pattern was: build for conferences, mirror for trainings. Sometimes we shared code (PR #173 extracted overlay subcomponents), sometimes we duplicated (NewsTab, ScreenOverlaysTab, training admin threads). The refactoring doc at [`.claude/docs/refactoring.md`](.claude/docs/refactoring.md) was just refreshed to reflect today's actual file sizes — but it doesn't quantify the *gain* per refactor or order them. This audit does.

Three Explore agents read the codebase in parallel and surfaced concrete numbers (not speculation): LOC counts, similarity %, code-reduction estimates, risk levels. The output below is **ranked by gain/cost**, not by code area.

## Findings — ranked by gain/cost

| # | Refactor | Est. LOC saved | Effort | Risk | Gain/cost | Notes |
|---|---|---|---|---|---|---|
| 1 | **`tests/trainings/conftest.py`** — extract `_admin_token`, `tn_tenant`, `tn_admin`, `_seed_two_placements` etc. from 7 trainings test files | **~245 LOC** | 0.5 day | Very low | **3.5×** | Pure mechanical; deterministic fixtures |
| 2 | **Alembic `add_domain_discriminator()` helper** — collapse the 213/215/216/217 pattern (add column + CHECK + paired CHECK + index) into one call | **~35 LOC per future migration** (4 already exist; ~3–5 more likely) | 0.5 day | Low | **3.5×** | Pure SQL boilerplate; explicit param surface |
| 3 | **Hook: `useErrorState`** — replace 152 instances of `const [error, setError] = useState<string \| null>(null)` | ~6 LOC per call site × 152 = ~900 LOC simplified (not deleted, but normalized) | 1 day | Low | **High** | Critical to do BEFORE file splits — eslint warning cap is **exactly at 106**; new file-split warnings would fail CI without hooks reducing them first |
| 4 | **Hook: `useModalState<T>`** — collapse the 29 confirm-dialog/preview-modal patterns (`const [target, setTarget] = useState<X \| null>(null)` + `open` + `close`) | ~10 LOC per call site × 29 = ~290 LOC simplified | 0.5 day | Low | **High** | Same eslint-cap reasoning as #3 |
| 5 | **Frontend `<NewsTab>` merge** — conference (441 LOC) + trainings (367 LOC) are **88% identical** except API base + label text. Generic `<NewsTab apiBase domain>` reuses the existing portal-news pattern as the positive reference | **~320 LOC** | 1 day | Low | **2.1×** | Both already shipped; testing covers both shapes |
| 6 | **Frontend `<ScreenOverlaysTab>` merge** — conference (~280 LOC) + trainings (~300 LOC) are **85% identical** after PR #173 already extracted the subcomponents | **~220 LOC** | 1 day | Low | **1.8×** | Builds on PR #173 |
| 7 | **Backend `messaging/threads.py` split** (985 LOC) — separate `threads_queries.py` (5 correlated subqueries + 9 filters), `threads_list.py`, `threads_mutations.py`, `threads_export.py` | ~285 LOC moved out of core, no net deletion but big clarity gain | 3–4 days | Medium | **Medium** | Mirrors `cfp_portal/messaging/` package pattern (PR #152) |
| 8 | **Backend `registrations/core.py` split** (854 LOC) — extract `vat.py` (130 LOC self-contained EU VAT logic) and `replace_attendee.py` (100 LOC distinct workflow) | ~230 LOC moved out of core | 2–3 days | Medium | **Medium** | VAT module is heavyweight + mathematical; deserves isolation |
| 9 | **Backend news CRUD generic service** — `_build_response` + `_resolve_author` are identical between conference and trainings news; create/update/delete are 90% identical | ~89 LOC | 2 days | Low–medium | **Medium** | The portal news endpoint already does this domain-agnostically |
| 10 | **Hook: `useConfirmAction<T,R>`** — collapse the 8+ delete-with-confirm + isPending mutation patterns | ~15 LOC per call site × 8 = ~120 LOC simplified | 1 day | Low | **Medium** | Smaller surface than #3/#4; ship after them |
| 11 | **Frontend `EditorToolbar.tsx` split** (1,001 LOC) — extract `ColorPicker` (183 LOC) + `TableBorderColorPicker` (135 LOC) | parent → ~683 LOC (still over 400; flagged as "split when modifying further") | 2 hours | Low | **Medium** | Eslint cap concern: extracting into separate files might add new "max-lines" warnings if those subfiles also breach 400. Verify counts before. |
| 12 | **Frontend `ConditionalImagesSection.tsx` split** (667 LOC) — extract `AddForm` (180), `EditForm` (130), `List` (140) | parent → ~217 LOC | 3 hours | Low | **Medium** | Three forms in one file; clear seams |
| 13 | **Backend `portal/registration.py` split** (742 LOC) — separate public-metadata, public-bookable-sessions, public-registration-create concerns; deduplicate bookable-sessions logic that exists twice (admin wrapper + portal inline) | ~280 LOC moved out + ~100 LOC deduplication | 2–3 days | Medium | **Lower** | Defer until #7 (threads.py split) is shipped — cleaner reference pattern |
| 14 | **Frontend `MessagingTab` partial merge** — conference (~450 LOC) and trainings (~400 LOC) ThreadList view is ~75% identical, but create/reply diverge (broadcasts vs 1:1) | ~150 LOC | 3–5 days | High | **Lower** | Diverging requirements; extract only `<ThreadListBase>`. Higher-risk than NewsTab merge — pursue last |

**Items deliberately NOT in this list** (parked in [`project_deferred_followups.md`](~/.claude/projects/-Users-josediaz-SaaSConf/memory/project_deferred_followups.md), still apply):
- `RecipientListsTab.tsx` (~989 LOC) — only if it starts causing real friction
- `ProgramGrid.tsx` (876 LOC) — split only when modifying its features
- `PaperDetailPage.tsx` (637 LOC) — split only when modifying
- `SinglePageForm.tsx` (610 LOC) — already leverages 3 custom hooks; further splits hurt readability
- SAVEPOINT-per-test isolation — wait for runner upgrade

## Recommended sequence

Five phases ordered to chain gains (each phase reduces friction for the next) and respect the eslint-warning-at-cap constraint.

### Phase A — quick wins (1 day, do together)

1. **#1 `tests/trainings/conftest.py`** — single PR, mechanical
2. **#2 Alembic helper** — single PR, adds `app/db/migrations/helpers.py` with `add_domain_discriminator()`. Don't retrofit existing migrations (immutable history). Helper is for the *next* time we add a domain'd table.

**Verify:** test suite runs identically (same passes, no new errors); helper has a 1–2 unit-test smoke test asserting it generates the right SQL.

### Phase B — hooks (2 days)

Must precede file splits (#7, #8, #11, #12) because the 106-warning eslint cap is at limit. Hooks shrink line counts in touched files and free up warning headroom.

3. **#3 `useErrorState`** + bulk migration of high-traffic files (start with the ones we just touched: `NewsTab.tsx`, `MessagesTab.tsx`, `SendTrainingNewsModal.tsx`, `ScreenOverlaysTab.tsx`).
4. **#4 `useModalState<T>`** + migrate the same files.
5. **#10 `useConfirmAction`** can ship in the same PR or follow.

**Verify:** vitest 1934/1934 still passes; eslint warnings count *strictly decreases*; touched files lose ~30–50 LOC each.

### Phase C — cross-domain merges (3 days)

6. **#5 `<NewsTab>` merge** — generic component takes `domain` + `apiBase` + display labels. Conference + trainings tabs become 1-line wrappers. Single PR.
7. **#6 `<ScreenOverlaysTab>` merge** — same shape; depends on #5 landing first to validate the pattern. Single PR.
8. **#9 backend news CRUD generic** — extract `_build_response`, `_resolve_author`, and a domain-parameterized CRUD service. Keep the two router files (different prefixes), but they call the same service. Single PR.

**Verify:** existing pytest news suite (10 cases) and vitest suites pass unchanged; manual smoke test on staging confirms both domains still render identically.

### Phase D — backend splits (5–7 days, sequential)

9. **#7 `messaging/threads.py` split** — package layout matching the `cfp_portal/messaging/` precedent. One PR.
10. **#8 `registrations/core.py` split** — extract `vat.py` and `replace_attendee.py`. One PR.
11. **#13 `portal/registration.py` split** — *only after #9 lands*; share bookable-sessions query helper between admin and portal. One PR.

**Verify:** mypy clean across `app/` (708+ files); ruff clean; pytest 3127+ passes; no API contract changes (route paths unchanged).

### Phase E — frontend splits (1 day, do together)

12. **#11 `EditorToolbar.tsx`** — extract two color pickers
13. **#12 `ConditionalImagesSection.tsx`** — extract three forms

Single PR for both since they're mechanical and unrelated.

**Verify:** vitest 1934/1934 passes; eslint warning count unchanged or lower (Phase B's hook cleanup must precede this); manual click-through on a conference badge designer confirms images section behaves identically.

### Phase F — defer

14. **#14 MessagingTab partial merge** — extract only `<ThreadListBase>`; do not unify create/reply. Pursue only if Phase C's NewsTab merge proves stable for a few weeks.

## Critical files

**Ranked by audit weight**, with current LOC.

Backend:
- [`backend/app/api/v1/messaging/threads.py`](backend/app/api/v1/messaging/threads.py) — 985 LOC (Phase D)
- [`backend/app/api/v1/registrations/core.py`](backend/app/api/v1/registrations/core.py) — 854 LOC (Phase D)
- [`backend/app/api/v1/portal/registration.py`](backend/app/api/v1/portal/registration.py) — 742 LOC (Phase D)
- [`backend/app/api/v1/news.py`](backend/app/api/v1/news.py) — 331 LOC (Phase C, with [`backend/app/api/v1/trainings/news.py`](backend/app/api/v1/trainings/news.py))
- [`backend/app/db/migrations/versions/213_*`, `215_*`, `216_*`, `217_*`](backend/app/db/migrations/versions/) — pattern source for #2

Frontend:
- [`frontend/src/components/common/richtext/EditorToolbar.tsx`](frontend/src/components/common/richtext/EditorToolbar.tsx) — 1,001 LOC
- [`frontend/src/pages/ConferenceDetail/tabs/settings/BadgeDesignerTab/ConditionalImagesSection.tsx`](frontend/src/pages/ConferenceDetail/tabs/settings/BadgeDesignerTab/ConditionalImagesSection.tsx) — 667 LOC
- [`frontend/src/pages/ConferenceDetail/tabs/NewsTab.tsx`](frontend/src/pages/ConferenceDetail/tabs/NewsTab.tsx) ↔ [`frontend/src/pages/Trainings/tabs/NewsTab.tsx`](frontend/src/pages/Trainings/tabs/NewsTab.tsx) — 441 + 367 = 808 LOC for #5
- [`frontend/src/pages/ConferenceDetail/tabs/ScreenOverlaysTab/index.tsx`](frontend/src/pages/ConferenceDetail/tabs/ScreenOverlaysTab/index.tsx) ↔ [`frontend/src/pages/Trainings/tabs/settings/ScreenOverlaysTab.tsx`](frontend/src/pages/Trainings/tabs/settings/ScreenOverlaysTab.tsx) — for #6

Tests:
- 7 files under [`backend/tests/trainings/`](backend/tests/trainings/) duplicating 45 LOC of fixtures each — for #1

Hooks (new):
- `frontend/src/hooks/useErrorState.ts`
- `frontend/src/hooks/useModalState.ts`
- `frontend/src/hooks/useConfirmAction.ts`

Helpers (new):
- `backend/app/db/migrations/helpers.py` — `add_domain_discriminator()`
- `backend/tests/trainings/conftest.py`

## Reused pieces

- **`cfp_portal/messaging/` package layout** as the reference for #7 (threads.py split)
- **`cfp_portal/news.py:list_portal_news`** as the reference for #5 + #9 — already handles both domains via `OR`-filter
- **PR #173's `components/screen-overlays/`** as the reference for #6 — proves the cross-domain component pattern works
- **Existing `~/.claude/docs/refactoring.md`** — refreshed yesterday; this audit feeds priority data into the "remaining large files" section. After plan execution, update the doc again to mark items shipped.

## Verification

Per-phase sweep: `cd backend && venv/bin/python -m mypy app/ && venv/bin/ruff check app/ && venv/bin/ruff format --check app/ && venv/bin/python -m pytest tests/ -q --ignore=tests/slow` plus `cd frontend && npx tsc --noEmit && npx eslint src/ --max-warnings 106 && npm run test`.

After full plan execution, expected outcome:
- Backend: 3 large files (`threads.py`, `core.py`, `portal/registration.py`) split into packages; news + screen-overlays consolidated; migration helper landed.
- Frontend: 2 NewsTab files → 1 generic; 2 ScreenOverlaysTab files → 1 generic; `EditorToolbar.tsx` and `ConditionalImagesSection.tsx` split into folders; 3 new hooks consumed across ~30+ components.
- Tests: 1 trainings `conftest.py` removes ~245 LOC of fixture duplication.
- **Total LOC reduction: ~1,400+ across deletions + ~290+ simplified via hooks.**
- Refactoring doc updated to reflect new state.

## Out of scope

- Database migrations to retroactively change existing `213–217` to use the helper — Alembic history is immutable; helper applies forward only.
- Re-architecting authentication, RLS, or any cross-cutting infra concerns.
- Adding new features. This is a code-shape exercise.
- Splitting `RecipientListsTab.tsx`, `ProgramGrid.tsx`, `PaperDetailPage.tsx`, `SinglePageForm.tsx`, or `MessagingTab` — explicit "only when modifying" deferral.
- SAVEPOINT-per-test isolation (Phase 3 of the backend CI plan) — gated on the GitHub runner upgrade.

## Optional follow-up (not part of this plan)

If you want this audit to outlive the planning session, promote it to `.claude/docs/refactor-audit-2026-04.md` so the team can reference the gain/cost numbers when prioritizing tickets. Say the word and I'll do that as the first action when we exit plan mode.
