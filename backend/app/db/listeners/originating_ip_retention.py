"""GDPR data-minimization listener for ``originating_ip``.

The IP captured at public-registration time has fraud-detection value
during a brief window — between the form submission and either:

  - **Payment success** — no abuse possible past this point, the
    transaction is legitimate.
  - **Cancellation** — the row is already being cleaned up; no remaining
    purpose for the IP.

Once a registration enters either terminal state, the purpose ends and
the IP is removed. This is GDPR Art. 5(1)(c) (data minimization) +
Art. 5(1)(e) (storage limitation) applied via purpose-bound retention
rather than a fixed time window — simpler than a cron, no race
conditions, no config knobs.

The listener fires on every flush. It iterates both ``session.dirty``
(rows whose status was just flipped) and ``session.new`` (rows being
inserted with a terminal status, e.g. a Stripe-paid registration coming
in already at ``status=paid``). Idempotent: if ``originating_ip`` is
already None, the listener no-ops.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models.registration import Registration
from app.models.training_registration import TrainingRegistration

# Terminal statuses where the fraud-detection purpose has ended. Strings
# rather than enum lookups because Registration + TrainingRegistration
# store status as VARCHAR; the enum classes are just one source of the
# values.
_TERMINAL_STATUSES = frozenset({"paid", "cancelled"})


@event.listens_for(Session, "before_flush")
def _clear_originating_ip_on_terminal_status(
    session: Session,
    _flush_context: Any,
    _instances: Any,
) -> None:
    for obj in [*session.dirty, *session.new]:
        if not isinstance(obj, (Registration, TrainingRegistration)):
            continue
        status = getattr(obj, "status", None)
        if status in _TERMINAL_STATUSES and obj.originating_ip is not None:
            obj.originating_ip = None
