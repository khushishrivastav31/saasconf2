# Design — Email Header/Footer in Invitations + Template Editor Padding

## Backend: Call-site Audit

### Functions to audit

| Function | File | Concern |
|----------|------|---------|
| `send_verification_email` | `app/core/email/__init__.py:435` | `conference_id` is `Optional[UUID] = None`; check all callers |
| `send_conference_team_invitation_email` | `app/core/email/__init__.py:703` | Already passes `conference_id` — verify |
| `send_cospeaker_invitation_email` | `app/core/email/__init__.py:548` | Passes `conference_id` — verify |
| User welcome / invite email | `app/core/email/__init__.py:669+` | May not pass `conference_id` at all |

### Fix pattern

For each call site where `conference_id` is available in context but not
passed to the email function, add it:

```python
# Before
await send_verification_email(db, email=..., token=..., tenant_slug=...)

# After
await send_verification_email(db, email=..., token=..., tenant_slug=..., conference_id=conference.id)
```

No changes to `render_email` or `_get_email_header_footer` — the wrapping
logic is already correct.

---

## Frontend: Template Editor Padding

### `EmailTemplatesTab.tsx`

Locate the `<div>` wrapper around the rich-text editor component (Quill or
similar). Add `px-4 py-2` to its className so the editor body has breathing
room from the container edges.

If the editor is a third-party component that injects its own container, add
the padding via a CSS wrapper class and a `.email-editor-wrapper` rule in
the relevant CSS file (or Tailwind `@apply` block).

---

## Test Impact

| File | Change |
|------|--------|
| `tests/core/test_email_templates.py` or new `tests/emails/test_invitation_header_footer.py` | Assert that calling `send_verification_email` with a `conference_id` whose conference has `email_header_html` set produces a rendered body containing the header HTML |
| Same | Assert `conference_id=None` produces no header/footer |
| New frontend test for `EmailTemplatesTab` | Editor wrapper has padding classes |

---

## Rollout / Risk

- Backend: adding `conference_id` to call sites is purely additive; it enables
  a feature that was already wired up in `render_email`.
- If any call site cannot know the `conference_id` (e.g. a global user invite
  unrelated to a specific conference), it should remain `None` — no wrapping
  is correct there.
