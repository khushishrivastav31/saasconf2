"""Shared test fixtures for the SaaSConf backend test suite.

Uses a real PostgreSQL test database (saasconf_test) with per-test
table truncation for isolation.  Seed data is committed so the ASGI
client (which uses its own DB session) can see it.
"""

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# ── Override settings BEFORE importing any app code ──────────────────────
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test"
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("PII_ENCRYPTION_KEY", "d3SqaqrZBel50kd5H4KnoZNvwPcNFP8kozOQeuPh9Jg=")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ["RATELIMIT_ENABLED"] = "false"  # Disable rate limiting in tests
os.environ["TESTING"] = "true"  # Disable background email tasks in tests


@pytest.fixture(autouse=True)
def _mock_resend_client(request):
    """Provide a fake Resend client so send_email succeeds without an API key.

    Tests that need the real _get_resend (e.g. test_email.py) can opt out
    with @pytest.mark.no_mock_email.
    """
    if request.node.get_closest_marker("no_mock_email"):
        yield
        return
    mock_resend = MagicMock()
    mock_resend.Emails.send.return_value = {"id": "test-email-id"}
    with patch("app.core.email._get_resend", return_value=mock_resend):
        yield


from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole

# ── Test database engine ─────────────────────────────────────────────────
# NullPool prevents connection reuse across event loops, avoiding
# asyncpg "attached to a different loop" errors.

TEST_DATABASE_URL = os.environ["DATABASE_URL"]

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Helper SQL for bypassing RLS in test sessions
RLS_BYPASS = text("SELECT set_config('app.is_super_admin', 'true', true)")


# ── Database lifecycle fixtures ──────────────────────────────────────────


async def _create_tables() -> None:
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
        await conn.run_sync(Base.metadata.create_all)


async def _drop_tables() -> None:
    """Drop all tables using raw SQL to handle circular FK dependencies."""
    async with test_engine.begin() as conn:
        # Get all table names from our metadata
        table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
        if table_names:
            # Use CASCADE to handle circular dependencies (tenants <-> users)
            await conn.execute(text(f"DROP TABLE IF EXISTS {', '.join(table_names)} CASCADE"))
    await test_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create all tables at the start of the test session, drop at the end.

    This is a *synchronous* session-scoped fixture that uses asyncio.run()
    internally, so it avoids event-loop-scope mismatches with function-scoped
    async fixtures.
    """
    asyncio.run(_create_tables())
    yield
    asyncio.run(_drop_tables())


@pytest_asyncio.fixture()
async def db_session(setup_database) -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session for seeding test data.

    Data must be *committed* (not just flushed) so the ASGI client — which
    gets its own independent session — can see it.  All tables are truncated
    after each test for isolation.
    """
    # Truncate every table BEFORE the test for full isolation.
    # Running cleanup at the start (not end) avoids fixture teardown ordering
    # issues where a new test's fixtures are created before the previous
    # test's db_session cleanup runs (causing FK violations).
    async with test_engine.begin() as conn:
        await conn.execute(RLS_BYPASS)
        table_names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))

    session = TestSessionLocal()
    await session.execute(RLS_BYPASS)
    try:
        yield session
    finally:
        await session.close()


# ── FastAPI client fixture ───────────────────────────────────────────────


@pytest_asyncio.fixture()
async def client(setup_database) -> AsyncGenerator[AsyncClient, None]:
    """Provide an httpx AsyncClient wired to the FastAPI app using the test DB.

    Each ASGI request gets its own session from TestSessionLocal, so there is
    no asyncpg "another operation in progress" conflict with db_session.
    """

    async def _override_get_db():
        async with TestSessionLocal() as session:
            await session.execute(RLS_BYPASS)
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    # Initialize Redis for token blacklisting (ASGITransport doesn't trigger lifespan)
    from app.core.token_blacklist import close_redis, init_redis

    await init_redis()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    await close_redis()
    app.dependency_overrides.clear()


# ── Seed data fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def tenant(db_session: AsyncSession) -> Tenant:
    """Create and return a test tenant."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Test Corp",
        slug=f"test-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Create and return a test conference under the test tenant."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="TestConf 2026",
        abbreviation="TC26",
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def conferences_module(db_session: AsyncSession) -> Module:
    """Create the 'conferences' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Conferences",
        code="conferences",
        description="Conference management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_modules(db_session: AsyncSession, tenant: Tenant, conferences_module: Module) -> Tenant:
    """Associate the conferences module with the test tenant."""
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=conferences_module.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def super_admin_user(db_session: AsyncSession) -> User:
    """Create and return a super admin user (no tenant)."""
    u = User(
        id=uuid.uuid4(),
        email=f"superadmin-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Super",
        last_name="Admin",
        role=UserRole.SUPER_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def tenant_admin_user(db_session: AsyncSession, tenant: Tenant) -> User:
    """Create and return a tenant admin user."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Tenant",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def regular_user(db_session: AsyncSession, tenant: Tenant) -> User:
    """Create and return a regular user."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"user-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Regular",
        last_name="User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


# ── Auth helper fixtures ─────────────────────────────────────────────────


def _make_token(
    user: User,
    modules: list[str] | None = None,
    is_tenant_super_user: bool = False,
    tenant_roles: list[dict[str, str]] | None = None,
) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
        is_tenant_super_user=is_tenant_super_user,
        tenant_roles=tenant_roles,
    )


@pytest.fixture()
def super_admin_token(super_admin_user: User) -> str:
    """Return a valid access token for the super admin."""
    return _make_token(super_admin_user)


@pytest.fixture()
def tenant_admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin."""
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest.fixture()
def regular_user_token(regular_user: User) -> str:
    """Return a valid access token for the regular user."""
    return _make_token(regular_user, modules=["conferences"])


def auth_headers(token: str) -> dict[str, str]:
    """Return authorization headers for a token."""
    return {"Authorization": f"Bearer {token}"}


# ── Invoice test fixtures ─────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def invoice(db_session: AsyncSession, conference: Conference) -> Invoice:
    """Create and return a test invoice."""
    from datetime import date, timedelta

    today = date.today()
    inv = Invoice(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        invoice_number="INV-TEST-001",
        template_type="bank_transfer",
        status="draft",
        issue_date=today,
        due_date=today + timedelta(days=30),
        recipient_name="Test Company",
        recipient_email="billing@testcompany.com",
        recipient_address_line1="123 Test Street",
        recipient_city="Test City",
        recipient_postal_code="12345",
        recipient_country="DE",
        recipient_vat_number="DE123456789",
        subtotal=100.0,
        tax_rate=19.0,
        tax_amount=19.0,
        total=119.0,
        currency="EUR",
        is_active=True,
    )
    db_session.add(inv)
    await db_session.commit()
    await db_session.refresh(inv)
    return inv


@pytest_asyncio.fixture()
async def invoice_with_procurement_code(invoice: Invoice, db_session: AsyncSession) -> Invoice:
    """Invoice with procurement code."""
    invoice.procurement_code = "PO-2024-12345"
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice


@pytest_asyncio.fixture()
async def invoice_without_procurement_code(invoice: Invoice, db_session: AsyncSession) -> Invoice:
    """Invoice without procurement code."""
    invoice.procurement_code = None
    db_session.add(invoice)
    await db_session.commit()
    await db_session.refresh(invoice)
    return invoice
