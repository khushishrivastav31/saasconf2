"""Database session management with RLS support."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

# SSL configuration for production database connections
connect_args = {}
if settings.DATABASE_SSL_REQUIRED:
    connect_args["ssl"] = True

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    connect_args=connect_args,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


@asynccontextmanager
async def get_db_with_rls(
    tenant_id: str | None = None, is_super_admin: bool = False
) -> AsyncGenerator[AsyncSession, None]:
    """
    Get a database session with RLS context set.

    Args:
        tenant_id: The tenant UUID to set in RLS context
        is_super_admin: Whether the user is a super admin (bypasses RLS)
    """
    async with async_session_maker() as session:
        try:
            # Set RLS context variables
            if tenant_id:
                await session.execute(
                    text("SELECT set_config('app.current_tenant_id', :tid, true)"), {"tid": str(tenant_id)}
                )
            await session.execute(
                text("SELECT set_config('app.is_super_admin', :sa, true)"), {"sa": str(is_super_admin).lower()}
            )
            yield session
        finally:
            await session.close()


async def set_rls_context(session: AsyncSession, tenant_id: str | None = None, is_super_admin: bool = False) -> None:
    """
    Set RLS context on an existing session.

    Args:
        session: The database session
        tenant_id: The tenant UUID to set in RLS context
        is_super_admin: Whether the user is a super admin
    """
    if tenant_id:
        await session.execute(text("SELECT set_config('app.current_tenant_id', :tid, true)"), {"tid": str(tenant_id)})
    await session.execute(
        text("SELECT set_config('app.is_super_admin', :sa, true)"), {"sa": str(is_super_admin).lower()}
    )
