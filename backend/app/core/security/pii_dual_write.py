"""PII dual-write event listeners (audit step 37 phase c).

Keeps the ``*_encrypted`` and ``*_hash`` companion columns in sync with the
plaintext PII columns they shadow.  Registered as SQLAlchemy mapper
``before_insert`` and ``before_update`` listeners on the six models that own
the 13 PII columns identified in the audit.

Encryption is via :func:`app.core.security.pii_crypto.encrypt_pii` (Fernet).
Hashes are deterministic SHA-256 of a normalized value so consumers can look
rows up by plaintext (``hash_email`` lowercases + strips, ``hash_phone``
reduces to digits, ``hash_vat`` uppercases alphanumerics).

Gotchas
-------
* Bulk ``session.execute(update(...))`` bypasses ORM events. No call site
  currently bulk-updates plaintext PII; audit before phase (e) cutover.
* ``before_update`` skips rows whose plaintext attribute has not changed, so
  touching an unrelated field does not force a Fernet re-encryption (Fernet
  is non-deterministic — the ciphertext would change every write otherwise).
* If ``PII_ENCRYPTION_KEY`` is unset the first insert/update of any listed
  model raises :class:`PiiEncryptionNotConfigured` — intentional: plaintext
  and encrypted columns must stay coherent during the dual-write phase.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

from sqlalchemy import event, inspect
from sqlalchemy.orm import Mapper

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone, hash_vat
from app.models.customer import Customer
from app.models.invoice import Invoice
from app.models.portal_user import PortalUser
from app.models.registration import BillingProfile
from app.models.trainer import Trainer
from app.models.user import User

PiiKind = Literal["email", "phone", "vat"]

PII_COLUMN_SPEC: dict[type, Sequence[tuple[str, PiiKind]]] = {
    User: (("email", "email"),),
    PortalUser: (("email", "email"), ("phone", "phone")),
    Invoice: (("recipient_email", "email"), ("recipient_vat_number", "vat")),
    BillingProfile: (
        ("contact_email", "email"),
        ("contact_phone", "phone"),
        ("vat_number", "vat"),
    ),
    Trainer: (("email", "email"), ("phone", "phone")),
    Customer: (("email", "email"), ("phone", "phone"), ("vat_number", "vat")),
}


def _hash_for_kind(kind: PiiKind, value: str) -> str:
    if kind == "email":
        return hash_email(value)
    if kind == "phone":
        return hash_phone(value)
    return hash_vat(value)


def _sync_companion_columns(
    target: Any,
    spec: Sequence[tuple[str, PiiKind]],
    *,
    skip_unchanged: bool,
) -> None:
    state = inspect(target) if skip_unchanged else None
    for plaintext_attr, kind in spec:
        if skip_unchanged and state is not None:
            history = state.attrs[plaintext_attr].history
            if not history.has_changes():
                continue
        value = getattr(target, plaintext_attr, None)
        enc_attr = f"{plaintext_attr}_encrypted"
        hash_attr = f"{plaintext_attr}_hash"
        if value is None:
            setattr(target, enc_attr, None)
            setattr(target, hash_attr, None)
        else:
            setattr(target, enc_attr, encrypt_pii(value))
            setattr(target, hash_attr, _hash_for_kind(kind, value))


def _on_insert(mapper: Mapper[Any], connection: Any, target: Any) -> None:
    spec = PII_COLUMN_SPEC.get(type(target))
    if spec is None:
        return
    _sync_companion_columns(target, spec, skip_unchanged=False)


def _on_update(mapper: Mapper[Any], connection: Any, target: Any) -> None:
    spec = PII_COLUMN_SPEC.get(type(target))
    if spec is None:
        return
    _sync_companion_columns(target, spec, skip_unchanged=True)


_REGISTERED = False


def register_pii_dual_write_listeners() -> None:
    """Idempotently attach before_insert/before_update listeners to each model."""
    global _REGISTERED
    if _REGISTERED:
        return
    for model_class in PII_COLUMN_SPEC:
        event.listen(model_class, "before_insert", _on_insert)
        event.listen(model_class, "before_update", _on_update)
    _REGISTERED = True
