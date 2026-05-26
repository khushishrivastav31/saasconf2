"""Shared test fixtures for the SaaSConf backend test suite.

Uses a real PostgreSQL test database (saasconf_test). Per-test isolation
runs in **savepoint mode by default**: one outer transaction is opened
on a shared connection at fixture setup, both ``db_session`` and the
ASGI client's ``get_db`` override yield sessions bound to that same
connection (via a ContextVar), and teardown rolls the outer transaction
back so every change evaporates without touching disk.

A nested SAVEPOINT is opened around the test work, and an
``after_transaction_end`` listener restarts the savepoint whenever
in-test code commits — so seeds, single-cancel orchestrators, and other
``await db.commit()`` call sites still behave as if they committed,
without ending the outer transaction.

For tests that genuinely need TRUNCATE-style cross-transaction visibility
(e.g. exercising commit/rollback semantics directly), opt out with::

    @pytest.mark.legacy_truncate
"""

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator
from contextvars import ContextVar
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker, create_async_engine
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
# Mailgun vars must be non-empty so send_email reaches _send_via_mailgun
# (the actual HTTP call is intercepted by the _mock_resend_client fixture).
os.environ.setdefault("MAILGUN_API_KEY", "test-mailgun-key")
os.environ.setdefault("MAILGUN_DOMAIN", "mg.test.example.com")

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole


@pytest.fixture(autouse=True)
def _mock_resend_client(request):
    """Make email sending succeed in tests without real API keys.

    Mocks both paths:
    - _get_resend: used when a tenant Resend key is configured
    - _send_via_mailgun: used when no tenant key (or key is invalid)

    Tests marked with @pytest.mark.no_mock_email get the real implementations.
    """
    if request.node.get_closest_marker("no_mock_email"):
        yield
        return
    mock_resend = MagicMock()
    mock_resend.Emails.send.return_value = {"id": "test-email-id"}

    with (
        patch("app.core.email._get_resend", return_value=mock_resend),
        patch("app.core.email._send_via_mailgun", new_callable=AsyncMock),
    ):
        yield


# ── Test database engine ─────────────────────────────────────────────────
# NullPool prevents connection reuse across event loops, avoiding
# asyncpg "attached to a different loop" errors.
#
# Under pytest-xdist each worker is a separate process; without isolation
# they would TRUNCATE each other's data mid-test. We detect the worker id
# from ``PYTEST_XDIST_WORKER`` (set by xdist itself) and route each worker
# to its own dedicated database (``<base>_gw0``, ``_gw1``, …). Serial runs
# leave the URL untouched.
#
# DATABASE_URL override is done BEFORE any app import so
# ``settings.DATABASE_URL`` (cached) picks up the per-worker value.

_BASE_DATABASE_URL = os.environ["DATABASE_URL"]


def _derive_worker_database_url(base_url: str, worker_id: str) -> str:
    """Return ``base_url`` with ``_<worker_id>`` appended to the DB name."""
    # URL shape: ``postgresql+asyncpg://user:pass@host:port/dbname``
    scheme_and_host, _, dbname = base_url.rpartition("/")
    return f"{scheme_and_host}/{dbname}_{worker_id}"


_XDIST_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "").strip()
if _XDIST_WORKER:
    TEST_DATABASE_URL = _derive_worker_database_url(_BASE_DATABASE_URL, _XDIST_WORKER)
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
else:
    TEST_DATABASE_URL = _BASE_DATABASE_URL


def _admin_database_url(test_db_url: str) -> str:
    """Return the same server URL pointing at the ``postgres`` maintenance DB.

    Needed because ``CREATE DATABASE`` cannot run inside a transaction and
    cannot target the database you are currently connected to.
    """
    scheme_and_host, _, _ = test_db_url.rpartition("/")
    return f"{scheme_and_host}/postgres"


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


# ── Savepoint-isolation plumbing ─────────────────────────────────────────
#
# When a test opts into savepoint isolation (the default), ``db_session``
# stashes the test's connection in this ContextVar so the ASGI client's
# ``get_db`` override can bind its session to the same connection. Both
# parties see each other's changes within the outer transaction; rollback
# at teardown wipes the slate clean without TRUNCATE.

_test_connection: ContextVar[AsyncConnection | None] = ContextVar("_test_connection", default=None)


def _install_savepoint_restart(session: AsyncSession) -> None:
    """Restart the SAVEPOINT after every commit on this session.

    SQLAlchemy fires ``after_transaction_end`` when a transaction (top-level
    or savepoint) ends. We only re-open a savepoint when the just-ended
    transaction was the savepoint we control — its parent is the outer
    transaction (``not transaction._parent.nested``).
    """
    sync_session = session.sync_session

    @event.listens_for(sync_session, "after_transaction_end")
    def _restart(sess, transaction):
        if transaction.nested and not transaction._parent.nested:
            sess.begin_nested()


# ── Database lifecycle fixtures ──────────────────────────────────────────


async def _ensure_worker_database_exists() -> None:
    """Create the per-worker test database when running under xdist.

    No-op for the serial case (``PYTEST_XDIST_WORKER`` empty) — the existing
    ``saasconf_test`` DB is assumed to already exist (created by the local
    docker-compose setup or the CI postgres service).
    """
    if not _XDIST_WORKER:
        return
    _, _, dbname = TEST_DATABASE_URL.rpartition("/")
    admin_engine = create_async_engine(
        _admin_database_url(TEST_DATABASE_URL),
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
    )
    try:
        async with admin_engine.connect() as conn:
            exists = (await conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": dbname})).scalar()
            if not exists:
                # Quote the identifier manually since asyncpg/SQLAlchemy won't
                # parameterize DDL. ``dbname`` comes from our own URL derivation
                # above (worker id is ``gwN``), so it's safe to interpolate.
                await conn.execute(text(f'CREATE DATABASE "{dbname}"'))
    finally:
        await admin_engine.dispose()


async def _create_tables() -> None:
    await _ensure_worker_database_exists()
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
        await conn.run_sync(Base.metadata.create_all)


async def _drop_tables() -> None:
    """Drop all tables using raw SQL to handle circular FK dependencies."""
    async with test_engine.begin() as conn:
        # Get all table names from our metadata
        table_names = [f'"{t.name}"' for t in Base.metadata.tables.values()]
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


async def _truncate_all_tables() -> None:
    """Wipe every table — only used by the legacy_truncate opt-out path."""
    async with test_engine.begin() as conn:
        await conn.execute(RLS_BYPASS)
        table_names = ", ".join(f'"{t.name}"' for t in Base.metadata.tables.values())
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))


@pytest_asyncio.fixture()
async def _savepoint_connection(setup_database, request) -> AsyncGenerator[AsyncConnection | None, None]:
    """Open one connection + outer transaction shared by every fixture in this test.

    Both ``db_session`` and ``client`` depend on this fixture, so the
    connection exists for the test even when only one of them is requested.
    The connection is published via ``_test_connection`` ContextVar so the
    ASGI ``get_db`` override binds its session to the same outer transaction.

    Returns ``None`` and skips the connection setup when the test carries
    the ``legacy_truncate`` marker — the legacy path manages its own DB
    session lifetime via TRUNCATE+commit.
    """
    if request.node.get_closest_marker("legacy_truncate"):
        await _truncate_all_tables()
        try:
            yield None
        finally:
            # Truncate after as well so the rows committed by this legacy
            # test don't leak forward into the next (savepoint-mode) test
            # — the savepoint outer transaction would happily see them as
            # pre-existing data.
            await _truncate_all_tables()
        return

    async with test_engine.connect() as connection:
        outer_tx = await connection.begin()
        # RLS bypass is set on the connection so every session bound to it
        # inherits the GUC for the duration of the outer transaction.
        await connection.execute(RLS_BYPASS)
        token = _test_connection.set(connection)
        try:
            yield connection
        finally:
            _test_connection.reset(token)
            await outer_tx.rollback()


@pytest_asyncio.fixture()
async def db_session(_savepoint_connection) -> AsyncGenerator[AsyncSession, None]:
    """Provide a database session for seeding test data.

    Default: SAVEPOINT-per-test isolation. Binds to the shared connection
    opened by ``_savepoint_connection``; in-test ``await session.commit()``
    calls are auto-restarted as savepoints so the outer transaction stays
    open until rollback at teardown.

    Opt-out via ``@pytest.mark.legacy_truncate`` for tests that exercise
    commit/rollback semantics directly or need cross-transaction
    visibility that savepoints can't simulate.
    """
    if _savepoint_connection is None:
        # legacy_truncate path
        session = TestSessionLocal()
        await session.execute(RLS_BYPASS)
        try:
            yield session
        finally:
            await session.close()
        return

    bound_sessionmaker = async_sessionmaker(
        bind=_savepoint_connection,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
        join_transaction_mode="create_savepoint",
    )

    session = bound_sessionmaker()
    _install_savepoint_restart(session)
    try:
        yield session
    finally:
        await session.close()


# ── FastAPI client fixture ───────────────────────────────────────────────


@pytest_asyncio.fixture()
async def client(_savepoint_connection) -> AsyncGenerator[AsyncClient, None]:
    """Provide an httpx AsyncClient wired to the FastAPI app using the test DB.

    Depends on ``_savepoint_connection`` so the savepoint mechanism is
    armed even when the test does not also request ``db_session`` —
    otherwise the ASGI handler's audit/event writes would land on a fresh
    connection outside any outer transaction and leak into the next test.
    """

    async def _override_get_db():
        connection = _test_connection.get()
        if connection is not None:
            bound_sessionmaker = async_sessionmaker(
                bind=connection,
                class_=AsyncSession,
                expire_on_commit=False,
                autocommit=False,
                autoflush=False,
                join_transaction_mode="create_savepoint",
            )
            async with bound_sessionmaker() as session:
                _install_savepoint_restart(session)
                yield session
        else:
            # legacy_truncate path
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
