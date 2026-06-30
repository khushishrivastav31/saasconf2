"""Tests for RequestLoggingMiddleware (MAIN-13422).

Verifies that every request — authenticated or not, successful or failing —
produces exactly one structured INFO record on the `saasconf.access` logger.
"""

import logging
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


# ---------------------------------------------------------------------------
# Minimal client fixture — no DB needed for middleware-level tests.
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture()
async def plain_client():
    """AsyncClient wired to the app without DB override (health/public paths)."""
    from app.core.token_blacklist import close_redis, init_redis

    await init_redis()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await close_redis()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _access_records(caplog_records: list[logging.LogRecord]) -> list[logging.LogRecord]:
    return [r for r in caplog_records if r.name == "saasconf.access"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_emits_access_record(plain_client, caplog):
    """Every path is logged — /health is not special-cased."""
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        response = await plain_client.get("/health")

    assert response.status_code == 200
    records = _access_records(caplog.records)
    assert len(records) == 1, f"Expected 1 access record, got {len(records)}"
    r = records[0]
    assert r.levelno == logging.INFO
    assert r.method == "GET"
    assert r.path == "/health"
    assert r.status_code == 200
    assert isinstance(r.duration_ms, float)
    assert r.duration_ms >= 0


@pytest.mark.asyncio
async def test_access_record_has_all_required_fields(plain_client, caplog):
    """Authenticated-style request carries all required structured fields."""
    req_id = str(uuid.uuid4())
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        response = await plain_client.get(
            "/health",
            headers={"X-Request-ID": req_id, "User-Agent": "test-agent/1.0"},
        )

    assert response.status_code == 200
    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]

    # All fields must be present on the record
    for field in (
        "request_id", "method", "path", "route", "status_code",
        "duration_ms", "client_ip", "user_agent", "query_keys",
    ):
        assert hasattr(r, field), f"Missing field: {field}"

    # tenant_id / user_id must at least exist (None for unauthenticated)
    assert hasattr(r, "tenant_id")
    assert hasattr(r, "user_id")

    assert r.user_agent == "test-agent/1.0"
    assert r.query_keys == []


@pytest.mark.asyncio
async def test_request_id_matches_response_header(plain_client, caplog):
    """request_id in the log record matches the X-Request-ID response header."""
    req_id = str(uuid.uuid4())
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        response = await plain_client.get("/health", headers={"X-Request-ID": req_id})

    records = _access_records(caplog.records)
    assert len(records) == 1
    assert records[0].request_id == req_id
    assert response.headers["X-Request-ID"] == req_id


@pytest.mark.asyncio
async def test_unauthenticated_request_logs_none_for_user_fields(plain_client, caplog):
    """Public/unauthenticated requests log tenant_id and user_id as None."""
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        await plain_client.get("/health")

    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]
    assert r.tenant_id is None
    assert r.user_id is None


@pytest.mark.asyncio
async def test_query_keys_only_names_not_values(plain_client, caplog):
    """query_keys lists param names only — never values (tokens, secrets, etc.)."""
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        # Use /health/ready which accepts GET with no special auth
        response = await plain_client.get("/health?token=secret&foo=1&bar=2")

    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]

    assert sorted(r.query_keys) == ["bar", "foo", "token"]

    # Confirm that none of the values appear anywhere in the formatted message
    formatted = r.getMessage()
    assert "secret" not in formatted
    assert "1" not in formatted or r.path in formatted  # path "/health" won't contain secret values


@pytest.mark.asyncio
async def test_path_does_not_contain_query_string(plain_client, caplog):
    """path field is URL path only — never the query string."""
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        await plain_client.get("/health?password=hunter2&token=abc123")

    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]
    assert "?" not in r.path
    assert "password" not in r.path
    assert "hunter2" not in r.path
    assert "token" not in r.path
    assert "abc123" not in r.path


@pytest.mark.asyncio
async def test_raising_request_still_logs_500(caplog):
    """A request that raises still logs a record with status_code=500 and a duration."""
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from app.main import RequestLoggingMiddleware

    mini = FastAPI()
    mini.add_middleware(RequestLoggingMiddleware)

    @mini.get("/boom")
    async def _boom():
        raise RuntimeError("deliberate explosion")

    transport = ASGITransport(app=mini, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with caplog.at_level(logging.INFO, logger="saasconf.access"):
            response = await ac.get("/boom")

    assert response.status_code == 500
    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]
    assert r.status_code == 500
    assert isinstance(r.duration_ms, float)
    assert r.duration_ms >= 0


@pytest.mark.asyncio
async def test_query_keys_are_sorted(plain_client, caplog):
    """query_keys are returned sorted for deterministic comparison."""
    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        await plain_client.get("/health?zebra=1&alpha=2&middle=3")

    records = _access_records(caplog.records)
    assert len(records) == 1
    assert records[0].query_keys == ["alpha", "middle", "zebra"]


@pytest.mark.asyncio
async def test_authenticated_request_logs_user_fields(client, tenant_admin_user, tenant_admin_token, caplog):
    """Authenticated request populates tenant_id and user_id on the log record."""
    from tests.conftest import auth_headers

    with caplog.at_level(logging.INFO, logger="saasconf.access"):
        response = await client.get(
            "/api/v1/auth/me",
            headers=auth_headers(tenant_admin_token),
        )

    assert response.status_code == 200
    records = _access_records(caplog.records)
    assert len(records) == 1
    r = records[0]
    assert r.tenant_id == str(tenant_admin_user.tenant_id)
    assert r.user_id == str(tenant_admin_user.id)
