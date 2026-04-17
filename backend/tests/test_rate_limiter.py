"""Unit tests for the tenant-aware rate limiter key function.

The key-generation logic lives in ``app.core.rate_limiter._tenant_or_ip_key``
and is the one piece of bespoke code in that module. Exercising it directly
avoids needing a real Redis backend and gives a clean regression net for the
per-tenant behaviour: two tenants sharing one upstream proxy IP must not
share a rate-limit budget.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.core.rate_limiter import _tenant_or_ip_key


def _fake_request(state_obj: object | None = None) -> SimpleNamespace:
    state = state_obj if state_obj is not None else SimpleNamespace()
    return SimpleNamespace(state=state)


def test_key_falls_back_to_ip_when_no_current_user() -> None:
    req = _fake_request()
    with patch("app.core.rate_limiter.get_remote_address", return_value="203.0.113.5"):
        assert _tenant_or_ip_key(req) == "203.0.113.5"


def test_key_falls_back_to_ip_when_current_user_is_none() -> None:
    req = _fake_request(SimpleNamespace(current_user=None))
    with patch("app.core.rate_limiter.get_remote_address", return_value="203.0.113.5"):
        assert _tenant_or_ip_key(req) == "203.0.113.5"


def test_key_falls_back_to_ip_when_tenant_id_missing() -> None:
    user = SimpleNamespace(tenant_id=None)
    req = _fake_request(SimpleNamespace(current_user=user))
    with patch("app.core.rate_limiter.get_remote_address", return_value="203.0.113.5"):
        assert _tenant_or_ip_key(req) == "203.0.113.5"


def test_key_combines_tenant_and_ip_when_authenticated() -> None:
    tenant_id = uuid4()
    user = SimpleNamespace(tenant_id=tenant_id)
    req = _fake_request(SimpleNamespace(current_user=user))
    with patch("app.core.rate_limiter.get_remote_address", return_value="203.0.113.5"):
        assert _tenant_or_ip_key(req) == f"{tenant_id}:203.0.113.5"


def test_two_tenants_behind_same_ip_do_not_share_budget() -> None:
    t1, t2 = uuid4(), uuid4()
    req1 = _fake_request(SimpleNamespace(current_user=SimpleNamespace(tenant_id=t1)))
    req2 = _fake_request(SimpleNamespace(current_user=SimpleNamespace(tenant_id=t2)))
    with patch("app.core.rate_limiter.get_remote_address", return_value="198.51.100.7"):
        assert _tenant_or_ip_key(req1) != _tenant_or_ip_key(req2)
