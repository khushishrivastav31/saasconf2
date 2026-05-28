# Design — Resend verification email

## Backend

### New endpoint

`POST /admin/users/{user_id}/resend-verification`

- Auth: `TenantAdminDep` (must be admin of the same tenant as `user_id`).
- Body: empty.
- Behaviour:
  1. Look up the user; 404 if not found or different tenant.
  2. Reject (409) if user is already verified (`email_verified_at`
     is set).
  3. Invalidate any unused verification tokens for this user.
  4. Generate a fresh token (reuse `generate_email_verification_token()`).
  5. Persist the new token.
  6. Call the existing `send_user_invitation_email()` (or equivalent
     verification-email helper) with the new token.
  7. Return `{ "message": "Verification email resent." }`.

### Rate limit

Apply the existing `RATE_LIMIT_LOGIN`-style limiter to prevent abuse
(e.g. 3 resends per user per hour).

## Frontend

In the Pending Verifications page (search for `PendingVerifications.tsx`):

```tsx
<Button
  size="sm"
  onClick={() => resendMutation.mutate({ userId: u.id })}
  disabled={resendMutation.isPending}
>
  Resend
</Button>
```

```tsx
const resendMutation = useMutation({
  mutationFn: async ({ userId }: { userId: string }) =>
    api.post(`/admin/users/${userId}/resend-verification`),
  onSuccess: () => showToast({ message: 'Verification email resent.' }),
  onError: () => showToast({ message: 'Could not resend.', variant: 'error' }),
});
```

## Test Impact

| File | Change |
|------|--------|
| `tests/admin/test_resend_verification.py` (new) | Happy path, 404, 409 already verified, rate limit |
| `PendingVerifications.test.tsx` (new or extend) | Resend button + success toast |
