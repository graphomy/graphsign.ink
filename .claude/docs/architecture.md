# System Architecture

> Source of truth: [Confluence — System Architecture](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1081396)

## Principles

- Edge-first, container where needed
- The signing service is the trust boundary
- One codebase, two deployment shapes (hosted + self-hosted)
- Free where it costs nothing
- Tenant isolation in the database (RLS)
- Standards over lock-in (PAdES, RFC 3161, CSC, OIDC/SAML, S3)
- Auditable by default — append-only, hash-chained audit log

## Layers

```
Client (Web App) → Cloudflare CDN/WAF → API (Workers/Hono) → Neon Postgres (RLS)
                                                             → R2 Object Storage
                                                             → Signing Service (JVM)
                                                             → Zitadel (Auth)
                                                             → Queues/Cron
```

### Never

Frontend → Database (direct access is forbidden)

## Container View

| Container | Technology | Responsibility |
|---|---|---|
| Web App | Next.js, Tailwind, shadcn/ui, PDF.js on Cloudflare Pages | Editor, field placement, dashboards, signer page |
| API / BFF | Hono on Cloudflare Workers (TypeScript) | REST, auth, workflow state machine, quota metering |
| Queues / Cron | Cloudflare Queues + Cron Triggers | Email/SMS, webhooks, bulk send, auto-delete, archival |
| Object Storage | Cloudflare R2 (S3-compatible) | Source + sealed PDFs; signed expiring URLs |
| Signing Service | JVM container (EU DSS / PDFBox), CSC client | PDF flatten, hash, sign, timestamp, PAdES B-LTA |
| Zitadel | Self-hosted container | OIDC, SAML, SCIM, MFA, sessions |
| Relational DB | Neon Postgres + RLS | Orgs, envelopes, workflow, metadata |
| Audit Log | Postgres append-only table, hash-chained | Immutable event trail |

## Deployment Topology

### Hosted (Multi-Tenant)

Cloudflare Pages + Workers → Neon Postgres, R2 Storage, Queues
Workers → (mTLS) → Signing Service on Fly.io
Workers → (OIDC) → Zitadel on Fly.io

### Self-Hosted (Docker Compose)

```yaml
# docker-compose.yml
services:
  web        # Next.js
  api        # Node/Hono
  signing    # JVM/EU DSS
  postgres   # PostgreSQL 15+
  minio      # S3-compatible storage
  zitadel    # Auth
```

## Business Rules

Business logic belongs ONLY in services. Never inside controllers, React components, or the database.

## Authentication

- Zitadel-issued JWTs validated on every request
- Tenant + role claims drive app checks and Postgres RLS
- MFA (TOTP) enforced for admins and super-admin
- Signer access via magic links (no account)

## Multi-Tenancy

Every request belongs to exactly one tenant. Every query must enforce tenant isolation via RLS.

## Audit

Every business action creates an audit event. Audit logs are immutable and hash-chained.

## Storage

- Metadata → Database (Neon Postgres)
- Files → Object Storage (R2 / MinIO)
- Sealed copies emailed to all parties; R2 copy auto-deleted after retention window

## Background Jobs

Emails, signing reminders, retention, cleanup, webhooks — all execute asynchronously via Cloudflare Queues.

## AI

AI services never access the database directly — only through APIs. BYOM: tenant supplies provider + API key.

## Architecture Changes

Major architectural changes require an ADR.