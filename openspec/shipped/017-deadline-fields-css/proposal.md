# Change 017 — Deadline fields CSS consistency

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor (cosmetic).

## Problem

QA 1.5.1: The Deadlines form mixes input styles — some inputs use the
shared `Input` component classes (`rounded-md border-gray-300 ...`),
others have raw HTML inputs with different border radius, padding, and
focus rings. Visually inconsistent across the form.

## Proposed Change

Audit the deadline form (`DeadlinesTab.tsx` or similar) and:

1. Replace every raw `<input>` with the shared `Input` / `Select`
   components used elsewhere in the app.
2. Standardize label styling (`text-sm font-medium text-gray-700 dark:text-gray-300`).
3. Match input width + spacing to the rest of the Settings tabs.

## Out of Scope

- Adding new deadline types.
- Refactoring the underlying deadlines model.
- Save-toast behaviour (covered separately in 1.5).

## Spec

See `openspec/specs/` once implementation lands.
