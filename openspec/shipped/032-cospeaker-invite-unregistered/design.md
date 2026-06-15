# Design — Invite co-speakers directly (no prior registration required)

## Current flow (what we're changing)

```
SubmitPaperPage  ──cospeaker_emails: string[]──▶  POST /portal/papers
                                                          │
                                          create_paper / update_paper
                                                          │
                                                  _sync_cospeakers()
                                                          │
                         for each email: lookup CFPApplicant by email_hash
                                                          │
                              ┌───────────────────────────┴───────────┐
                       found ▼                                 not found ▼
              create CFPPaperCospeaker(pending)          raise ValidationError  ← BLOCKS SAVE
              send_cospeaker_invitation_email (bg)
```

The only thing standing between today and the desired behaviour is the
`not found → raise` branch. Everything else (pending association, background
email, the accept/decline portal flow) already exists and stays.

## Target flow

```
SubmitPaperPage  ──cospeakers: {first_name, email}[]──▶  POST /portal/papers
                                                          │
                                                  _sync_cospeakers()
                                                          │
                         for each {first_name, email}: lookup CFPApplicant
                                                          │
              ┌───────────────────────────────────────────┴───────────────┐
       found ▼                                                  not found ▼
  CFPPaperCospeaker(pending)                       provision_cospeaker_applicant():
  invite → /portal/invitations                       • CFPApplicant(placeholder pwd, first_name)
                                                      • PortalUser (find-or-create) + setup token
                                                      • CFPPaperCospeaker(pending)
                                                   invite → /portal/set-password?token=…
  (both branches: send_cospeaker_invitation_email via background task — non-blocking)
```

Save always commits. Email always goes out via the existing fire-and-forget
background sender.

## Key decisions

### 1. Request schema: structured co-speaker, not bare email

`cospeaker_emails: list[EmailStr]` → `cospeakers: list[PortalCospeakerInput]`
where:

```python
class PortalCospeakerInput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    first_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
```

`PortalPaperCreateRequest.cospeakers: list[PortalCospeakerInput] =
Field(default_factory=list, max_length=3)` and the update variant
`list[...] | None`. We need the first name to create a usable placeholder
account and to address the invitation email.

**Breaking change** to the request body → regenerate
`frontend/src/types/api.generated.ts` and update the frontend payload in the
same PR.

> **Decision (confirmed):** clean rename — `cospeaker_emails` is **removed**,
> not dual-accepted. This is an internal portal API with a single first-party
> consumer, so we do not keep a backward-compat alias. (If an external consumer
> ever appears, `cospeaker_emails` can be re-added later as a deprecated alias —
> explicitly out of scope here.)

### 2. Provisioning an unregistered co-speaker — reuse existing patterns

We do **not** invent new tables. The `cfp_paper_cospeakers` association already
keys on `(paper_id, applicant_id)`, so a `CFPApplicant` must exist before we can
record the co-speaker. Two existing patterns combine:

- **`CFPApplicant` creation** mirrors `committee.py` (invite-an-unregistered
  applicant): set `first_name`, `email`; `password_hash` is **non-nullable**, so
  set an **unusable placeholder** — `hash_password(secrets.token_urlsafe(32))`.
  The applicant cannot log in via this hash; login happens through the linked
  `PortalUser` after they set a password.
- **`PortalUser` + setup token** mirrors `portal_user_auto_creation.py`:
  find-or-create the `PortalUser` by `(tenant_id, email_hash)`, link
  `CFPApplicant.portal_user_id`, and (only when the user has no password yet)
  emit `PortalRefreshToken(purpose="setup")` with a 7-day TTL. The raw token
  drives the set-password link.

Proposed home: a new helper
`provision_cospeaker_applicant(db, *, tenant_id, first_name, email) ->
tuple[CFPApplicant, str | None]` returning the applicant and an optional raw
setup token (None when an active account already exists). Placing it next to the
existing auto-creation helpers keeps the "create portal identity" logic in one
area. `_sync_cospeakers` calls it only on the not-found branch.

Idempotency matrix (per email):

| applicant exists? | portal_user has pwd? | action |
|---|---|---|
| yes | — | link existing applicant, invite → `/portal/invitations` (today's behaviour) |
| no  | n/a (new user)        | create applicant + portal_user + setup token, invite → set-password |
| no  | existing pwd-less user | create applicant, link existing portal_user, fresh setup token, invite → set-password |

### 3. Non-blocking guarantee

- **Validation that remains (still 4xx, still legitimate):** > 3 co-speakers,
  adding yourself, malformed email (Pydantic `EmailStr`), empty first name.
  These are user-input errors the speaker can fix, not "co-speaker doesn't exist
  yet" — so they correctly block.
- **Removed:** the unknown-email rejection.
- **Email dispatch** stays on `send_email_background(...)`, which schedules the
  send outside the request/response cycle. A disabled-email conference or a
  Resend outage cannot fail the save (the email function already returns `False`
  / logs rather than raising).
- Account provisioning is pure DB work inside the existing transaction — no
  added network latency on the save path.

### 4. Invitation email content & destination

`build_cospeaker_context` already supplies *First Name*, *Paper Title*,
*Conference Name*, *Main Speaker Name*, *Portal Link*, *Support Email*. Two
additions:

- **Portal Link** is computed by the caller: for a freshly provisioned
  co-speaker it is `{base}/{tenant_slug}/portal/set-password?token={raw_token}`;
  for an existing account it stays `{base}/{tenant_slug}/portal/invitations`.
  `send_cospeaker_invitation_email` gains an optional `setup_token` (or
  `portal_link_override`) parameter; when present it builds the set-password URL.

> **Decision (confirmed): two-step flow — the simplest path that works.** A
> newly provisioned co-speaker clicks the email link → lands on the **existing**
> `/portal/set-password` page → sets a password → logs in → sees the **existing**
> `/portal/invitations` page with the pending invitation to accept/decline. We
> reuse both pages and the existing accept/decline endpoints **as-is** — no new
> combined "accept + set password" screen, no new endpoints, no extra UI. This
> is the lowest-risk, least-code option and it fully delivers the behaviour
> (paper saved immediately, invite sent right away, co-speaker onboards
> themselves). A single combined screen is a deliberate non-goal here; it can be
> a later UX polish.
- **Main Speaker Email** added to the context so the recipient can recognise who
  invited them (the task explicitly calls this out: *"let the co-speaker know
  that this speaker (name and email) is creating a paper"*). Default-empty to
  keep existing template renders valid.

The default `CO_SPEAKER_INVITATION` template body
(`api/v1/settings/email_templates.py`) gets a light copy update to mention
account setup and surface the main speaker's email; existing tenant-customised
templates keep working because the new variable is additive.

### 5. No migration

`cfp_applicants`, `portal_users`, `portal_refresh_tokens`,
`cfp_paper_cospeakers` all already exist with the columns we need
(`portal_refresh_tokens.purpose` is already used by
`portal_user_auto_creation`). RLS policies on these tables are already in place.
So this change is code-only — **no Alembic migration**.

## Risks & mitigations

- **Duplicate `PortalUser` on race** — guarded by the existing unique index
  `ix_portal_users_tenant_email_hash` + find-or-create; mirror the idempotent
  read-then-insert already in `portal_user_auto_creation`.
- **Placeholder password mistaken for a real one** — use a random, non-stored
  secret so the only login path is set-password; never expose the placeholder.
- **Co-speaker added then removed before responding** — `_sync_cospeakers`
  already deletes associations dropped from the list; the provisioned applicant
  account simply remains (harmless, and they may be re-invited). No orphan
  cleanup needed.
- **Self-add via a not-yet-registered email that is the speaker's own** — the
  existing `applicant.id == current.applicant_id` guard only catches the
  found-applicant case; add an email-equality guard against
  `current.applicant.email` for the not-found branch.

## Test plan (high level)

- Backend: create paper with one unknown-email co-speaker → 200, paper saved,
  `CFPApplicant` + `PortalUser` + `pending` association created, setup token
  issued, background invite scheduled.
- Backend: unknown email does **not** raise; known email path unchanged;
  self-email (unregistered) rejected; >3 rejected; duplicate de-duped.
- Backend: invitation URL is set-password for new account, invitations page for
  existing account.
- Frontend: first-name + email required to add a chip; payload uses
  `cospeakers: [{first_name, email}]`; help-text copy updated.
