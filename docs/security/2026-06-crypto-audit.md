# Cryptographic Security Audit — June 2026

**Scope:** Application-layer cryptography and transport posture.
**Method:** Static analysis of source code and dependency manifest; no infrastructure penetration testing or third-party SaaS review.
**Audited at:** `cryptography==48.0.1`, `argon2-cffi==25.1.0`, `PyJWT==2.13.0`, `passlib==1.7.4`.

---

## 1. Scope and Method

This audit covers:
- All cryptographic primitives used by SaaSConf application code (hashing, symmetric encryption, JWTs).
- The transport-layer posture (TLS termination ownership, key-exchange exposure).

Not in scope:
- Infrastructure penetration testing of the Nginx reverse proxy or cloud load balancer.
- Third-party SaaS integrations (Resend, Mailgun, Sentry).
- Secret-rotation operational procedures (covered in `docs/secret-rotation.md`).

---

## 2. Cryptographic Inventory

| Use | Mechanism | Library | File(s) | Type | Quantum exposure |
|---|---|---|---|---|---|
| Password hashing | Argon2id | `argon2-cffi==25.1.0` | `backend/app/core/security/__init__.py:21` | Symmetric KDF | Low — Grover only |
| Admin / team JWT access + refresh tokens | HS256 (HMAC-SHA256) | `PyJWT==2.13.0` | `__init__.py:101,127,150` | Symmetric MAC | Low — Grover only |
| Portal user JWT access + refresh tokens | HS256 | PyJWT | `backend/app/core/security/portal.py:34,55,64` | Symmetric MAC | Low |
| Applicant JWT access + refresh tokens | HS256 | PyJWT | `backend/app/core/security/applicants.py:34,55,65` | Symmetric MAC | Low |
| PII column encryption (email, phone, etc.) | Fernet (AES-128-CBC + HMAC-SHA256) | `cryptography==48.0.1` | `backend/app/core/security/pii_crypto.py:22,37-39` | Symmetric | Low — Grover only; AES-128 → ~64-bit post-Grover |
| TOTP secret at rest | Fernet (AES-128-CBC + HMAC-SHA256), key derived from JWT_SECRET_KEY | cryptography | `backend/app/core/security/mfa.py:19-23` | Symmetric | Low |
| Data in transit | TLS (ECDHE / X25519 + RSA/ECDSA certs) | Infrastructure / Nginx | — | **Asymmetric** | **High — broken by Shor's algorithm** |

### Package versions confirmed from `backend/requirements.txt`

```
cryptography==48.0.1
argon2-cffi==25.1.0
argon2-cffi-bindings==25.1.0
PyJWT==2.13.0
passlib==1.7.4
```

---

## 3. Threat Model

### Classical adversary

All mechanisms above are considered secure against a classical (pre-quantum) adversary:

- Argon2id is the current OWASP and NIST-recommended password KDF. The parameters (`time_cost=3`, `memory_cost=64 MB`, `parallelism=4`) meet recommended minimums.
- HS256 (HMAC-SHA256) is cryptographically sound when the key is secret. `JWT_SECRET_KEY` is validated to be ≥ 32 bytes and randomized at startup (`backend/app/config.py:141-142`).
- Fernet is a well-audited, authenticated encryption scheme (AES-128-CBC + HMAC-SHA256) from the `cryptography` package. The MultiFernet key-rotation wrapper (`pii_crypto.py:33-40`) enables online key rotation.

### CRQC adversary ("harvest now, decrypt later")

A cryptographically relevant quantum computer (CRQC) capable of running Shor's or Grover's algorithm at scale does not exist today, but adversaries may be archiving encrypted traffic now for future decryption. This creates different risk profiles depending on the confidentiality lifetime of the data:

- **Short lifetime** (session tokens, JWTs): tokens expire in 60 minutes to 7 days. By the time a CRQC could break these, they are worthless. **Negligible exposure.**
- **Long lifetime** (PII at rest, data in transit): PII columns may hold data for the life of a tenant — years. Traffic captured today and decrypted in 10–20 years would still expose live PII. **Non-negligible exposure; evaluated below.**

---

## 4. Quantum Exposure Analysis

### Shor's algorithm (asymmetric key exchange)

Shor's algorithm can factor large integers and compute discrete logarithms in polynomial time. It breaks:
- RSA key exchange (any modulus)
- ECC / ECDH / ECDHE (including X25519)
- DSA and ECDSA signatures

SaaSConf's application layer performs **no asymmetric key establishment**. There is no RSA/ECC key pair managed by Python code. The only asymmetric surface is the **TLS handshake** (ECDHE + RSA/ECDSA certificate), which is terminated by the Nginx reverse proxy / load balancer — outside application code. A CRQC could retroactively decrypt archived TLS traffic to harvest plaintext.

**Conclusion: Shor exposure is real but owned by infrastructure, not by this application.**

### Grover's algorithm (symmetric ciphers and hash functions)

Grover's algorithm provides a quadratic speedup against brute-force symmetric key search, effectively halving the key length in bits:

| Mechanism | Classical strength | Post-Grover effective strength | Margin |
|---|---|---|---|
| Argon2id (memory-hardness makes Grover impractical) | — | Not applicable — no key to brute-force | Strong |
| HMAC-SHA256 (JWT HS256) | 256-bit key | ~128 bits | **Adequate** |
| AES-128 (Fernet PII) | 128-bit key | ~64 bits | **Marginal** (see Finding F-02) |
| AES-128 (Fernet TOTP) | 128-bit key | ~64 bits | Marginal |
| SHA-256 (token hashes, recovery codes) | 256-bit | ~128-bit preimage | Adequate |

**Conclusion: Symmetric crypto is Grover-only. HMAC-SHA256 and SHA-256 retain adequate margins. AES-128 reaches a marginal post-Grover effective strength and is flagged.**

### ML-KEM / CRYSTALS-Kyber availability in `cryptography==48.0.1`

`cryptography==48.0.1` (PyCA, backed by OpenSSL 3.x) does not expose ML-KEM (NIST FIPS 203) as a first-class Python API. OpenSSL 3.x includes an OQS provider path, but it is not bundled or activated in the standard `cryptography` wheel. **Confirmed: ML-KEM is not available in the current dependency set.** This is consistent with the recommendation to address PQC at the TLS edge once the terminating proxy / managed TLS provider adds hybrid-handshake support.

---

## 5. Findings

### F-01: TOTP Fernet key is derived from JWT_SECRET_KEY (LOW)

**File:** `backend/app/core/security/mfa.py:19-23`

```python
def _get_fernet() -> Fernet:
    key_bytes = hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))
```

The TOTP secret encryption key is derived from `JWT_SECRET_KEY` via SHA-256 rather than from the independent `PII_ENCRYPTION_KEY`. This conflates two cryptographic purposes in one secret:
- Compromising `JWT_SECRET_KEY` allows both JWT forgery **and** TOTP secret decryption.
- TOTP secrets cannot be re-keyed independently: rotating the TOTP key requires rotating `JWT_SECRET_KEY`, which forces re-login for all sessions.
- TOTP secrets do not benefit from the `MultiFernet` key-rotation mechanism used for PII columns.

**Severity:** Low. The derived key is cryptographically independent (SHA-256 of the secret, not the raw bytes), and a `JWT_SECRET_KEY` compromise already yields full backend access. However, separating the keys would reduce blast radius.

**Recommendation:** Track as a future improvement — add a `TOTP_ENCRYPTION_KEY` (a proper Fernet key) alongside `PII_ENCRYPTION_KEY`, with a migration path for existing encrypted TOTP secrets. Out of scope for this change.

### F-02: Fernet AES-128 reaches marginal post-Grover strength (NOTE — not an immediate risk)

**File:** `backend/app/core/security/pii_crypto.py:53-60`, `backend/app/core/security/mfa.py:27-33`

Fernet uses AES-128-CBC. Post-Grover effective strength is ~64 bits. 64-bit effective strength is not practically breakable today even with a CRQC (Grover's algorithm still requires 2^64 oracle calls, which is enormous even for quantum hardware), but it is the conservative lower bound that NIST recommends upgrading. NIST guidance recommends 128-bit post-quantum security (AES-256 or equivalent) for long-lived sensitive data.

**Severity:** Informational. PII has long confidentiality lifetime, so this is worth tracking. A migration from AES-128 to AES-256 at the Fernet layer requires switching to a raw AES-256-GCM recipe or re-encrypting with a different scheme (Fernet pins AES-128).

**Recommendation:** File a follow-up ticket to evaluate AES-256-GCM for PII columns. Out of scope for this change.

### F-03: No `alg=none` vulnerability (CONFIRMED SAFE)

**Files:** `__init__.py:150`, `portal.py:64`, `applicants.py:65`

All `jwt.decode()` calls explicitly pass `algorithms=[settings.JWT_ALGORITHM]`:
```python
payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
```

PyJWT ≥ 2.x rejects `alg=none` by default; the explicit allowlist makes this doubly safe. **No vulnerability.**

### F-04: TLS key exchange is quantum-vulnerable (INFRASTRUCTURE — tracked separately)

ECDHE / X25519 key exchange in the TLS handshake is broken by Shor's algorithm. This surface is owned by the Nginx reverse proxy / load balancer, not application code. Migration path: hybrid X25519 + ML-KEM-768 at the TLS edge, once the terminating proxy or managed TLS provider supports it. **No application code change required.**

---

## 6. Prioritized Recommendations

| Priority | Finding | Action | Owner |
|---|---|---|---|
| Track | F-04: TLS quantum exposure | Hybrid X25519 + ML-KEM-768 at Nginx/LB when available | Infra |
| Track | F-01: TOTP key shares JWT_SECRET_KEY | Introduce independent `TOTP_ENCRYPTION_KEY` | Future ticket |
| Track | F-02: AES-128 post-Grover margin | Evaluate AES-256-GCM for PII columns | Future ticket |
| Closed | F-03: `alg=none` | No action — confirmed safe | — |

**No production code changes are required from this audit.** The two "track" items for application code (F-01, F-02) are candidates for future hardening tickets, not immediate risks. The TLS item (F-04) is infrastructure-owned and tracked separately.

---

## References

- ADR 0006: `docs/adr/0006-post-quantum-kem-evaluation.md`
- ADR 0002 (JWT HS256): `docs/adr/0002-jwt-hs256-over-rs256.md`
- Secret rotation runbook: `docs/runbooks/secret-rotation-execution.md`
- PII encryption key management: `docs/runbooks/pii-encryption-key-management.md`
- NIST FIPS 203 (ML-KEM): https://csrc.nist.gov/pubs/fips/203/final
- NIST IR 8105 (PQC report): https://doi.org/10.6028/NIST.IR.8105
