# MAIN-13421: Design

This change ships **documents and a decision**, not runtime code. The "design" is
the structure of those deliverables and the analysis that backs the recommendation.

## Deliverables

| File | Purpose |
|---|---|
| `docs/security/2026-06-crypto-audit.md` | The audit report (inventory + threat model + PQC exposure) |
| `docs/adr/0006-post-quantum-kem-evaluation.md` | The decision record (Kyber go / defer / no-go) |
| `.claude/docs/security.md` | Append a short "Post-quantum posture" subsection pointing at the audit + ADR |

No backend, frontend, migration, or OpenAPI changes. Steps 5–9 of the dev sweep
(mypy, ruff, tsc, eslint, pytest, vitest, `gen:api`) have nothing to run against and
are N/A for this change; this will be called out in `tasks.md`.

## Audit report outline (`docs/security/2026-06-crypto-audit.md`)

1. **Scope & method** — what was reviewed (application crypto + transport posture),
   what was not (infra penetration testing, third-party SaaS).
2. **Cryptographic inventory** — the table from `proposal.md`, with file/line
   citations:
   - `backend/app/core/security/__init__.py` — Argon2id `PasswordHasher`, JWT HS256.
   - `backend/app/core/security/portal.py`, `applicants.py` — portal/applicant JWTs.
   - `backend/app/config.py` — Fernet PII key handling, key-rotation list
     (`PII_ENCRYPTION_KEYS_OLD`).
   - `backend/app/core/security/mfa.py` — Fernet-wrapped TOTP secrets.
   - `requirements.txt` — `cryptography==48.0.1`, `argon2-cffi==25.1.0`,
     `PyJWT==2.13.0`, `passlib==1.7.4`.
3. **Threat model** — classical adversary vs. CRQC adversary; the "harvest now,
   decrypt later" timeline; which assets have a long confidentiality lifetime
   (PII at rest, data in transit).
4. **Quantum exposure analysis** — Shor (breaks RSA/ECC/DH key exchange) vs. Grover
   (quadratic speedup against symmetric/hash; mitigated by key-size margin). Conclude
   that application crypto is Grover-only and the real exposure is TLS key exchange.
5. **Findings & recommendations** — prioritized; feeds the ADR.

## ADR outline (`docs/adr/0006-post-quantum-kem-evaluation.md`)

Follow `docs/adr/0000-template.md` exactly (Status / Date / Deciders / Tags;
Context / Decision / Consequences / Alternatives / References). Mirrors the style of
`docs/adr/0002-jwt-hs256-over-rs256.md`.

- **Status:** `Proposed` until the user approves the direction, then `Accepted`.
- **Decision (recommended, pending review):** Defer in-application CRYSTALS-Kyber
  /ML-KEM adoption. SaaSConf performs no application-layer asymmetric key
  establishment, so a KEM has no insertion point in the codebase. Address PQC where
  the exposure actually is — the TLS handshake — via hybrid X25519 + ML-KEM-768 at
  the terminating proxy once supported, tracked as infra follow-up. Maintain the
  symmetric stack (Argon2id, AES via Fernet, HS256) which is quantum-resilient.
- **Consequences:**
  - *Positive:* no bespoke, error-prone KEM plumbing in app code; effort spent on
    the real exposure; written, citable posture for compliance/customers.
  - *Negative:* PQC for data-in-transit depends on infra/provider timelines, not us;
    revisit required when NIST guidance or proxy support changes.
  - *Neutral:* Fernet's AES-128 has a ~64-bit post-Grover margin — flagged for a
    future AES-256 migration decision, out of scope here.
- **Alternatives considered:**
  - *Adopt Kyber in application code now* — rejected: no asymmetric key-exchange to
    replace; adds attack surface and maintenance for no real gain.
  - *Do nothing / no written position* — rejected: leaves the "harvest now, decrypt
    later" question unanswered for audits and customers.

## Why no prototype

CRYSTALS-Kyber/ML-KEM belongs in the key-establishment layer. SaaSConf's
key-establishment is TLS, terminated outside the Python process. A Python-side Kyber
prototype would exercise a library (`liboqs` / `oqs-python`) against a use case the
application does not have, so it would not validate anything decision-relevant. If
the user wants a transport-layer proof-of-concept, that is an infra task against the
proxy, scoped separately.

## Edge cases / notes

- `cryptography==48.0.1` does **not** ship ML-KEM primitives today; confirm current
  status in the audit rather than assuming.
- If the audit uncovers a concrete weakness (e.g. an endpoint accepting `alg=none`,
  or a missing key-rotation path), record it as a finding and, if cheap and in
  scope, fix it under this change — otherwise file a follow-up.
