# Tasks — Resend verification email

## Phase 0 — Recon

- [ ] Find the existing user-verification email helper (likely in
      `app/core/email/users.py` or `auth.py`).
- [ ] Find the Pending Verifications page in the frontend.
- [ ] Confirm whether a similar resend endpoint already exists.

## Phase 1 — Backend endpoint

### RED
- [ ] Test: happy path returns 200 and triggers the email send.
- [ ] Test: 404 for unknown user / wrong tenant.
- [ ] Test: 409 for already-verified user.
- [ ] Test: rate limit kicks in after N requests.

### GREEN
- [ ] Implement `POST /admin/users/{user_id}/resend-verification`.

### REFACTOR
- [ ] Extract the token-rotation logic into a small helper if the
      handler grows past ~30 lines.

## Phase 2 — Frontend

### RED
- [ ] Test: clicking "Resend" calls the API and shows the success toast.

### GREEN
- [ ] Add the button + mutation to PendingVerifications.

## Phase 3 — Full sweep

- [ ] Backend full sweep.
- [ ] Frontend full sweep.
- [ ] Manual: create a user → don't verify → resend from admin → check
      MailHog → confirm new email arrived → click link → user verified.
