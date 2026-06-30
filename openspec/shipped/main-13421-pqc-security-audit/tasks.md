# MAIN-13421: Tasks

> Audit + decision change. Deliverables are documents — no runtime code, schema, or
> API changes. The standard dev sweep (mypy/ruff/tsc/eslint/pytest/vitest/`gen:api`)
> has nothing to run against here and is **N/A**.

## Audit

- [ ] Walk the cryptographic surface and confirm the inventory table against source:
  - [ ] Argon2id + JWT HS256 in `backend/app/core/security/__init__.py`
  - [ ] Portal / applicant JWTs in `portal.py`, `applicants.py`
  - [ ] Fernet PII encryption + key rotation in `backend/app/config.py`
  - [ ] Fernet TOTP secrets in `backend/app/core/security/mfa.py`
  - [ ] Pin versions from `requirements.txt` (`cryptography`, `argon2-cffi`, `PyJWT`)
- [ ] Confirm `JWT_ALGORITHM` default and that `alg` is pinned on decode (no `alg=none`)
- [ ] Confirm `cryptography==48.0.1` ML-KEM support status (expected: not available)
- [ ] Write `docs/security/2026-06-crypto-audit.md` (inventory, threat model, quantum
      exposure analysis, prioritized findings)

## Decision (ADR)

- [ ] Write `docs/adr/0006-post-quantum-kem-evaluation.md` from `0000-template.md`,
      Status `Proposed`
- [ ] Capture decision, consequences, and alternatives per `design.md`
- [ ] Flip Status to `Accepted` (+ Deciders) **only after** the user confirms the
      direction

## Cross-references

- [ ] Append a "Post-quantum posture" subsection to `.claude/docs/security.md`
      linking the audit report and ADR
- [ ] If the audit surfaces a concrete in-scope weakness, fix it here (with a RED/GREEN
      test) or file a follow-up ticket — note which in the audit findings

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval of scope
      and decision direction before producing the audit, ADR, or any code.**
