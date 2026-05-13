"""Coverage for the global ``unhandled_error_handler`` in ``app.main``.

Brandon's QA infra finding said the registration-portal / ZUGFeRD /
committee-member crashes showed up in the backend logs as nothing but
SQL queries and ROLLBACK — the actual Python exception was never logged.
We now log ``exc_info=exc`` so the full traceback ends up in the
structured log record, regardless of DEBUG mode.

This test builds a throwaway FastAPI app, attaches the same handler
to a route that deliberately raises, and asserts the captured
``LogRecord`` carries the exception info (``record.exc_info``).
Using a throwaway app avoids polluting the global ``app`` with a test
route and keeps the assertion isolated from the rest of the suite.
"""

import logging

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.main import unhandled_error_handler


class _Boom(Exception):
    """Sentinel exception used only by these tests."""


@pytest.mark.asyncio
async def test_unhandled_exception_log_record_carries_traceback(caplog: pytest.LogCaptureFixture) -> None:
    """A route that raises must produce a log record with ``exc_info`` set.

    Pre-fix, the catch-all handler logged ``"... : %s" % exc``, so the
    LogRecord had no ``exc_info`` attached — the structured log shipped
    a one-line message with no stack. Post-fix, ``exc_info=exc`` is
    passed, so the formatter can render the full traceback.
    """
    test_app = FastAPI()
    test_app.add_exception_handler(Exception, unhandled_error_handler)

    @test_app.get("/_boom")
    async def _boom_route() -> None:
        raise _Boom("registration portal crashed deep in resolve_tenant_and_conference")

    transport = ASGITransport(app=test_app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with caplog.at_level(logging.ERROR, logger="saasconf"):
            resp = await client.get("/_boom")
    assert resp.status_code == 500

    boom_records = [r for r in caplog.records if r.name == "saasconf" and "Unhandled exception" in r.message]
    assert boom_records, "no 'Unhandled exception' log record was emitted"
    record = boom_records[-1]

    # The whole point: exc_info must be populated so handlers can
    # render the traceback. exc_info is a (type, value, tb) tuple.
    assert record.exc_info is not None, "log record carried no exc_info — traceback was lost"
    exc_type, exc_value, _tb = record.exc_info
    assert exc_type is _Boom
    assert "registration portal crashed" in str(exc_value)
