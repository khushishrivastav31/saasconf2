"""Shared rate limiters configured with Redis storage.

Using Redis as the backing store is essential when running multiple backend
workers or pods: slowapi's default in-memory storage is per-process, which
effectively disables rate limiting under horizontal scaling.

Two limiters are exposed:

- ``limiter`` — per-client-IP. Use for unauthenticated endpoints (login,
  password reset, portal signup) where the only trustworthy identifier is
  the source IP.
- ``tenant_limiter`` — per-``tenant_id`` when authenticated, per-IP otherwise.
  Use for expensive authenticated work (exports, PDF generation, bulk
  writes) so that one noisy tenant does not exhaust the budget for peers
  sharing the same upstream proxy IP.

Both share the same Redis storage so their counters are coherent across
workers.
"""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

_settings = get_settings()


def _tenant_or_ip_key(request: Request) -> str:
    """Return ``<tenant_id>:<ip>`` for authenticated requests, else just IP.

    The key_func runs for each request. When the authenticated-user
    dependency has attached ``current_user`` to ``request.state`` (standard
    on endpoints using ``CurrentUserDep``/``TenantAdminDep``), we key on
    ``tenant_id:ip`` so one tenant cannot exhaust the budget for peers
    sitting behind the same corporate proxy. If the attribute is missing
    (unauthenticated or auth failed), we fall back to IP-only rather than
    raise — the caller is in an error state and would get a 401 anyway.
    """
    user = getattr(request.state, "current_user", None)
    tenant_id = getattr(user, "tenant_id", None) if user is not None else None
    ip = get_remote_address(request)
    if tenant_id is None:
        return ip
    return f"{tenant_id}:{ip}"


limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_settings.REDIS_URL,
)

tenant_limiter = Limiter(
    key_func=_tenant_or_ip_key,
    storage_uri=_settings.REDIS_URL,
)
