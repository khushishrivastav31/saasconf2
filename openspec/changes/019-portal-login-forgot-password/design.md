# Design — Portal login "Forgot password" link

## Backend (already exists)

- `POST /portal/{tenant_slug}/unified/forgot-password` — issues a
  reset token, no purpose field (1-hour TTL).
- `POST /portal/{tenant_slug}/unified/reset-password` — accepts the
  token + new password, sets `password_hash`.

Verify the email template used. If it currently points at the admin
reset URL, switch it to `/{tenantSlug}/portal/reset-password?token=...`.

## Frontend

### 1. Add link to LoginPage

In `frontend/src/pages/portal/LoginPage.tsx`, below the password field:

```tsx
<Link
  to={`/${companySlug}/portal/forgot-password`}
  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
>
  Forgot password?
</Link>
```

### 2. New `ForgotPasswordPage.tsx`

Single email input. On submit:

```tsx
await portalApi.post(`/portal/${companySlug}/unified/forgot-password`, {
  email,
});
setSubmitted(true);
```

Then render: "If an account exists for that email, a reset link has
been sent. Check your inbox." (Don't disclose whether the email exists.)

### 3. New `ResetPasswordPage.tsx`

Mirror of `SetPasswordPage.tsx`. Takes `token` from query params,
collects new password + confirm, POSTs to `unified/reset-password`. On
success, redirects to `/{companySlug}/portal/user/login` with a success
toast.

### 4. Routes in App.tsx

```tsx
<Route path=":companySlug/portal/forgot-password" element={<PortalForgotPasswordPage />} />
<Route path=":companySlug/portal/reset-password" element={<PortalResetPasswordPage />} />
```

## Test Impact

| File | Change |
|------|--------|
| `LoginPage.test.tsx` | "Forgot password?" link rendered with correct href |
| `ForgotPasswordPage.test.tsx` (new) | Submits email → shows confirmation message |
| `ResetPasswordPage.test.tsx` (new) | Submits new password with token → redirects to login |
| Backend test | `POST /portal/{slug}/unified/forgot-password` issues a reset token (verify existing) |
