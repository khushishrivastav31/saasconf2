"""Database session management with RLS support."""

from typing import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text

from app.config import get_settings

settings = get_settings()

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
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
                    text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'")
                )
            await session.execute(
                text(f"SET LOCAL app.is_super_admin = '{str(is_super_admin).lower()}'")
            )
            yield session
        finally:
            await session.close()


async def set_rls_context(
    session: AsyncSession, tenant_id: str | None = None, is_super_admin: bool = False
) -> None:
    """
    Set RLS context on an existing session.

    Args:
        session: The database session
        tenant_id: The tenant UUID to set in RLS context
        is_super_admin: Whether the user is a super admin
    """
    if tenant_id:
        await session.execute(
            text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'")
        )
    await session.execute(
        text(f"SET LOCAL app.is_super_admin = '{str(is_super_admin).lower()}'")
    )
