# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main branch) | Yes |
| Older releases | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. Email **security@saasconf.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

2. You will receive an acknowledgment within **48 hours**.

3. We will investigate and provide a timeline for a fix within **5 business days**.

4. Once the fix is deployed, we will publicly disclose the vulnerability with credit to the reporter (unless anonymity is requested).

### Scope

In scope:
- Authentication and authorization bypass
- SQL injection, XSS, CSRF
- Data exposure across tenants (RLS bypass)
- Remote code execution
- Sensitive data exposure in logs or responses

Out of scope:
- Denial of service (DoS) attacks
- Social engineering
- Vulnerabilities in third-party dependencies (report upstream)
- Issues requiring physical access

## Security Practices

- **Multi-tenant isolation**: PostgreSQL Row-Level Security (RLS) on all tenant-scoped tables
- **Authentication**: JWT with token blacklist, Argon2id password hashing
- **Input validation**: Server-side HTML sanitization (nh3), frontend sanitization (DOMPurify)
- **File uploads**: Magic byte verification, EXIF metadata stripping, filename sanitization
- **HTTPS**: TLS 1.2+ with modern cipher suites, HSTS with preload
- **CI/CD**: Automated vulnerability scanning (Trivy, pip-audit, TruffleHog)
- **Secrets**: No hardcoded credentials; all secrets via environment variables
