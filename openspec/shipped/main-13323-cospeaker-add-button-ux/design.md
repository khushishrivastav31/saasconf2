# Design — Co-speaker "Add" affordance + unadded-input guard

## Two surfaces, same logic

The co-speaker entry row exists in two places, each with its own copy of the
state (`cospeakerFirstName`, `cospeakerInput`, `emailError`, `cospeakers`) and an
`handleAddCospeaker` handler:

- **Create** — `SubmitPaperPage.tsx` (inline JSX + `handleSubmit`).
- **Edit** — `PaperDetailPage.tsx` owns state + `handleSave`; the row is rendered
  by the presentational `PaperEditForm.tsx`, which already receives
  `cospeakerFirstName` / `cospeakerInput` / `emailError` as props.

Both need the same two behaviours, derived from the same inputs.

## "Has pending input" is the single signal

```ts
const hasPendingCospeaker =
  cospeakerFirstName.trim() !== '' || cospeakerInput.trim() !== '';
```

This drives **both** features:

### 1. Button colour

The button is *actionable* when there is pending input and the entry is not
otherwise blocked:

```ts
const canAddCospeaker =
  hasPendingCospeaker && !emailError && cospeakers.length < 3;
```

- `canAddCospeaker` → primary/blue (`bg-primary-600 text-white hover:bg-primary-700`).
- otherwise → existing neutral grey.

The existing `disabled={cospeakers.length >= 3 || !!emailError}` stays as-is, so
the button is still un-clickable at the cap or on an invalid email; colour is
purely the affordance layer on top.

In `PaperEditForm` the flag is computed locally from the props it already
receives — no new prop needed for the colour.

### 2. Save/Submit guard

At the top of `handleSubmit` (create) and `handleSave` (edit), before building
the payload:

```ts
if (cospeakerFirstName.trim() || cospeakerInput.trim()) {
  setError(COSPEAKER_UNADDED_MESSAGE);
  return;
}
```

`COSPEAKER_UNADDED_MESSAGE` = *"You've typed a co-speaker but haven't added
them. Press 'Add' to include them, or clear the name and email fields."*

The guard runs only where the inputs can be non-empty. The co-speaker row is
only rendered for the main speaker (create: current user is always main speaker;
edit: gated on `paper.is_main_speaker`), so a non-main-speaker's empty fields
never trigger it.

In the **edit** form the guard lives in `PaperDetailPage.handleSave` (which owns
the state), so `PaperEditForm` needs no new prop for the guard — only the colour
logic, which it derives from existing props.

## Why a hard block (not auto-add on save)

Stakeholder feedback is explicit: *"the System should give an Error to press the
Add Button."* Auto-adding on save would hide the same validation
(`handleAddCospeaker` enforces self-add, duplicate, and cap rules and surfaces
their errors) and could silently add an entry the speaker was still editing. A
hard block keeps a single, already-tested add path and makes the required action
obvious.

## Risk / blast radius

- Frontend-only, presentational + a guard clause. No API, schema, or migration.
- The guard can only *prevent* a save that would have silently dropped data; it
  never changes a successful save's payload.
- Existing add/remove/validation paths are untouched.
