# 0002. JWT HS256 over RS256

- **Status:** Accepted
- **Date:** 2026-04-17
- **Deciders:** @josediaz
- **Tags:** security, auth

## Context

SaaSConf issues JWTs for two audiences: the admin frontend and the portal. Both are served by the same FastAPI backend. The backend is the only consumer of its own tokens — there is no third-party verifier, no mobile SDK validating tokens offline, no federation.

At decision time the codebase needed to pick between symmetric (HS256) and asymmetric (RS256 / ES256) algorithms. The tradeoff is well known:

- **HS256** — single secret, shared between issuer and verifier. Simpler, faster, smaller tokens.
- **RS256 / ES256** — public/private keypair. Verifiers only need the public key, enabling third-party verification. Operationally heavier: key generation, rotation, JWKS publishing.

Constraints:
- The *only* verifier is the backend that issued the token.
- The JWT secret already lives in the same secrets management as other backend secrets (`JWT_SECRET_KEY` in env / secrets manager).
- Rotating a symmetric secret is simple: invalidate all sessions + redeploy. The product tolerates forced re-login on secret rotation.
- Token size matters — short-lived access tokens are hot in the request path.

## Decision

Use **HS256** for all JWTs (access tokens, refresh tokens, applicant-portal tokens). The shared secret is `JWT_SECRET_KEY`, set via environment, minimum 32 bytes, validated at startup (`backend/app/config.py:_validate_secrets`).

## Consequences

- **Positive:**
  - No key infrastructure: no keypair generation, no JWKS endpoint, no PEM files to deploy.
  - Smaller tokens (HS256 signatures are ~64 bytes; RS256 signatures are ~384 bytes) — cheaper on every request.
  - Token verification is a single HMAC; faster than asymmetric signature verification.
  - Rotation procedure is well-documented and tested (see `docs/secret-rotation.md`).
- **Negative:**
  - The verifier (backend) holds the signing key, so any backend process compromise means forgery is possible. Acceptable because a backend compromise already grants full DB access — JWT forgery is not the weakest link.
  - Cannot hand tokens to a third party for offline verification. Fine today; would force a migration if SaaSConf ever needed to federate.
  - No dual-key zero-downtime rotation without code changes (documented as future work in `docs/secret-rotation.md`).
- **Neutral / note:**
  - If the product ever needs to expose a verifier endpoint to external integrators (webhooks signed by us, mobile apps), revisit via a new ADR.

## Alternatives considered

- **RS256 / ES256:** correct choice if the token is verified by anyone other than the issuer. Rejected on YAGNI grounds — there is no second verifier, and the operational cost (key rotation, JWKS, monitoring) is non-trivial.
- **Opaque (non-JWT) session tokens stored in Redis:** would eliminate the "compromised backend can forge tokens" concern but adds a Redis round-trip to every authenticated request. Rejected; performance cost outweighs the marginal security gain given that a backend compromise is already game-over.

## References

- `backend/app/core/security/__init__.py` — `create_access_token`, `decode_token`.
- `backend/app/config.py` — `JWT_SECRET_KEY`, `JWT_ALGORITHM`, startup validation.
- `docs/secret-rotation.md` — JWT rotation procedure.
- `docs/runbooks/secret-rotation-execution.md#jwt_secret_key` — executable runbook.
