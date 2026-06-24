# MAIN-13409: Paper form builder — per-field "Visible to reviewer"

## Context

Admins configure the paper submission form on the **Paper Form Builder** tab
(`frontend/src/pages/ConferenceDetail/tabs/settings/PaperFormBuilderTab/`). Each
field — built-in (`title`, `abstract_short`, `abstract_long`, `level`,
`learning_objectives`, `session_type`, `topics`, `video`) and admin-created
**custom** — currently carries two per-field checkboxes:

- **Visible** — does the field appear on the speaker submission form?
- **Required** — must the speaker fill it in?

Both flags only govern the **speaker** experience. Built-in config is stored as
JSONB (`conference_paper_form_schemas.builtin_fields_config`,
`BuiltinFieldConfig`); custom fields are rows in `paper_form_fields` (and
`paper_form_variant_fields`) with `is_visible` / `is_required` columns.

A reviewer (program-committee member) reviews assigned papers through the
**reviewer portal** — `AssignedPapersTab`, `EvaluatedPapersTab`, and the paper
detail view (`PaperDetailPage` / `PaperViewDisplay`). Today the reviewer simply
sees every populated field; the admin has no way to hide a field from reviewers
(e.g. an internal-only note, or PII that shouldn't reach reviewers).

## Problem

There is no per-field control over what a **reviewer** sees. The two existing
checkboxes are speaker-only and are also ambiguously labelled ("Visible",
"Required" — visible/required *to whom?*). The CFP team wants admins to decide,
per field, whether reviewers can see it, independently of speaker visibility.

## Proposed Solution

Add a **third per-field control** — **"Visible to reviewer"** — to every paper
form field (built-in and custom), and relabel the two existing controls to make
their audience explicit:

| Current label | New label              | Governs                                |
| ------------- | ---------------------- | -------------------------------------- |
| Visible       | **Visible for speaker**  | Field shown on the speaker form        |
| Required      | **Required for speaker** | Speaker must fill it in                |
| *(new)*       | **Visible for reviewer** | When checked, the field is shown to the reviewer |

The new control is **visibility only** — there is no "Required for reviewer",
because reviewers read papers, they do not fill the form in.

Behaviour:

- **Default `true`** — every field is visible to reviewers unless the admin
  unticks it. This preserves today's behaviour (reviewers see everything) for all
  existing conferences, so no data migration of values is needed.
- **Independent of speaker visibility** — a field can be hidden from the speaker
  form but still shown to reviewers, or vice-versa.
- **Enforced in the reviewer portal** — fields the admin marks *not* visible to
  reviewers are withheld from the reviewer-facing paper payloads / views
  (`AssignedPapersTab`, `EvaluatedPapersTab`, the reviewer paper detail). The
  **backend is authoritative**: reviewer paper endpoints strip non-visible field
  values so hidden data never reaches the reviewer's browser; the frontend also
  filters as defence-in-depth. See `design.md`.

This is **out of scope for the speaker form and admin/CFP module views** — those
keep rendering by the speaker `is_visible` flag, unchanged.

## Scope

- **Backend**
  - `BuiltinFieldConfig` (`backend/app/schemas/form_schema.py`) gains
    `visible_to_reviewer: bool = True` (JSONB — **no migration** for built-ins).
  - `paper_form_fields` and `paper_form_variant_fields` gain a
    `visible_to_reviewer BOOLEAN NOT NULL DEFAULT true` column
    (**migration 226**). Field create/update/response schemas updated.
  - Reviewer paper response builders
    (`backend/app/api/v1/cfp_portal/papers/_helpers.py::_build_assigned_paper_response`
    and the evaluated/detail path) load the conference form schema and **omit
    field values not visible to reviewers** before returning.
- **Frontend**
  - Form builder: add the **"Visible to reviewer"** checkbox and relabel the two
    existing ones in `BuiltinFieldsConfig.tsx`, `UnifiedFieldCard.tsx`, and the
    custom-field editor `FieldPropertyEditor.tsx`. Wire through
    `PaperFormBuilderTab` / `VariantFormBuilder` save paths.
  - Reviewer portal: `AssignedPapersTab`, `EvaluatedPapersTab` filter built-in &
    custom fields by `visible_to_reviewer` using the form schema (mirroring how
    `PaperDetailPage` already consults `builtin_fields_config`).
- **OpenAPI** — schema fields change ⇒ regenerate `api.generated.ts`.
- **Handbook** — document the new control on the Paper Form Builder section.

## Confirmed scope (2026-06-24)

- **Both built-in and custom fields** get the "Visible for reviewer" control —
  confirmed with the requester. A field whose box is checked is shown to the
  reviewer; unchecked hides it. (Custom-field DB column + migration 226 stay in.)
- **Visibility only** — confirmed there is no "Required for reviewer"; the third
  control is purely "Visible for reviewer".

## Out of scope

- The speaker submission form and validation (unchanged).
- Admin / CFP-module paper views (`PaperDetailModal`, Evaluated/Selected papers in
  `frontend/src/pages/modules/cfp/`) — admins still see everything.
- "Required for reviewer" semantics — not requested; only *visibility* for
  reviewers is added.
- Anonymity / conflict-of-interest rules (unchanged).

## Deliverable for this step

This OpenSpec folder (`proposal.md`, `design.md`, `tasks.md`).

**Review gate:** stop here. Do not start RED/GREEN until this spec — and the
built-in-vs-custom scope question above — is approved.
