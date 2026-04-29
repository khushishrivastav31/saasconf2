"""Shared fixtures for trainings tests.

Every trainings test file used to define its own copy of:

- ``_admin_token(user)`` — a 7-line helper that builds a JWT with the
  ``trainings`` module in the claims.
- A ``XX_tenant`` fixture (~6 lines) that creates a fresh tenant.
- A ``XX_admin`` fixture (~14 lines) that creates the trainings module,
  links it to the tenant, then creates a tenant-admin User.

Six trainings test files repeated those 27 lines verbatim with different
prefixes (``at_*``, ``tn_*``, ``pb_*``, ``so_*``, ``tt_*``, ``tm_*``).
This conftest collapses them into one source. Files that need a
non-default module set (e.g. ``test_training_broadcast.py`` enables
both ``trainings`` and ``cfp``) keep their own fixture; the helper
function takes a ``modules`` override so they can still share the
JWT-building code.
"""

import uuid

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole


def training_admin_token(user: User, modules: tuple[str, ...] = ("trainings",)) -> str:
    """Build a JWT for a tenant admin with the given modules in the claims.

    Defaults to the ``trainings`` module only — the most common case.
    Pass ``modules=("trainings", "cfp")`` (or similar) for tests that
    need cross-module access.
    """
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=list(modules),
    )


@pytest_asyncio.fixture
async def training_tenant(db_session: AsyncSession) -> Tenant:
    """Fresh tenant for a trainings test. Slug is randomized so multiple
    tests using this fixture in parallel don't collide on
    ``tenants.slug`` uniqueness."""
    t = Tenant(id=uuid.uuid4(), name="Training Tenant", slug=f"tr-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def training_other_tenant(db_session: AsyncSession) -> Tenant:
    """A second, distinct tenant — used to exercise cross-tenant
    isolation (RLS scoping, 404 boundaries, etc.). Slug is randomized so
    multiple tests using this fixture don't collide."""
    t = Tenant(id=uuid.uuid4(), name="Other Tenant", slug=f"other-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def training_admin(db_session: AsyncSession, training_tenant: Tenant) -> User:
    """Tenant admin with the ``trainings`` module enabled.

    Creates the module + ``TenantModule`` link + the admin User in one
    transaction so the resulting JWT (built via ``training_admin_token``)
    passes ``require_module("trainings")``.
    """
    mod = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="T", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=training_tenant.id, module_id=mod.id, is_enabled=True))
    u = User(
        id=uuid.uuid4(),
        tenant_id=training_tenant.id,
        email=f"tr-admin-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Training",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def training_non_admin(db_session: AsyncSession, training_tenant: Tenant) -> User:
    """Plain user (no admin role) on the same tenant — used to exercise
    403/authorization paths."""
    u = User(
        id=uuid.uuid4(),
        tenant_id=training_tenant.id,
        email=f"tr-user-{uuid.uuid4().hex[:8]}@example.com",
        first_name="Training",
        last_name="User",
        role=UserRole.USER.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u
