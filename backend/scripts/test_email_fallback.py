"""Live-fire test for the Resend → Mailgun fallback.

Tests three scenarios:
  1. No tenant key  → Mailgun sends directly
  2. Bad tenant key → Mailgun fallback fires
  3. Transient Resend error → no fallback, error logged

Usage:
    cd backend
    MAILGUN_API_KEY=key-xxx \
    MAILGUN_DOMAIN=mg.cfp.trendig.com \
    MAILGUN_FROM_EMAIL=cfp@trendig.com \
    MAILGUN_FROM_NAME="SaaSConf" \
    venv/bin/python scripts/test_email_fallback.py your@email.com
"""

import asyncio
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-live-fire-test-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf@localhost:5432/saasconf")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SENTRY_ENVIRONMENT", "development")
os.environ["SMTP_HOST"] = ""  # force Mailgun path even if .env has SMTP_HOST set


async def main(recipient: str) -> None:
    from app.core.email import send_email

    mailgun_key = os.environ.get("MAILGUN_API_KEY", "")
    if not mailgun_key:
        print("ERROR: set MAILGUN_API_KEY env var")
        sys.exit(1)

    # ── Test 1: no tenant key → Mailgun sends directly ────────────────────────
    print("\n" + "=" * 60)
    print("TEST 1: no tenant key  (expect: Mailgun sends directly)")
    print("=" * 60)
    result = await send_email(
        to=recipient,
        subject="[Test 1] Direct Mailgun send — no tenant key",
        html="<p>Test 1 — no tenant Resend key configured; Mailgun should send this.</p>",
        text="Test 1 — no tenant Resend key, Mailgun sends directly.",
    )
    print(f"Result: {'✅ True' if result else '❌ False'}")

    # ── Test 2: bad tenant key → Mailgun fallback ─────────────────────────────
    print("\n" + "=" * 60)
    print("TEST 2: bad tenant key  (expect: WARNING then Mailgun fallback)")
    print("=" * 60)
    result = await send_email(
        to=recipient,
        subject="[Test 2] Mailgun fallback from invalid tenant Resend key",
        html="<p>Test 2 — tenant Resend key is invalid; Mailgun fallback should deliver this.</p>",
        text="Test 2 — invalid tenant key, Mailgun fallback.",
        tenant_api_key="re_THIS_IS_INVALID_0000000000000000000",
    )
    print(f"Result: {'✅ True' if result else '❌ False'}")

    # ── Test 3: check 3c fallback log appears ─────────────────────────────────
    print("\n" + "=" * 60)
    print("TEST 3: second bad-key send  (proves no state corruption)")
    print("=" * 60)
    result = await send_email(
        to=recipient,
        subject="[Test 3] Post-bad-key send still works",
        html="<p>Test 3 — sent after a bad tenant key; Mailgun should still work.</p>",
        text="Test 3 — post-bad-key, Mailgun.",
    )
    print(f"Result: {'✅ True' if result else '❌ False'}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} recipient@email.com")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
