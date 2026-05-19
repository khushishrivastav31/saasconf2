# Change 007 — Email Header/Footer in Invitations + Template Editor Padding

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

### 1.4.4.1 — Email header/footer not included in invitation emails

The `render_email()` function in `app/core/email/templates.py` wraps outgoing
email bodies with conference-level header/footer HTML when a `conference_id`
is supplied. All email-sending functions that use `render_email` with a valid
`conference_id` should therefore include the header/footer — but QA confirms
that invitation emails (e.g. `send_verification_email`, or user invite emails)
do not include them.

Root cause to investigate:
- `send_verification_email` accepts `conference_id: UUID | None = None`. At
  some call sites the `conference_id` may be omitted or `None`, causing
  `_get_email_header_footer` to return `("", "")` and skip wrapping.
- `send_user_invite_email` (user welcome email) may route through a different
  code path that does not call `render_email` at all.

The fix requires:
a) Auditing every invitation/verification email call site for missing
   `conference_id` arguments.
b) Ensuring every email that should carry the conference branding passes a
   non-None `conference_id`.

### 1.4.4.2 — Email template editor missing padding left/right

The `EmailTemplatesTab` rich-text editor renders with no left/right padding,
so the editable area bleeds to the edge of its container. The fix is a CSS
padding adjustment on the editor wrapper div.

## Proposed Change

1. **Backend** — audit all `send_*` call sites; patch any that omit
   `conference_id` when one is available in the calling context.

2. **Frontend** — add `px-4` (or equivalent) to the email template editor
   wrapper in `EmailTemplatesTab.tsx` so the text area has visible left/right
   padding.

## Out of Scope

- Per-template header/footer overrides.
- HTML sanitisation of the header/footer inputs (handled by DOMPurify on
  the frontend already).

## Spec

See `openspec/specs/` (to be created alongside implementation).
