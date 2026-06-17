# Change MAIN-13323 — Co-speaker invitation link must land on set-password, not login

## Status
`planned` · Branch: `fix/cospeaker-invite-link-set-password`

## Methodology
TDD — Red → Green → Refactor.

## Problem

When a main speaker adds a co-speaker, an invitation email is sent. The link in
that email is meant to take a brand-new co-speaker to the **set-password** page
so they can create their portal account. Instead, for some co-speakers the link
lands on the **login** page (the "Speaker" login), where they have no password
and cannot get in — a dead end.

This was the exact behaviour explicitly deferred by the previous change
(MAIN-13323, "co-speaker Add button affordance"), under *Out of Scope*: "The
co-speaker invitation email link behaviour (set-password vs. login landing).
Explicitly deferred per stakeholder." This change closes that gap.

## Root Cause

The invite link is built in `send_cospeaker_invitation_email`
(`backend/app/core/email/__init__.py`):

```python
if setup_token:
    portal_url = f"{base_url}/{tenant_slug}/portal/set-password?token={setup_token}"
else:
    portal_url = f"{base_url}/{tenant_slug}/portal/invitations"
```

`/portal/invitations` is auth-gated, so a co-speaker with no password is bounced
to the login page. The link is only correct when a `setup_token` is supplied.

The caller, `_sync_cospeakers` in
`backend/app/api/v1/cfp_portal/papers/_helpers.py`, only ever obtains a
`setup_token` from `provision_cospeaker_applicant`, **and only when the
`CFPApplicant` does not already exist**:

```python
if applicant is None:
    applicant, setup_token = await provision_cospeaker_applicant(...)
elif applicant.id == current.applicant_id:
    raise ValidationError(...)
# else: setup_token stays None  ← bug
```

When a `CFPApplicant` row already exists for that email **but the linked
`PortalUser` has never set a password** (e.g. they were provisioned earlier as a
co-speaker on another paper, or registered but never finished setup), no setup
token is issued. The email then links to `/portal/invitations` → login → dead
end.

`provision_cospeaker_applicant` already gets this right for the PortalUser it
manages (new user → token; existing user without password → fresh token;
existing user with password → no token). The defect is purely that the
existing-applicant branch in `_sync_cospeakers` skips that decision entirely.

## Proposed Change

Make the setup-token decision depend on the linked **PortalUser's password
state**, not on whether the `CFPApplicant` row happened to already exist.

1. Add a small helper in
   `backend/app/core/portal_user_auto_creation.py`:

   ```python
   async def ensure_cospeaker_setup_token(db, applicant) -> str | None:
       """Issue a fresh setup token for an existing co-speaker applicant whose
       portal account has not set a password yet. Returns None when the account
       can already log in (has a password) or has no linked PortalUser."""
   ```

   It reuses the existing `_create_setup_token` and mirrors the
   existing-user-without-password branch of `provision_cospeaker_applicant`.

2. In `_sync_cospeakers`, when an existing applicant is being added as a **new**
   co-speaker record (i.e. an invite will actually be sent), compute the token
   via `ensure_cospeaker_setup_token` instead of leaving it `None`.

No change to the URL-building logic in `send_cospeaker_invitation_email` — once a
token is supplied it already builds the correct `set-password` URL.

## Out of Scope

- The paper-form co-speaker UX (Add button / unadded-input guard) — shipped in
  the prior MAIN-13323 change.
- The accept/decline invitation flow and the `/portal/invitations` page itself.
- Password-set token TTL, the SetPasswordPage UI, and login behaviour.
- Registration-attendee invite flow (`create_portal_user_for_registration`) —
  already correct.

## Affected Code

- `backend/app/core/portal_user_auto_creation.py` — new
  `ensure_cospeaker_setup_token` helper.
- `backend/app/api/v1/cfp_portal/papers/_helpers.py` — issue the token for
  existing passwordless co-speakers when sending the invite.
- Tests:
  - `backend/tests/cfp_portal/test_cfp_portal_papers_deep.py`
  - (optionally) `backend/tests/portal/` unit coverage for the new helper.

## Spec

No new/changed endpoint, request/response schema, or response code →
no OpenAPI regen.
