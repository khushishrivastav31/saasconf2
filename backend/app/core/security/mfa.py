"""TOTP multi-factor authentication helpers.

Secrets are encrypted at rest using Fernet (AES-128-CBC) derived from
``JWT_SECRET_KEY`` so no additional secret is needed.
"""

import base64
import hashlib
import secrets

import pyotp
from cryptography.fernet import Fernet

from app.config import get_settings

APP_NAME = "SaaSConf"


def _get_fernet() -> Fernet:
    """Derive a Fernet key from the JWT secret (deterministic, no extra env var)."""
    settings = get_settings()
    key_bytes = hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_secret(raw_secret: str) -> str:
    """Encrypt a TOTP secret for storage."""
    return _get_fernet().encrypt(raw_secret.encode()).decode()


def decrypt_secret(encrypted: str) -> str:
    """Decrypt a stored TOTP secret."""
    return _get_fernet().decrypt(encrypted.encode()).decode()


def generate_totp_secret() -> str:
    """Generate a new random TOTP secret (base32, 160 bits)."""
    return pyotp.random_base32()


def get_provisioning_uri(secret: str, email: str, issuer: str | None = None) -> str:
    """Return an ``otpauth://`` URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer or APP_NAME)


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code.  Allows +-1 window for clock skew."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_recovery_codes(count: int = 8) -> list[str]:
    """Generate *count* single-use recovery codes (12 hex chars each)."""
    return [secrets.token_hex(6) for _ in range(count)]


def hash_recovery_codes(codes: list[str]) -> str:
    """Store recovery codes as comma-separated SHA-256 hashes."""
    hashes = [hashlib.sha256(c.encode()).hexdigest() for c in codes]
    return ",".join(hashes)


def verify_recovery_code(code: str, stored_hashes: str) -> tuple[bool, str]:
    """Check *code* against stored hashes.  Returns (matched, remaining_hashes)."""
    code_hash = hashlib.sha256(code.strip().encode()).hexdigest()
    hashes = [h for h in stored_hashes.split(",") if h]
    if code_hash in hashes:
        hashes.remove(code_hash)
        return True, ",".join(hashes)
    return False, stored_hashes
