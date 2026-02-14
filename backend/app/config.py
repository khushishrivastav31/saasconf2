"""Application configuration with Pydantic Settings."""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "SaaSConf"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://localhost:5432/saasconf"  # No credentials in default

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # JWT Configuration
    JWT_SECRET_KEY: str  # No default — MUST be set via environment variable
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3002", "http://127.0.0.1:3002", "http://localhost:3006", "http://127.0.0.1:3006"]

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 10

    # Rate Limiting
    RATE_LIMIT_LOGIN: str = "5/minute"
    RATE_LIMIT_API: str = "100/minute"

    # Super Admin (initial setup)
    SUPER_ADMIN_EMAIL: str = "admin@saasconf.com"
    SUPER_ADMIN_PASSWORD: str  # No default — MUST be set via environment variable

    # Monitoring
    SENTRY_DSN: str = ""  # Leave empty to disable Sentry
    SENTRY_ENVIRONMENT: str = "development"

    # Email (Resend)
    RESEND_API_KEY: str = ""  # Leave empty to use console logging (development)
    RESEND_FROM_EMAIL: str = "noreply@sonrisa.ventures"
    RESEND_FROM_NAME: str = "SaaSConf"

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        if self.JWT_SECRET_KEY in ("", "your-secret-key-change-in-production"):
            raise ValueError("JWT_SECRET_KEY must be set to a secure random value")
        if len(self.JWT_SECRET_KEY) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters")
        if len(self.SUPER_ADMIN_PASSWORD) < 10:
            raise ValueError("SUPER_ADMIN_PASSWORD must be at least 10 characters")
        return self

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
