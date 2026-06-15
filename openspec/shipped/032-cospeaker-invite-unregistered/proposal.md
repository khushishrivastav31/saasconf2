# Change 032 — Invite co-speakers directly (no prior registration required)

## Status
`planned` · Branch: `feat/cospeaker-invite-unregistered`

## Methodology
TDD — Red → Green → Refactor.

## Problem

When a speaker creates a paper in the **CFP applicant portal**
(`SubmitPaperPage` → `POST /portal/papers`), they can add up to 3 co-speakers
by email. Today the backend **requires every co-speaker email to already belong
to a registered applicant**:

```python
# backend/app/api/v1/cfp_portal/papers/_helpers.py — _sync_cospeakers
applicant = app_result.scalar_one_or_none()
if not applicant:
    raise ValidationError(f"No registered applicant found with email: {email}")
```

That single `ValidationError` **blocks the whole paper save** (create *and*
update). If the co-speaker has not registered yet, the main speaker cannot save
their paper — even as a draft — until the co-speaker independently creates an
account. The UI reflects this constraint: *"Co-speakers must be registered on
this platform. They will receive an invitation."*

This contradicts the behaviour of the legacy CFP system we are migrating from,
where the main speaker simply types the co-speaker's **first name + email**, the
paper saves immediately, and the co-speaker receives an invitation to set up
their account (set a password, fill in their details) and to confirm they are a
co-speaker on the paper. The invitation must be sent **right away** and must
**never block paper creation**.

## Proposed Change

Allow a main speaker to add a co-speaker by **first name + email**, whether or
not that person already has an account. Saving the paper must succeed
regardless; the invitation is fire-and-forget.

1. **Capture co-speaker name + email (not just email).** Change the portal
   create/update request from `cospeaker_emails: list[str]` to a structured
   list of `{ first_name, email }` objects (max 3). The frontend
   `SubmitPaperPage` gains a *First name* input next to the email input, and the
   help text changes to reflect that co-speakers do **not** need an account yet.

2. **Auto-provision an account for unknown emails instead of rejecting them.**
   In `_sync_cospeakers`, when an email does not resolve to an existing
   `CFPApplicant`:
   - Create a `CFPApplicant` (placeholder, login-disabled password) carrying the
     supplied `first_name` + email, linked to a `PortalUser`.
   - Reuse the existing setup-token machinery (`portal_user_auto_creation`
     pattern: `PortalRefreshToken(purpose="setup")`, 7-day TTL) so the invite
     can land on the portal **set-password** page.
   - Create the `CFPPaperCospeaker` row with status `pending` exactly as today.

   When the email **does** resolve to an existing applicant, behaviour is
   unchanged (link + invite, preserve existing invitation status).

3. **Never block the save.** Remove the hard `ValidationError` for unknown
   emails. Account creation runs inline in the same transaction (cheap, no
   network); the invitation email is dispatched via the existing
   `send_email_background(...)` fire-and-forget path, so email-delivery problems
   never surface as a 4xx on `POST /portal/papers`. Existing guards stay: max 3
   co-speakers, no self-add, de-dupe by email.

4. **Invitation tells the co-speaker who added them, and links to the right
   place.** The `CO_SPEAKER_INVITATION` email already includes *Main Speaker
   Name* and *Paper Title*. For a **newly provisioned** co-speaker the *Portal
   Link* becomes the **set-password** URL (account setup) instead of the
   `/portal/invitations` URL; existing-account co-speakers keep the invitations
   URL. The main speaker's email is added to the template context so the
   recipient can recognise the sender.

## Out of Scope

- Changing the accept/decline invitation flow (`InvitationsPage`,
  `/portal/invitations/*`) — unchanged. **Confirmed two-step onboarding:** a
  provisioned co-speaker lands on the existing `/portal/set-password` page, sets
  a password, then sees the existing pending invitation to accept/decline. We
  reuse both pages and the existing endpoints as-is — no new combined
  "accept + set password" screen and no new endpoints (deliberately deferred as
  future UX polish).
- Admin-side co-speaker management screens.
- Increasing the 3-co-speaker cap or adding last name / company / bio capture at
  invite time (the co-speaker fills those in after setting up their account).
- Any change to how the main speaker themselves registers.
- A DB migration — none is required (see design).

## Affected Code

- `backend/app/schemas/cfp_portal.py` — new `PortalCospeakerInput`
  (`first_name`, `email`); `cospeaker_emails` → `cospeakers` on
  `PortalPaperCreateRequest` / `PortalPaperUpdateRequest`.
- `backend/app/api/v1/cfp_portal/papers/_helpers.py` — `_sync_cospeakers`
  signature + auto-provision branch; callers in
  `papers/authored.py` (`create_paper`, `update_paper`).
- `backend/app/core/portal_user_auto_creation.py` — reuse, or a sibling helper
  for "provision applicant + portal user + setup token from name/email".
- `backend/app/core/email/__init__.py` + `templates.py` — pass set-password URL
  + main-speaker email into `send_cospeaker_invitation_email` /
  `build_cospeaker_context`.
- `frontend/src/pages/portal/SubmitPaperPage.tsx` (+ `PaperEditForm.tsx`) —
  first-name input, payload shape, help-text copy.
- `frontend/src/types/api.generated.ts` — regen after schema change.
- Tests: `backend/tests/cfp_portal/…` co-speaker sync tests;
  `frontend/src/pages/portal/__tests__/SubmitPaperPage.test.tsx`.

## Spec

See `openspec/specs/` once implementation lands.
