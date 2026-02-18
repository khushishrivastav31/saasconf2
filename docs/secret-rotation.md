# Secret Rotation Procedures

## Overview

This document describes procedures for rotating secrets used by SaaSConf. Follow these procedures when secrets are compromised, during scheduled rotations, or as part of security maintenance.

## JWT Secret Key Rotation

### Emergency Rotation (Immediate)

1. **Generate a new secret:**
   ```bash
   openssl rand -hex 64
   ```

2. **Update the environment:**
   ```bash
   # On the staging/production server
   cd /opt/saasconf/app/deploy/staging
   # Edit .env and update JWT_SECRET_KEY
   nano .env
   ```

3. **Restart the backend:**
   ```bash
   docker compose restart backend
   ```

4. **Impact:** All existing access tokens (15-min TTL) and refresh tokens (7-day TTL) are immediately invalidated. All users will need to log in again.

5. **Verify:** Check logs for authentication errors and monitor login rates.

### Planned Rotation (Dual-Key - Future Enhancement)

For zero-downtime rotation, implement dual-key support:
1. Add `JWT_SECRET_KEY_PREVIOUS` environment variable
2. Update `decode_token()` to try both keys
3. Deploy with both old and new keys
4. After the refresh token TTL (7 days), remove the old key

## Database Password Rotation

1. **Generate new password:**
   ```bash
   openssl rand -base64 32
   ```

2. **Update PostgreSQL:**
   ```sql
   ALTER USER saasconf WITH PASSWORD 'new-password-here';
   ```

3. **Update environment:**
   ```bash
   # Edit .env with new DB_PASSWORD
   nano .env
   ```

4. **Restart backend:**
   ```bash
   docker compose restart backend
   ```

5. **Verify:** Check backend logs for database connection success.

## Redis Password (If Enabled)

1. Update Redis configuration with `requirepass`
2. Update `REDIS_URL` in environment to include password
3. Restart both Redis and backend

## Resend API Key

1. Generate new API key in Resend dashboard
2. Update `RESEND_API_KEY` in environment
3. Restart backend
4. Revoke old key in Resend dashboard

## Sentry DSN

1. Create new DSN in Sentry project settings
2. Update `SENTRY_DSN` / `SENTRY_DSN_BACKEND` / `SENTRY_DSN_FRONTEND`
3. Rebuild and restart all services
4. Revoke old DSN in Sentry

## Super Admin Password

1. Update `SUPER_ADMIN_PASSWORD` in environment
2. The password is only used during initial seeding — for existing deployments, reset via database:
   ```python
   from app.core.security import hash_password
   # Update the user record directly
   ```

## Schedule

| Secret | Rotation Frequency | Notes |
|--------|-------------------|-------|
| JWT_SECRET_KEY | Every 90 days | Causes user re-login |
| DB_PASSWORD | Every 90 days | Brief downtime during rotation |
| RESEND_API_KEY | Every 180 days | No downtime |
| SENTRY_DSN | As needed | Rebuild required |

## Checklist After Any Rotation

- [ ] Old secret is no longer in use anywhere
- [ ] All services restarted successfully
- [ ] Health checks passing
- [ ] No authentication errors in logs (beyond expected re-login)
- [ ] Monitoring and alerting still functional
