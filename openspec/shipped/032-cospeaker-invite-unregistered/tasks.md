# Tasks — Invite co-speakers directly (no prior registration required)

## Phase 0 — Recon (done during planning)

- [x] Locate the blocker: `_sync_cospeakers` raises
      `ValidationError("No registered applicant found …")` for unknown emails,
      failing `POST/PUT /portal/papers` (`cfp_portal/papers/_helpers.py`).
- [x] Confirm `cfp_paper_cospeakers` keys on `applicant_id` → an applicant must
      exist before the association; account provisioning required.
- [x] Confirm reuse targets: `portal_user_auto_creation.py` (setup token,
      `purpose="setup"`), `committee.py` (placeholder-password applicant),
      `send_cospeaker_invitation_email` / `build_cospeaker_context`.
- [x] Confirm no migration needed (all tables/columns/RLS already exist).
- [x] Confirm frontend entry points: `SubmitPaperPage.tsx`,
      `PaperEditForm.tsx`; request field `cospeaker_emails`.

## Phase 1 — Backend schema (request shape)

### RED
- [ ] Test: `POST /portal/papers` with
      `cospeakers: [{first_name, email}]` is accepted (replaces
      `cospeaker_emails`); old `cospeaker_emails` key no longer recognised.
- [ ] Test: empty `first_name` or malformed email → 422; >3 → 422.

### GREEN
- [ ] Add `PortalCospeakerInput { first_name, email }` to
      `schemas/cfp_portal.py`.
- [ ] Replace `cospeaker_emails` with
      `cospeakers: list[PortalCospeakerInput]` on `PortalPaperCreateRequest`
      (default empty, `max_length=3`) and `… | None` on the update request.

### REFACTOR
- [ ] Keep `max_length=3` and email normalisation defined once.

## Phase 2 — Backend provisioning helper

### RED
- [ ] Test `provision_cospeaker_applicant`: new email → creates `CFPApplicant`
      (placeholder pwd, given `first_name`) + `PortalUser` + returns a setup
      token; applicant linked via `portal_user_id`.
- [ ] Test idempotency: existing pwd-less `PortalUser` → reuse it, fresh setup
      token; existing applicant short-circuits (handled in `_sync_cospeakers`).

### GREEN
- [ ] Implement `provision_cospeaker_applicant(db, *, tenant_id, first_name,
      email) -> tuple[CFPApplicant, str | None]` reusing the
      `portal_user_auto_creation` setup-token logic and a placeholder
      `hash_password(secrets.token_urlsafe(32))`.

### REFACTOR
- [ ] Factor the shared "find-or-create portal user + setup token" so it is not
      duplicated between registration auto-creation and co-speaker provisioning.

## Phase 3 — Backend `_sync_cospeakers` (remove the blocker)

### RED
- [ ] Test: create paper with one **unknown-email** co-speaker → 200, paper
      persisted, `pending` association + provisioned applicant created, invite
      scheduled. (Currently fails with `ValidationError`.)
- [ ] Test: unknown email path still rejects self-email and >3.
- [ ] Test: known-email path unchanged (link + invite, status preserved).
- [ ] Test: invite URL = set-password for new account; `/portal/invitations`
      for existing account.

### GREEN
- [ ] Change `_sync_cospeakers` to take `list[PortalCospeakerInput]`.
- [ ] On not-found: call `provision_cospeaker_applicant`, create the `pending`
      association, send `send_cospeaker_invitation_email` with the setup token;
      **delete** the unknown-email `ValidationError`.
- [ ] Add self-email guard for the not-found branch (vs `current.applicant.email`).
- [ ] Update `create_paper` / `update_paper` callers to pass `data.cospeakers`.

### REFACTOR
- [ ] De-dupe by normalised email; one conference/tenant context load (as today).

## Phase 4 — Invitation email content

### RED
- [ ] Test: `build_cospeaker_context` includes `Main Speaker Email`; set-password
      link rendered when a setup token is supplied.

### GREEN
- [ ] Add optional `setup_token` (→ set-password URL) and `main_speaker_email`
      to `send_cospeaker_invitation_email` + `build_cospeaker_context`.
- [ ] Light copy update to the default `CO_SPEAKER_INVITATION` template
      (mention account setup + sender email); additive variables only.

### REFACTOR
- [ ] Ensure existing tenant-customised templates still render (new vars optional).

## Phase 5 — Frontend

### RED
- [ ] Vitest (`SubmitPaperPage.test.tsx`): adding a co-speaker requires
      first name + email; payload sends `cospeakers: [{first_name, email}]`;
      chip shows the name; help text no longer says "must be registered".

### GREEN
- [ ] `SubmitPaperPage.tsx`: add a *First name* input beside the email input;
      change state to `{ firstName, email }[]`; update `handleAddCospeaker`,
      chips, and the create/update payload to `cospeakers`.
- [ ] Mirror in `PaperEditForm.tsx`.
- [ ] Update help text, e.g. *"Co-speakers don't need an account yet — they'll
      get an email invitation to join and confirm."*

### REFACTOR
- [ ] Share the co-speaker input row/type if duplicated across the two forms.

## Phase 6 — Verify sweep (mandatory before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/cfp_portal/ tests/ -k cospeaker -v`
- [ ] `cd backend && venv/bin/python -m pytest tests/ -v` (full)
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] **OpenAPI drift**: schema changed → regen
      `JWT_SECRET_KEY=… SUPER_ADMIN_PASSWORD=… pnpm gen:api`, commit
      `api.generated.ts`, verify `pnpm gen:api:check` is clean.
- [ ] Handbook: update co-speaker wording in
      `frontend/src/pages/Handbook/sections/people.tsx`.

## Phase 7 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR with `--auto --squash`.
- [ ] After merge: move `openspec/changes/032-…` → `openspec/shipped/`.
