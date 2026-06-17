# Design — Co-speaker invite link → set-password

## The single source of truth: PortalUser.password_hash

Whether a co-speaker needs a set-password link is a property of their
**PortalUser**, not of the `CFPApplicant` row:

- No linked PortalUser → no token (nothing to set a password on here).
- PortalUser with `password_hash` → no token (they can log in normally).
- PortalUser without `password_hash` → fresh setup token (they never finished
  first-time setup).

`provision_cospeaker_applicant` already encodes exactly this for the
new/just-created path. `_sync_cospeakers` just fails to consult it on the
existing-applicant path. The fix re-uses the same rule rather than inventing a
second one.

## New helper

```python
# backend/app/core/portal_user_auto_creation.py
async def ensure_cospeaker_setup_token(
    db: AsyncSession, applicant: CFPApplicant
) -> str | None:
    """Return a fresh setup token for an existing co-speaker applicant whose
    portal account has not set a password yet; None if it can already log in."""
    if applicant.portal_user_id is None:
        return None
    portal_user = await db.get(PortalUser, applicant.portal_user_id)
    if portal_user is None or portal_user.password_hash:
        return None
    return await _create_setup_token(db, portal_user.id)
```

`_create_setup_token` (already present) writes a `PortalRefreshToken` with
`purpose="setup"` and a 7-day TTL and returns the raw token — identical to the
new-user path, so set-password validation already accepts it.

## Where the token is computed in `_sync_cospeakers`

The function has two loops:

1. **Resolve loop** — resolves each input email to a `CFPApplicant`,
   provisioning when missing. Today this is the only place `setup_token` is set
   (and only for `applicant is None`).
2. **Apply loop** — for each resolved applicant, either updates an existing
   co-speaker row's sort order (no email) or creates a **new** co-speaker row
   and schedules the invite email.

The token is only meaningful when an invite is actually sent — i.e. in the
*new co-speaker record* branch of the apply loop. Computing it there (rather
than in the resolve loop) avoids issuing throwaway tokens for applicants who are
already co-speakers on the paper and are only having their sort order updated.

```python
else:  # new co-speaker record → invite will be sent
    if setup_token is None:
        # Existing applicant: issue a token iff their portal account
        # has no password yet, so the link lands on set-password.
        setup_token = await ensure_cospeaker_setup_token(db, applicant)
    ...
    send_email_background(send_cospeaker_invitation_email, db, ..., setup_token=setup_token)
```

A freshly provisioned applicant already carries a non-None `setup_token` from
the resolve loop and is always a new co-speaker record, so its token flows
through unchanged — the `if setup_token is None` guard only kicks in for
pre-existing applicants.

## Why not build the URL differently instead

We could make `send_cospeaker_invitation_email` always link to set-password.
Rejected: a co-speaker who already has a password should land on
`/portal/invitations` after logging in, not be pushed through set-password.
Keeping the token as the switch preserves both flows; the bug is solely the
missing token, so that's all we fix.

## Risk / blast radius

- Backend-only; no API surface, schema, or migration.
- The change can only *add* a setup token where one was previously (wrongly)
  absent — it never removes a token from an account that has a password (the
  helper returns None in that case), and never changes the URL format.
- Existing tests for provisioning, status preservation, and remove-on-update are
  untouched in behaviour.

## Tests

- RED: existing applicant whose PortalUser has no password, added as co-speaker
  → `send_email_background` is called with a non-None `setup_token`.
- RED/guard: existing applicant *with* a password → `setup_token` is None.
- Existing `test_unknown_cospeaker_email_provisions_account` continues to assert
  a token is issued for brand-new emails (new PortalUser).
