# Tasks — Admin-triggered CFP review seeding

Branch: `fix/reviewer-video-download-hyperlink` (existing — do not create a new one).

## 0. Recon (before RED)
- [ ] Read `.claude/docs/security.md` (new privileged write endpoint).
- [ ] Confirm the conference CFP admin surface where the button belongs
      (frontend component + route).
- [ ] Locate the app's existing bootstrap/config payload to hang the `available`
      boolean off (fall back to one boolean field if there's no such payload).

## 1. Service extraction (refactor, behavior-preserving)
- [ ] Create `app/services/cfp_review_seed.py`: move `get_or_create_*`,
      `create_reviews`, `_compute_review`, `_build_config_snapshot`,
      `ensure_review_config`, `_load_scored_questions` from the script.
- [ ] Add `SeedResult` dataclass + `seed_cfp_review_data(db, conference, *, papers,
      reviewers, must_have)` — assumes db is already tenant-RLS-scoped.
- [ ] Rewrite `scripts/seed_cfp_review_data.py::main` to import and call the
      service; keep all CLI/interactive/`--list`/print logic in the script.
- [ ] Verify the CLI still runs identically (idempotent re-run = 0 new rows).

## 2. Env gate (RED → GREEN)
- [ ] RED: `test_is_seeding_allowed` — true for `development`/`staging`, false for
      `production`, unknown, and empty (closed-by-default allow-list).
- [ ] GREEN: `is_seeding_allowed(settings)` helper.

## 3. Endpoint (RED → GREEN)
- [ ] RED (in `backend/tests/test_cfp_seed_endpoint.py`):
  - [ ] `404` when env is production (gate), even for a valid tenant admin.
  - [ ] `401/403` for non-tenant-admin callers.
  - [ ] `404` for a `cfp_id` in another tenant (ownership).
  - [ ] Happy path (env=staging): seeds, returns correct counts, rows exist.
  - [ ] Idempotent: second call creates 0 new rows.
  - [ ] Invariant: no `User`/portal auth rows created by seeding.
  - [ ] Input bounds: rejects `papers` out of 1–100, `must_have > papers`.
- [ ] GREEN: `app/api/v1/cfp/seed.py` + request/response Pydantic schemas;
      register router in `app/api/v1/cfp/__init__.py`.
- [ ] Env-flag exposure endpoint/field per recon decision (+ test).

## 4. Frontend (RED → GREEN)
- [ ] RED (vitest in `__tests__/`): button hidden when `available` is false;
      shown + fires mutation when true; success/error toast paths.
- [ ] GREEN: `SeedTestDataButton` + TanStack Query mutation + confirm dialog;
      wire the `available` flag; invalidate papers/reviews queries on success.
- [ ] Dark-mode `dark:` variants.

## 5. Full sweep (all mandatory — CI gates these)
- [ ] `pytest tests/test_cfp_seed_endpoint.py -v` (+ service/gate tests) green.
- [ ] `mypy app/ --config-file=pyproject.toml` clean (whole tree).
- [ ] `ruff check app/ && ruff format --check app/` clean (whole tree).
- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/` clean (whole tree).
- [ ] Full suites: `pytest tests/ -n 4 -q` and `pnpm test`.
- [ ] OpenAPI: `pnpm gen:api` + commit `api.generated.ts`; `pnpm gen:api:check`
      prints nothing.
- [ ] Handbook update (`handbookSections.tsx`) — new admin-visible action.
- [ ] Security audit: backend `pip-audit` (with CI's `--ignore-vuln` list) +
      frontend `pnpm audit --audit-level=critical`.

## 6. Ship
- [ ] Move this folder `openspec/changes/main-13444-admin-seed-endpoint/` →
      `openspec/shipped/` in the same PR.
- [ ] Present commit message + PR title, ask once, then push (no `--auto`
      merge per user preference).
