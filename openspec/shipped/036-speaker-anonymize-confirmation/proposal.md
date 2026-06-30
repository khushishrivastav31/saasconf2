# Change 036 — Confirm before anonymizing a speaker

## Status
`planned` · Branch: `feat/speaker-anonymize-confirmation`

## Methodology
TDD — Red → Green → Refactor.

## Problem

Ticket **MAIN-13321** ("We need to be able to delete a speaker no matter if
s/he has papers linked") shipped a `SpeakerDeleteDialog` that, when a speaker
has linked papers / co-speaker invitations / committee memberships, offers two
choices:

1. **Anonymize Speaker** — replace all personal data with "Deleted User",
   keeping the papers.
2. **Delete Speaker & Papers** — permanently cascade-delete the speaker and
   every paper.

Reviewer feedback on the ticket: *"Works well. But when select anonymize the
system should ask for confirmation to delete."*

The two options are asymmetric. **Delete Speaker & Papers** routes through a
second `confirm-cascade` step (lists the papers, requires a final "Delete All"
click). **Anonymize Speaker** calls `onAnonymize()` **immediately** on the first
click — it fires the destructive, irreversible anonymization mutation with no
confirmation. Anonymization cannot be undone (personal data is overwritten), so
it deserves the same confirm step.

## Proposed Change

Add a `confirm-anonymize` step to `SpeakerDeleteDialog`, mirroring the existing
`confirm-cascade` step. The change is confined to one frontend component.

1. **Anonymize is now two-step.** The "Anonymize Speaker" button advances the
   dialog to a `confirm-anonymize` step instead of calling `onAnonymize()`
   directly.

2. **The confirm step shows a summary + warning.** It restates what
   anonymization does (personal data replaced with "Deleted User"; the
   speaker's papers are kept and reassigned to the anonymized profile), warns
   the action cannot be undone, and offers **Back** / **Anonymize Speaker**
   buttons. The final button calls `onAnonymize()`.

3. **Cascade flow unchanged.** The existing `confirm-cascade` step keeps its
   current behaviour.

## Out of Scope

- Backend, schema, or API changes — none. The anonymize/cascade endpoints
  (`DELETE /cfp/applicants/{id}?mode=…`) are untouched. No OpenAPI regen, no
  migration.
- The simple `ConfirmDialog` path for speakers with **no** dependencies
  (deleted directly) — unchanged; it already confirms.

## Affected Code

- `frontend/src/pages/modules/cfp/CFPApplicants/SpeakerDeleteDialog.tsx` —
  add the `confirm-anonymize` step to the `step` state machine; the Anonymize
  button advances to it instead of firing the mutation.
- `frontend/src/pages/modules/cfp/CFPApplicants/__tests__/SpeakerDeleteDialog.test.tsx`
  — new test file covering the confirm-before-anonymize flow.

## Spec

See `openspec/specs/` once implementation lands.
