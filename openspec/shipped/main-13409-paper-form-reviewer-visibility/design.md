# Design — MAIN-13409: Per-field "Visible for reviewer"

## Data model

### Built-in fields (no migration)

Built-in field settings live in `conference_paper_form_schemas.builtin_fields_config`
(JSONB) and per-variant in `paper_form_variants.builtin_fields_config`, both
validated by `BuiltinFieldConfig` (`backend/app/schemas/form_schema.py`). Add:

```python
class BuiltinFieldConfig(BaseModel):
    visible: bool = True            # → "Visible for speaker"
    required: bool = False          # → "Required for speaker"
    visible_to_reviewer: bool = True  # NEW
    display_order: int | None = None
    help_text: str | None = None
    ...
```

Because the column is JSONB, **no Alembic migration** is needed. Missing key ⇒
Pydantic default `True` ⇒ existing conferences keep showing every field to
reviewers. The default-schema builders that seed `builtin_fields_config`
(`form_schema.py` admin + `cfp_portal/form_schema.py` portal,
`backend/app/core/default_settings.py`, `conference_duplicate.py`) inherit the
default automatically — no change required, but verify they round-trip the new
key.

### Custom fields (migration 226)

Custom fields are real columns on two tables — add to both:

- `paper_form_fields` (`app/models/form_schema.py::PaperFormField`)
- `paper_form_variant_fields` (`app/models/paper_form_variant.py`)

```python
visible_to_reviewer: Mapped[bool] = mapped_column(
    Boolean, nullable=False, server_default="true", default=True
)
```

Migration `226_paper_form_field_visible_to_reviewer.py`:
`op.add_column(... server_default="true", nullable=False)` on both tables; reverse
drops both. RLS unaffected (additive column on existing tenant-scoped tables).

Schemas updated in `form_schema.py`: `PaperFormFieldCreate`,
`PaperFormFieldUpdate` (`bool | None`), `PaperFormFieldResponse`,
`VariantFieldCreate`, `VariantFieldUpdate`, `VariantFieldResponse` — each gains
`visible_to_reviewer` (default `True` on create, `None` on update, plain `bool`
on response). The two `_build_field_response` / `_build_variant_field_response`
helpers in `form_schema.py` and `cfp_portal/form_schema.py` copy the new attr.

## Admin write paths (already exist, just pass the field through)

- `PUT /conferences/{id}/paper-form-schema` — `builtin_fields_config` is
  `model_dump()`'d wholesale (`form_schema.py:226`), so the new key flows through
  with no endpoint change.
- `POST/PUT /…/fields` and the variant equivalents already persist the create/
  update schemas; adding the attr to the model + schema is enough.

## Enforcement — reviewer portal (backend authoritative)

The reviewer's data comes from `cfp_portal/papers/`:

- `GET /portal/assigned-papers` and the single-paper get
  (`assigned.py`) → `_build_assigned_paper_response`
  (`_helpers.py:410`) which sets `abstract_short`, `abstract_long`, `level`,
  `learning_objectives`, `custom_field_answers`, `video_url`, etc.

**Plan:** in `_build_assigned_paper_response` (and the evaluated-paper / detail
path that shares the helper), load the conference's `ConferencePaperFormSchema`
(`builtin_fields_config` + custom `fields`, plus the relevant variant if the
paper has `form_variant_id`) and, for any field with
`visible_to_reviewer is False`, set the corresponding response value to `None`
(built-ins) / drop the key from `custom_field_answers` (custom). Batch the schema
load per request to avoid an N+1 across the assigned-papers list (one schema per
conference; the list helper `_preload_*` already batches conference/session-type
lookups — extend it to preload schemas keyed by conference_id).

Mapping built-in config keys → response attributes:
`abstract_short`, `abstract_long`, `level`, `learning_objectives`,
`session_type` (`session_type_name`), `topics`, `video` (`video_url`). `title` is
always shown (a paper with no title is meaningless) — treat `title` as
non-hideable, matching how the form builder marks it always-required.

Frontend filters as **defence-in-depth** (it can't show what the API didn't
send), but the security boundary is the API.

## Frontend — form builder UI

### Built-in cards — `BuiltinFieldsConfig.tsx` & `UnifiedFieldCard.tsx`

The screenshot field card renders two checkboxes (`Visible`, `Required`). Add a
third and relabel:

```
[ Short Abstract  * ]   [Built-in]   ☑ Visible for speaker  ☑ Required for speaker  ☑ Visible for reviewer
```

- `onChange({...fieldConfig, visible_to_reviewer: e.target.checked})` for built-ins.
- Keep the `alwaysRequired` disable logic for the speaker pair; the reviewer
  checkbox is independent and never disabled by `alwaysRequired`.
- `title` row: the reviewer checkbox is disabled+checked (always visible to
  reviewers), consistent with the backend non-hideable rule.

`UnifiedFieldCard`'s quick-toggle block (lines 173–196) gets a third toggle and
a new `onToggleReviewerVisible?` prop; `UnifiedField` interface gains
`is_visible_to_reviewer`.

### Custom field editor — `FieldPropertyEditor.tsx`

Add a "Visible for reviewer" checkbox alongside the existing visible/required
controls, defaulting checked. Relabel existing ones to the speaker-explicit
wording for consistency.

### Wiring

`PaperFormBuilderTab/index.tsx` and `VariantFormBuilder.tsx` build the config map
and field create/update payloads — thread `visible_to_reviewer` through their
state and save mutations. `constants.ts` `BUILTIN_FIELD_DEFS` unchanged.

## Frontend — reviewer portal enforcement

`AssignedPapersTab.tsx` and `EvaluatedPapersTab.tsx` currently render built-in
fields with hard-coded `paper.abstract_short && (...)` blocks and do **not**
fetch the form schema. Two options:

1. **Rely on the backend** nulling values — the existing `paper.x && (...)`
   guards already hide empty fields, so no schema fetch is needed in these tabs.
   *(Preferred — least code, backend is the source of truth.)*
2. Fetch the schema and explicitly filter, mirroring `PaperDetailPage`'s
   `unifiedFormFields` memo (`PaperDetailPage.tsx:157`).

Go with **(1)**: once the backend withholds non-reviewer-visible values, the
current "render if present" guards Just Work, and custom fields already render
from `custom_field_answers`. `PaperDetailPage` (reviewer view) likewise relies on
the value being absent; confirm its custom-field list also keys off
`custom_field_answers` presence.

## Testing

- **Backend** (`backend/tests/test_form_schema*.py`, `test_cfp_portal*` /
  assigned-papers tests):
  - `BuiltinFieldConfig` round-trips `visible_to_reviewer`; default `True` when
    absent.
  - PUT schema persists `visible_to_reviewer` in `builtin_fields_config`.
  - Custom field create/update persists the column; response includes it;
    migration up/down.
  - **Enforcement:** assigned-paper response omits a built-in value and a custom
    answer when `visible_to_reviewer=False`; includes them when `True`/default;
    `title` always present.
- **Frontend** (`__tests__` siblings):
  - Form builder renders three checkboxes with the new labels; toggling
    "Visible for reviewer" fires the save with the right payload.
  - `AssignedPapersTab` does not render a field the API omitted.

## Migration / rollout

Additive and backwards-compatible. Default `true` everywhere ⇒ existing
conferences unchanged until an admin opts a field out. No backfill.
