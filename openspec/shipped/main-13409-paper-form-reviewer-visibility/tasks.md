# Tasks — MAIN-13409: Per-field "Visible for reviewer"

> RED → GREEN → REFACTOR for every code item. Do not start until the spec
> (including the built-in-vs-custom scope question in `proposal.md`) is approved.

## 0. Scope — CONFIRMED (2026-06-24)
- [x] Reviewer control applies to **both built-in and custom** fields; checked =
      visible to reviewer; visibility only (no "Required for reviewer"). All
      **[custom]** tasks below are in scope.

## 1. Backend — schemas & model
- [ ] **RED** test: `BuiltinFieldConfig` round-trips `visible_to_reviewer`
      (default `True` when key absent).
- [ ] Add `visible_to_reviewer: bool = True` to `BuiltinFieldConfig`
      (`app/schemas/form_schema.py`).
- [ ] **[custom]** Add `visible_to_reviewer` column to `PaperFormField`
      (`app/models/form_schema.py`) and the variant field model
      (`app/models/paper_form_variant.py`).
- [ ] **[custom]** Add `visible_to_reviewer` to field create/update/response
      schemas (`PaperFormFieldCreate/Update/Response`,
      `VariantFieldCreate/Update/Response`) and the `_build_field_response` /
      `_build_variant_field_response` helpers in both `form_schema.py` and
      `cfp_portal/form_schema.py`.
- [ ] **[custom]** Alembic migration `226_paper_form_field_visible_to_reviewer.py`
      — add column (NOT NULL, server_default `true`) to `paper_form_fields` and
      `paper_form_variant_fields`; reverse drops both. Test up/down.

## 2. Backend — admin write paths
- [ ] Confirm `PUT /…/paper-form-schema` persists the new built-in key (whole-map
      `model_dump`, expected free). Add/extend test.
- [ ] **[custom]** Test custom field create/update persists & returns
      `visible_to_reviewer`.

## 3. Backend — reviewer enforcement
- [ ] **RED** test: `_build_assigned_paper_response` omits a built-in value and a
      custom answer when `visible_to_reviewer=False`; includes when `True`/default;
      `title` always present; respects `form_variant_id` config.
- [ ] Preload the conference form schema (built-in config + custom fields, plus
      variant) in the assigned-papers list helper — batched, no N+1.
- [ ] In the response builder, null out built-in values and drop
      `custom_field_answers` keys flagged not-visible-to-reviewer.
- [ ] Apply the same stripping to the evaluated-paper / reviewer detail path that
      shares the helper.

## 4. Frontend — form builder UI
- [ ] **RED** test: built-in field card shows three checkboxes with labels
      "Visible for speaker" / "Required for speaker" / "Visible for reviewer";
      toggling reviewer checkbox calls save with `visible_to_reviewer`.
- [ ] `BuiltinFieldsConfig.tsx`: add the third checkbox; relabel the two existing;
      `title` reviewer checkbox disabled+checked.
- [ ] `UnifiedFieldCard.tsx`: add `is_visible_to_reviewer` to `UnifiedField`, a
      third quick-toggle, and `onToggleReviewerVisible` prop.
- [ ] **[custom]** `FieldPropertyEditor.tsx`: add "Visible for reviewer" checkbox
      (default checked); relabel speaker controls.
- [ ] Thread `visible_to_reviewer` through `PaperFormBuilderTab/index.tsx` and
      `VariantFormBuilder.tsx` state + save mutations.

## 5. Frontend — reviewer portal
- [ ] Verify `AssignedPapersTab.tsx` / `EvaluatedPapersTab.tsx` / reviewer
      `PaperDetailPage` hide fields once the backend omits their values (the
      `paper.x && (...)` and `custom_field_answers` guards). Add a test that a
      stripped field is not rendered. Add explicit schema-based filtering only if
      a gap is found.

## 6. Schema drift, sweep, docs
- [ ] `pnpm gen:api` (env vars per CLAUDE.md) — commit `api.generated.ts`;
      `pnpm gen:api:check` clean.
- [ ] Backend: targeted pytest → `mypy app/` → `ruff check app/ && ruff format
      --check app/` → full `pytest -n 4 -q`.
- [ ] Frontend: `pnpm exec tsc --noEmit && pnpm exec eslint src/` → `pnpm test`.
- [ ] Update handbook (`frontend/src/pages/Handbook/handbookSections.tsx`) —
      Paper Form Builder: document "Visible for reviewer".

## 7. Ship
- [ ] Move this folder `openspec/changes/` → `openspec/shipped/` in the PR.
- [ ] Present commit message + PR title; **stop at `gh pr create`** (no auto-merge
      per user preference); user merges manually.
