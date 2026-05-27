# Change 023 — Session Types CRUD + QA coverage

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 2.3.1–2.3.2: "Session types" feature has never been tested. A
`session_types` table exists in the schema but it is unclear whether
there is a usable admin UI to create/edit/delete session types and
whether they are surfaced where they should be (program builder, paper
form, etc.).

## Proposed Change

1. **Recon** — audit current state of session types. Is there CRUD UI?
   Is the model used by program / papers?
2. **Backfill missing CRUD** — endpoints + Settings UI for session types
   (name, colour, default duration, description).
3. **Integration verification** — confirm session types appear in the
   program builder when creating a session.

## Out of Scope

- Bulk import / templating across conferences.
- Custom fields per session type.

## Spec

See `openspec/specs/` once implementation lands.
