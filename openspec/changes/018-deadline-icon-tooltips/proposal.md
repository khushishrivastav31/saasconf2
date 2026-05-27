# Change 018 — Deadline icon tooltips

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 1.5: The Deadlines page renders status icons (clock, calendar,
warning) next to each deadline, but hovering over them shows nothing.
Users have no way to know what each icon means without trial and error.

## Proposed Change

For every status icon in the deadlines list, add an accessible tooltip
that names the deadline's status (e.g. "Upcoming", "Past due",
"Today", "Submitted"). Use the existing tooltip primitive (search for
`Tooltip`, `<Tooltip>`, or `title="..."`).

## Out of Scope

- Reworking the icon set itself.
- Adding new deadline statuses.
- Save-toast behaviour (covered in `006-settings-save-toast-feedback`).

## Spec

See `openspec/specs/` once implementation lands.
