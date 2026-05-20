# Change 006 — Settings Save Toast Feedback

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

Multiple conference settings tabs are missing save-confirmation or
save-failure toast notifications, making it impossible for users to know
whether a mutation succeeded or failed:

| QA ref | Tab | Symptom |
|--------|-----|---------|
| 1.3.1–1.3.2 | Social Media (`SocialTab.tsx`) | `onSuccess` fires but no toast — `onUpdate()` is called but no visual feedback |
| 1.5 | Deadlines (`DeadlinesTab.tsx`) | `onSuccess`/`onError` handlers exist but do not call `showToast` |
| 1.6 | Locations (`LocationsTab.tsx`) | Multiple mutations (create/edit/delete) have `onSuccess`/`onError` but no toast |

`SocialTab.tsx`'s `updateMutation.onSuccess` calls `setIsDirty(false)` and
`onUpdate()` — sufficient for data refresh, but gives the user no visible
confirmation. `DeadlinesTab` and `LocationsTab` have the hook wired up but
toast calls are absent.

Additionally, `DeadlinesTab` has a cosmetic issue (QA 1.5.1): deadline form
fields have inconsistent CSS class styling compared to the rest of the
conference settings forms.

## Proposed Change

1. **SocialTab** — add `showToast('Social links saved', 'success')` in
   `onSuccess`, and `showToast(parseApiError(error, 'Failed to save'), 'error')`
   in `onError` (add `onError` if absent).

2. **DeadlinesTab** — add `showToast` calls to all `onSuccess`/`onError`
   handlers across create, update, and delete deadline mutations.

3. **LocationsTab** — add `showToast` calls to all `onSuccess`/`onError`
   handlers across create, update, and delete location mutations.

4. **DeadlinesTab CSS** (QA 1.5.1) — audit deadline form field classes against
   the `CRUDSettingsTab.tsx` pattern and align inconsistent classes (input
   padding, label size, border radius).

## Out of Scope

- Toast feedback for Settings sub-tabs not listed above.
- Toast system refactor (use the existing `useToast` / `showToast` hook).
- Deadline icon tooltips (QA 1.5) — addressed in a separate follow-up if the
  icon system requires non-trivial work.

## Spec

See `openspec/specs/` (to be created alongside implementation).
