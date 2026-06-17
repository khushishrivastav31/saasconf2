# Change MAIN-13323 — Co-speaker "Add" button affordance + guard against unadded input

## Status
`planned` · Branch: `feat/cospeaker-add-button-ux`

## Methodology
TDD — Red → Green → Refactor.

## Problem

On the paper submission form (`SubmitPaperPage`) and the paper edit form
(`PaperEditForm`, used by `PaperDetailPage`), the main speaker adds a co-speaker
by typing a **first name + email** and pressing **Add**, which turns the entry
into a chip that is then persisted on Save/Submit.

Two UX gaps surfaced in feedback:

1. **The "Add" button gives no affordance.** It is permanently styled grey, so
   a speaker who has typed a name + email has no visual cue that they still need
   to press it. People assume typing is enough.

2. **Typed-but-unadded co-speakers are silently dropped.** If the speaker types
   a name + email but clicks **Save Changes** / **Submit** without pressing
   **Add**, the pending input is discarded and the co-speaker is never invited —
   with no warning. The save succeeds and the speaker believes the co-speaker
   was added.

## Proposed Change

Scoped to the **paper form** co-speaker entry only (no backend / email changes).

1. **Make "Add" turn blue once the speaker starts typing.** When either the
   first-name or email field has content (and the entry is otherwise actionable —
   under the 3-co-speaker cap, no email-format error), the **Add** button
   switches from its neutral grey to the primary/blue style. When both fields
   are empty it returns to grey. This signals "there is something here to add".

2. **Block Save/Submit when there is unadded co-speaker input.** Before
   `handleSave` (edit) / `handleSubmit` (create) proceeds, if the first-name or
   email field still holds text, show an inline error asking the speaker to press
   **Add** (or clear the fields) and abort the save. Once the fields are empty
   (input added as a chip or cleared) the save proceeds normally.

## Out of Scope

- The co-speaker **invitation email link** behaviour (set-password vs. login
  landing). Explicitly deferred per stakeholder — the only fix in this change is
  the paper form.
- Backend `_sync_cospeakers`, provisioning, and email dispatch — unchanged.
- The accept/decline invitation flow and the chip remove/edit behaviour.
- Raising the 3-co-speaker cap.

## Affected Code

- `frontend/src/pages/portal/PaperEditForm.tsx` — **Add** button styling driven
  by pending-input + actionable state.
- `frontend/src/pages/portal/PaperDetailPage.tsx` — `handleSave` guard for
  unadded co-speaker input; passes pending-input flag if needed.
- `frontend/src/pages/portal/SubmitPaperPage.tsx` — **Add** button styling +
  `handleSubmit` guard for unadded co-speaker input.
- Tests:
  - `frontend/src/pages/portal/__tests__/SubmitPaperPage.test.tsx`
  - `frontend/src/pages/portal/__tests__/PaperDetailPage.test.tsx`

## Spec

No backend endpoint, schema, or response-code change → no OpenAPI regen.
