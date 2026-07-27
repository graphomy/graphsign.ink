# Security Standards

> Source of truth: [Confluence — Security Architecture and API Standards](https://graphomy.atlassian.net/wiki/spaces/INK/pages/852307)

Security is mandatory. Never trade security for convenience.

## Encryption

### In Transit
- TLS 1.3 enforced for all communications

### At Rest
- Database: PostgreSQL native + storage-level encryption
- Object storage: R2/MinIO native encryption
- Completed documents: envelope-encryption with KMS-held keys

### Key Management
- Signing and encryption keys in KMS/HSM — never in code or env files
- Automated key rotation on schedule
- Least-privilege: only signing service has key access

## Authentication

- JWT (Zitadel-issued)
- Refresh tokens
- MFA (TOTP) — enforceable at org level, mandatory for admins/super-admin
- Recovery codes generated and securely stored
- Short sessions

## Authorization

- RBAC with least privilege
- Default deny
- Roles: Author, Reviewer/Approver, Signer, Org Admin, Super Admin

## Tenant Isolation

- **Database:** Row-Level Security on every tenant table
- **API:** Every call validates tenant context
- **Storage:** Object storage partitioned by tenant
- **Signing:** Least-privilege; only component with signing key access

## Secrets

Never store in code: API keys, passwords, certificates, JWT secrets, signing keys.

## OWASP Top 10 Protection

- Input validation and sanitization
- Output encoding
- CSRF protection
- XSS prevention (CSP, secure headers)
- SQL injection prevention (Prisma ORM)
- Secure authentication and session management
- HSTS, X-Frame-Options, Content-Security-Policy

## Input Validation

Validate every request, every field, every upload. Use Zod for schema validation. Allowlists over denylists.

## File Upload

- Virus scan
- Validate MIME type
- Validate extension
- Limit size

## Rate Limiting

| Endpoint | Limit |
|---|---|
| Authentication | 10 req/min per IP |
| Signing | 5 req/min per user |
| General API | 100 req/min per API key |
| Webhooks | Async, queue-based |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

## Logging

Never log: passwords, API keys, certificates, JWT tokens, customer documents.

## Audit Logging

- Append-only — cannot be modified
- Hash-chained — cryptographic tamper-evidence
- Exportable — full audit log export
- Configurable retention periods
- All actions logged (document creation, signing, admin actions)

## Document Integrity

- PAdES B-LTA sealing with embedded LTV data
- Verification independence — documents verify without graphsign.ink
- RFC 3161 trusted timestamps embedded in seals

## Data Classification

| Data Type | Classification | Protection |
|---|---|---|
| Document content | Confidential | Encrypted at rest, KMS envelope encryption |
| Signatures & audit logs | Confidential | Encrypted, tamper-evident, append-only |
| User PII | Confidential | Encrypted, access-controlled |
| API keys & credentials | Secret | KMS/HSM, never logged |
| Signing keys | Secret | KMS/HSM only |

## Compliance Framework

| Framework | Level | Edition |
|---|---|---|
| eIDAS SES | Simple | All (Free) |
| eIDAS AES | Advanced | All (BYO Certificate) |
| eIDAS QES | Qualified | Enterprise (V3) |
| ESIGN Act | Federal | All |
| UETA | State | All |
| 21 CFR Part 11 | Full | Enterprise (V3) |

## AI Rules

Whenever generating code, perform security review first. Reference this document.