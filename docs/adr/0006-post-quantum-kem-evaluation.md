# 0006. Post-quantum KEM evaluation: defer in-application CRYSTALS-Kyber adoption

- **Status:** Accepted
- **Date:** 2026-06-30
- **Deciders:** @josediaz
- **Tags:** security, cryptography, post-quantum

## Context

NIST finalized CRYSTALS-Kyber as ML-KEM (FIPS 203) in August 2024, making it the first standardized post-quantum key encapsulation mechanism. A security review (MAIN-13421) was commissioned to assess SaaSConf's quantum exposure and decide whether to adopt ML-KEM in the application stack.

The full audit is at `docs/security/2026-06-crypto-audit.md`. Key findings:

1. **Application-layer crypto is overwhelmingly symmetric.** Password hashing (Argon2id), session tokens (HS256 HMAC-SHA256), and PII column encryption (Fernet/AES-128) are all symmetric primitives. Grover's algorithm halves their effective bit-strength but does not break them; they remain computationally secure.

2. **The only quantum-vulnerable surface is TLS key exchange.** Shor's algorithm breaks ECDHE / X25519 (and RSA/ECDSA signatures). This surface is terminated by the Nginx reverse proxy / load balancer — outside application code. SaaSConf's Python layer performs no asymmetric key establishment.

3. **ML-KEM is a KEM for key establishment.** Without asymmetric key-exchange in the application, there is no insertion point for a KEM. Adding one would mean creating an application-layer key-establishment step that does not exist today.

4. **`cryptography==48.0.1` does not expose ML-KEM** as a first-class API. The `liboqs` / `oqs-python` path exists but is not in the standard wheel and would require adding an unvetted C extension.

At decision time SaaSConf targets a quantum-threat horizon of 10–20 years. The "harvest now, decrypt later" threat is real for long-lived PII (stored in Fernet-encrypted columns at rest and in transit over TLS), but the bottleneck is TLS — not the application layer.

## Decision

**Defer in-application CRYSTALS-Kyber / ML-KEM adoption.** SaaSConf performs no application-layer asymmetric key establishment, so a KEM has no natural insertion point in the Python codebase. Adding one would create a novel, application-level key-establishment mechanism with no precedent in the current architecture — adding complexity and attack surface without addressing the actual quantum exposure.

Address PQC where the exposure actually is: the TLS handshake at the terminating proxy. Once the reverse proxy or managed TLS provider supports a hybrid X25519 + ML-KEM-768 handshake (following NIST SP 800-56C Rev. 2 hybrid guidance), enable it there. Track this as an infrastructure follow-up item.

In the meantime, maintain the existing symmetric stack (Argon2id, HS256, Fernet/AES-128). Two lower-priority hardening items are logged for future consideration but are not required now:
- Evaluate AES-256-GCM for PII columns (Fernet's AES-128 has a ~64-bit post-Grover margin).
- Separate the TOTP encryption key from JWT_SECRET_KEY to reduce blast-radius on key compromise.

## Consequences

- **Positive:**
  - No bespoke, error-prone KEM plumbing in application code.
  - Effort is directed at the genuine exposure (TLS edge) rather than symmetric primitives that are already Grover-resilient.
  - A written, citable posture (`docs/security/2026-06-crypto-audit.md` + this ADR) answers compliance and customer PQC questions without shipping unproven primitives.
  - Zero risk of introducing new vulnerabilities from novel cryptographic code.
- **Negative:**
  - PQC for data-in-transit depends on infrastructure / provider timelines outside our control. If the proxy or managed TLS provider is slow to adopt hybrid handshakes, the TLS gap persists.
  - Must revisit when NIST guidance, Python `cryptography` library support, or proxy support materially changes.
- **Neutral / note:**
  - Fernet's AES-128 has a ~64-bit post-Grover effective strength. This is not an immediate vulnerability, but it falls below NIST's long-term recommendation of 128-bit post-quantum security. Flagged for a future AES-256-GCM migration decision.

## Alternatives considered

- **Adopt ML-KEM in application code now.** Rejected. There is no application-layer asymmetric key-exchange to replace. Adding one solely to wrap it with ML-KEM would introduce a novel, untested code path that adds attack surface without addressing the actual exposure (TLS). The standard `cryptography` wheel does not include ML-KEM, so this would also require adding `oqs-python` (an unvetted native extension with a limited maintenance track record) to the dependency tree.
- **Do nothing / no written position.** Rejected. The "harvest now, decrypt later" threat means the question has a live answer, and leaving it undocumented makes compliance reviews, enterprise customer questionnaires, and future architectural decisions harder. Writing the audit and this ADR costs little and creates an auditable record.
- **Hybrid X25519 + ML-KEM-768 in the application.** Rejected for the same reason as above — no application-layer key exchange exists. This is the correct approach at the TLS edge, which is tracked as an infra follow-up.

## References

- `docs/security/2026-06-crypto-audit.md` — full audit report and findings.
- `docs/adr/0002-jwt-hs256-over-rs256.md` — context on the HS256 JWT decision.
- NIST FIPS 203 (ML-KEM): https://csrc.nist.gov/pubs/fips/203/final
- NIST SP 800-56C Rev. 2 (hybrid key establishment): https://doi.org/10.6028/NIST.SP.800-56Cr2
- NIST IR 8105 (post-quantum cryptography report): https://doi.org/10.6028/NIST.IR.8105
- GitHub issue #324.
