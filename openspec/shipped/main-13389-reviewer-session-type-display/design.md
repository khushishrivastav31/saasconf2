# MAIN-13389: Design

## Behavior contract

A paper's session type is displayed to readers (reviewers, speakers, admins) **only
when the linked `SessionType` is a valid CFP option** — i.e. `is_active = true` and
`cfp_eligible = true`. Otherwise the paper is treated as having no session type and
no badge/label is rendered.

This mirrors the rule already enforced on the write/selection side:
- `validate_session_type` rejects non-(active+eligible) types on create/update
  (`app/api/v1/cfp/_paper_helpers.py:99`).
- The portal submit list and the management form dropdown only ever offer
  active + cfp_eligible types (`browsing.py:162`, `usePaperFormData.ts:159`).

The read side is the only place this rule is missing — which is why a stale link
"leaks" a label that the management form would never let you re-select.

## Implementation

Add the validity predicate to the `SessionType` lookups in the read resolvers so an
invalid/stale link yields `None`.

### Reviewer-facing (primary fix)

`backend/app/api/v1/cfp_portal/papers/_helpers.py`

- `_build_assigned_paper_response` (~line 429):
  ```python
  st_result = await db.execute(
      select(SessionType).where(
          SessionType.id == paper.session_type_id,
          SessionType.is_active.is_(True),
          SessionType.cfp_eligible.is_(True),
      )
  )
  ```
  `scalar_one_or_none()` → `None` for invalid types → `session_type_name` stays `None`.

### Other portal reads (consistency, same change)

- single-paper resolver (~line 242) — same predicate on the `SessionType.name` query.
- `_load_paper_list_context` (~line 142) — the batched `IN (...)` lookup gains
  `is_active` + `cfp_eligible`, so invalid ids drop out of the map.

### Management reads (consistency)

`backend/app/api/v1/cfp/shared.py`

- batched `session_type_map` builder (~line 282) — add the predicate so invalid ids
  don't enter the map (list view).
- single-paper resolver (~line 561) — same predicate (detail view).

This keeps the management list/detail views consistent with the management *form*,
which already hides the invalid type.

### Optional: shared helper

To avoid four copies of the same predicate, introduce a small helper, e.g.
`resolve_session_type_name(db, session_type_id) -> str | None` (and a batched
`resolve_session_type_names(db, ids) -> dict[UUID, str]`) in a shared CFP module and
call it from all sites. Decision deferred to review — the inline predicate is the
minimal change; the helper is the cleaner one.

## Alternative root cause (verify first)

If the staging `session_types` row for "Masterclass (6 hours)" is genuinely
`is_active = true AND cfp_eligible = true`, then the label is a **real stored
selection**, not a stale link, and the validity filter will not hide it. In that
case the bug is one of:

1. The session type was selected (portal/admin) and the reporter expects it gone —
   then this is a data correction, not a code bug.
2. A write path set `session_type_id` without going through `validate_session_type`.
   The portal create/update (`authored.py:139` / `:181`) sets `session_type_id`
   straight from the request **without** calling `validate_session_type` — unlike
   the management path (`papers.py:231`). If a client can submit a non-eligible id,
   that is a second, write-side gap worth closing (add `validate_session_type` to
   the portal create/update).

The verification step in tasks.md resolves which path applies before implementation.

## Risks

- Filtering display by `cfp_eligible` will also hide a session type that an admin
  later toggles to non-eligible **after** papers legitimately selected it. This is
  the intended behavior (stop showing options no longer offered), but call it out so
  reviewers can object if a different rule is wanted (e.g. `is_active` only).

## Test plan

- Reviewer (`/portal/assigned-papers`): paper linked to a non-cfp-eligible /
  inactive session type → response `session_type_name is None`.
- Reviewer: paper linked to a valid (active + cfp_eligible) type → name still
  resolves (no regression).
- Reviewer: paper with `session_type_id is None` → name is `None` (unchanged).
- Same three cases for the management list + single endpoints.
