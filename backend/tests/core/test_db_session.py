"""Tests for database session lifecycle in app/db/session.py.

Regression coverage for the double-close bug:
  get_db() and get_db_with_rls() both wrapped the async_sessionmaker context
  manager AND called session.close() explicitly in a finally block. The
  context manager already calls close() in its __aexit__, so the explicit
  call fired first, leaving the context manager to close an already-closed
  session. Under load this raced into SQLAlchemy's IllegalStateChangeError.
"""

import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_get_db_does_not_explicitly_close_session() -> None:
    """get_db must not call session.close() — the context manager owns that."""
    mock_session = AsyncMock()
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.db.session.async_session_maker", return_value=mock_cm):
        from app.db.session import get_db

        gen = get_db()
        session = await gen.__anext__()
        assert session is mock_session
        await gen.aclose()

    mock_session.close.assert_not_called()


@pytest.mark.asyncio
async def test_get_db_with_rls_does_not_explicitly_close_session() -> None:
    """get_db_with_rls must not call session.close() — same reason as get_db."""
    mock_session = AsyncMock()
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.db.session.async_session_maker", return_value=mock_cm):
        from app.db.session import get_db_with_rls

        async with get_db_with_rls(tenant_id="test-tenant-id") as session:
            assert session is mock_session

    mock_session.close.assert_not_called()


@pytest.mark.asyncio
async def test_get_db_with_rls_sets_rls_context() -> None:
    """get_db_with_rls executes set_config for tenant_id and is_super_admin."""
    mock_session = AsyncMock()
    mock_cm = AsyncMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("app.db.session.async_session_maker", return_value=mock_cm):
        from app.db.session import get_db_with_rls

        async with get_db_with_rls(tenant_id="abc-123", is_super_admin=True):
            pass

    # Each execute call passes a TextClause as the first positional arg.
    # str(TextClause) returns the actual SQL text.
    sqls = [str(c.args[0]) for c in mock_session.execute.call_args_list if c.args]
    assert any("current_tenant_id" in s for s in sqls)
    assert any("is_super_admin" in s for s in sqls)
