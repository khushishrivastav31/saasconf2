# Tasks — Portal login "Forgot password" link

## Phase 0 — Recon

- [ ] Confirm `POST /portal/{slug}/unified/forgot-password` exists in
      `app/api/v1/portal_auth.py` and returns 200 on valid email.
- [ ] Confirm `POST /portal/{slug}/unified/reset-password` exists.
- [ ] Locate the forgot-password email template and check its reset URL.

## Phase 1 — Frontend link

### RED
- [ ] Test: portal `LoginPage` renders a "Forgot password?" link with
      href `/{companySlug}/portal/forgot-password`.

### GREEN
- [ ] Add the link.

## Phase 2 — Forgot-password page

### RED
- [ ] Test: submitting an email POSTs to the unified forgot-password
      endpoint and renders the confirmation message.

### GREEN
- [ ] Implement `ForgotPasswordPage.tsx`.
- [ ] Add the route in `App.tsx`.

## Phase 3 — Reset-password page

### RED
- [ ] Test: submitting a new password with a valid token POSTs to
      `/portal/{slug}/unified/reset-password` and redirects to the
      portal login.

### GREEN
- [ ] Implement `ResetPasswordPage.tsx`.
- [ ] Add the route in `App.tsx`.

## Phase 4 — Email template

- [ ] Check the forgot-password email template. If its reset link points
      at the admin reset page, change it to
      `/{tenantSlug}/portal/reset-password?token=...`.
- [ ] Add a backend test confirming the email's URL contains
      `/portal/reset-password`.

## Phase 5 — Full sweep

- [ ] Backend + frontend full sweep.
- [ ] Manual: forget password → check MailHog → click link → set new
      password → log in.
