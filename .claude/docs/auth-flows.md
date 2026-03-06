# Authentication Flows

## User Invite Flow
Invite-based onboarding for new admin and team users. When created without a password, they receive an email with a link to set their own password.

- **Tenant creation** (`POST /tenants`): Super admin provides `admin_email` (required) and optionally `admin_password`. If no password: unusable hash + 7-day invite token + welcome email.
- **Team member creation** (`POST /users`): Email, name, role — no password field. Unusable hash + invite token + welcome email.
- **Invite token**: `generate_email_verification_token()` (256-bit entropy), SHA256 hash stored in `user_password_resets` table with 7-day expiry.
- **Resend invite**: `POST /users/{user_id}/resend-invite` — only for users with `last_login is None`.
- **Setup password page**: `/setup-password?token=...` — reuses `POST /auth/reset-password`.
- **Email template**: `TENANT_USER_WELCOME` with "Set up my password" button.
- **Per-tenant sender**: `noreply@{email_domain}` when configured.
- **Audit**: `USER_INVITE_SENT` logged on creation and resend.

## Admin Password Reset Flow
Token-based password reset. OWASP-compliant.

- **Forgot password**: `POST /auth/forgot-password` — rate limited 3/min, anti-enumeration (always returns success). Generates token (256-bit, SHA256 hash, 1h expiry). Invalidates previous tokens.
- **Reset password**: `POST /auth/reset-password` — rate limited 5/min. Validates token, enforces password complexity (min 8 chars, uppercase + lowercase + digit), updates hash (Argon2id). Invalidates other tokens + revokes all refresh tokens.
- **Model**: `UserPasswordReset` in `app/models/user_password_reset.py`. Migration: `102_user_password_resets`.
- **Frontend**: `/forgot-password` and `/reset-password?token=...` pages with dark mode.
- **Audit**: `USER_PASSWORD_RESET_REQUESTED` and `USER_PASSWORD_RESET_COMPLETED`.
