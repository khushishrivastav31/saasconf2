# MAIN-13421: Security audit + post-quantum cryptography (Kyber) evaluation

## Problem

No formal security audit of SaaSConf's cryptographic stack has been conducted, and
no post-quantum key encapsulation mechanism (KEM) is implemented. CRYSTALS-Kyber
(standardized as **ML-KEM**, NIST FIPS 203) has been flagged as a candidate. The
"harvest now, decrypt later" threat means traffic captured today could be decrypted
once a cryptographically relevant quantum computer (CRQC) exists, so the platform
needs a documented position on PQC even if it adopts nothing immediately.

GitHub issue #324.

## Goal

This is an **audit + decision** change, not a feature change. Its deliverable is
documentation: a catalogue of the current cryptographic surface, an assessment of
quantum exposure, and an **Architecture Decision Record** recording a go / defer /
no-go decision on adopting CRYSTALS-Kyber in SaaSConf's stack.

## Current cryptographic surface (to be audited)

Inventory from the codebase as it stands today:

| Use | Mechanism | Type | Quantum exposure |
|---|---|---|---|
| Password hashing | Argon2id (`argon2-cffi`) | Symmetric KDF | Low — Grover only halves effective strength |
| Session / portal / applicant tokens | JWT **HS256** (`PyJWT`) | Symmetric MAC | Low — keyed hash, Grover-only |
| PII column encryption | Fernet (AES-128-CBC + HMAC) | Symmetric | Low — Grover-only; AES-128 → ~64-bit |
| MFA / TOTP secret at rest | Fernet | Symmetric | Low |
| Data in transit (TLS) | TLS key exchange (ECDHE / X25519) + RSA/ECDSA certs | **Asymmetric** | **High — broken by Shor's algorithm** |

The key finding to confirm in the audit: SaaSConf's **application-layer** crypto is
overwhelmingly *symmetric* (Argon2, HS256, Fernet/AES), which is quantum-resilient
with at most a key-size adjustment. The genuinely quantum-vulnerable surface —
asymmetric key establishment — lives at the **TLS / transport layer**, which is
terminated by infrastructure (reverse proxy / load balancer), not by Python code.

CRYSTALS-Kyber is a **KEM for key establishment**. There is no application-level
asymmetric key-exchange in SaaSConf for it to replace; its natural insertion point
is the TLS handshake at the edge.

## Proposed direction (for the user to confirm)

1. **Produce the audit document** — full crypto inventory, threat model, and PQC
   exposure assessment, checked into `docs/security/`.
2. **Record an ADR** under `docs/adr/` capturing the decision. The recommended
   decision, subject to review:
   - **Defer in-application Kyber adoption.** No Python-level KEM is warranted —
     the app has no asymmetric key-exchange to migrate, and rolling our own KEM
     plumbing adds risk without addressing the real exposure.
   - **Address PQC at the TLS edge instead**, via a hybrid X25519 + ML-KEM-768
     handshake once the terminating proxy / managed TLS provider supports it
     (tracked, not built here).
   - **Harden the symmetric surface now** where cheap: confirm AES-256-class
     margins and document the Grover analysis so the "harvest now, decrypt later"
     question has a written answer.
3. **No production code or schema changes in this change** beyond documentation,
   unless the audit surfaces a concrete weakness worth fixing in scope.

## Out of scope

- Implementing a Kyber/ML-KEM KEM in application code.
- Changing the TLS terminator configuration (infra-owned; tracked as follow-up).
- Re-keying or migrating existing Fernet-encrypted PII.

## Open questions for review

- Confirm the audit + ADR deliverable (vs. a heavier prototype) is the intended
  scope of MAIN-13421.
- Confirm where the audit report should live (`docs/security/` proposed).
- Confirm the decision direction above before the ADR is written as "Accepted".
