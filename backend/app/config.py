"""Application configuration with Pydantic Settings."""

import json
import os
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _parse_cors_origins() -> list[str]:
    """Parse CORS origins from environment or return sensible defaults."""
    raw = os.getenv("CORS_ORIGINS", "")
    if raw:
        # Support both JSON array and comma-separated string
        raw = raw.strip()
        if raw.startswith("["):
            return json.loads(raw)
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    # Development defaults
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3006",
        "http://127.0.0.1:3006",
    ]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    # Application
    APP_NAME: str = "SaaSConf"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Logging
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://localhost:5432/saasconf"  # No credentials in default
    DATABASE_SSL_REQUIRED: bool = False  # Set to True in production
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT Configuration
    JWT_SECRET_KEY: str  # No default — MUST be set via environment variable
    JWT_ALGORITHM: str = "HS256"
    # 60 min access tokens with 7-day rotating refresh tokens. The shorter
    # 15-minute window we used previously was incompatible with the E2E
    # suite (~25 min single-worker on CI): the access token expired
    # mid-suite, the first 401 triggered a refresh, refresh-token rotation
    # invalidated the original token in admin.json, and every subsequent
    # context loaded from the stale storageState got bounced to /login.
    # 60 min is industry-standard for SaaS; the rotating refresh token
    # remains the defense-in-depth against long-lived bearer-token theft.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # E2E test portal user — only seeded on staging when all three are set.
    # Empty in dev / prod so we don't accidentally create a stray test user.
    # Used by ``app.db.seed.seed_e2e_portal_user`` and consumed at deploy
    # time via the ``Seed platform data`` step in ``.github/workflows/staging.yml``.
    E2E_PORTAL_EMAIL: str = ""
    E2E_PORTAL_PASSWORD: str = ""
    E2E_PORTAL_TENANT_SLUG: str = ""

    # PII column encryption (Fernet key — generate with Fernet.generate_key())
    # Empty = encryption disabled (dev convenience; staging/prod must set it).
    # PII_ENCRYPTION_KEYS_OLD: comma-separated previous keys kept for read fallback
    # during rotation; see docs/secret-rotation.md.
    PII_ENCRYPTION_KEY: str = ""
    PII_ENCRYPTION_KEYS_OLD: str = ""

    # CORS — set CORS_ORIGINS env var for production (comma-separated or JSON array)
    CORS_ORIGINS: list[str] = _parse_cors_origins()

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 10

    # Rate Limiting
    # Login is defense-in-depth on top of per-email account lockout
    # (5 failed attempts → 15min lock). Staging overrides to "30/minute"
    # via env so Playwright E2E runs don't trip the limit.
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_API: str = "100/minute"

    # Bot protection on the three public registration endpoints (conference,
    # training, CFP applicant signup). One site/secret pair per project on the
    # reCAPTCHA Admin Console — leave empty in dev/test to skip validation.
    # Frontend uses VITE_RECAPTCHA_SITE_KEY (the public half).
    RECAPTCHA_SECRET_KEY: str = ""
    RECAPTCHA_SCORE_THRESHOLD: float = 0.5

    # Super Admin (initial setup)
    SUPER_ADMIN_EMAIL: str = "admin@saasconf.com"
    SUPER_ADMIN_PASSWORD: str  # No default — MUST be set via environment variable

    # Ops API key — used by cron jobs / ops endpoints. REQUIRED in staging/production.
    OPS_API_KEY: str = ""

    # Monitoring
    SENTRY_DSN: str = ""  # Leave empty to disable Sentry
    SENTRY_ENVIRONMENT: str = "development"

    # Email (Resend)
    RESEND_API_KEY: str = ""  # Leave empty to use console logging (development)
    RESEND_FROM_EMAIL: str = "noreply@sonrisa.ventures"
    RESEND_FROM_NAME: str = "SaaSConf"

    # Portal URL — used for email verification, password reset, and other portal links
    PORTAL_BASE_URL: str = "http://localhost:3002"

    # Admin frontend URL — used for conference dashboard links in team invitation emails
    FRONTEND_BASE_URL: str = "http://localhost:3000"

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        if self.JWT_SECRET_KEY in ("", "your-secret-key-change-in-production"):
            raise ValueError("JWT_SECRET_KEY must be set to a secure random value")
        if len(self.JWT_SECRET_KEY) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters")
        if len(self.SUPER_ADMIN_PASSWORD) < 8:
            raise ValueError("SUPER_ADMIN_PASSWORD must be at least 8 characters")
        # Validate PII encryption keys if set (Fernet key = 44-char urlsafe base64).
        if self.PII_ENCRYPTION_KEY:
            _assert_valid_fernet_key(self.PII_ENCRYPTION_KEY, "PII_ENCRYPTION_KEY")
        for idx, key in enumerate(k.strip() for k in self.PII_ENCRYPTION_KEYS_OLD.split(",") if k.strip()):
            _assert_valid_fernet_key(key, f"PII_ENCRYPTION_KEYS_OLD[{idx}]")
        # Production (and staging, which mirrors it) refuses to boot without a
        # key: phase-e read cutover means hash lookups, and new writes need to
        # encrypt. A missing key silently breaks login + creates unreadable data.
        if self.SENTRY_ENVIRONMENT.lower() in ("production", "staging") and not self.PII_ENCRYPTION_KEY:
            raise ValueError(
                f"PII_ENCRYPTION_KEY must be set in {self.SENTRY_ENVIRONMENT} — "
                "login (hash lookup) and PII writes depend on it. See "
                "docs/runbooks/pii-encryption-key-management.md."
            )
        return self


def _assert_valid_fernet_key(key: str, label: str) -> None:
    from cryptography.fernet import Fernet  # local import keeps module import light

    try:
        Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{label} is not a valid Fernet key: {exc}") from exc


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()  # type: ignore[call-arg]
