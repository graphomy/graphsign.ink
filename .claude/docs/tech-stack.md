# Technology Stack

> Source of truth: [Confluence — Technology Stack](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1245185)

**Principle:** Free-tier-first, standards-based, self-hostable.

## Stack Summary

| Layer | Selected | Phase |
|---|---|---|
| Language | TypeScript 5+ (strict) | MVP-0 |
| Frontend | Next.js 14+ (React 18+), Tailwind CSS 3+, shadcn/ui, PDF.js | MVP-0 |
| API | Hono on Cloudflare Workers (or NestJS/Fastify as container) | MVP-0 |
| Database | Neon Postgres 15+ (0.5 GB free, scale-to-zero) | MVP-0 |
| ORM | Prisma | MVP-0 |
| Object Storage | Cloudflare R2 (10 GB free, no egress) | MVP-0 |
| PDF Signing | EU DSS / PDFBox (JVM, PAdES B-LTA) | V1 |
| Remote Signing | CSC (Cloud Signature Consortium) standard | V2→V3 |
| Timestamping | FreeTSA / Open TSA (RFC 3161) | V1 |
| Key Custody | Cloud KMS (free tier) → HSM at scale | V1 |
| Auth / IdP | Zitadel (self-hosted, OIDC/SAML/MFA) | V1 |
| MFA | Standard TOTP libraries | V1 |
| Email | Resend (~3,000/mo free) | MVP-0 |
| SMS | Twilio (pay per message) | V2 |
| Queue / Jobs | Cloudflare Queues + Cron (pg-boss for self-host) | V1 |
| AI Drafting | BYOM adapter + Ollama (local) | V1 |
| Frontend Hosting | Cloudflare Pages | MVP-0 |
| Compute Hosting | Cloudflare Workers (100k req/day free) | MVP-0 |
| Signing Service Host | Fly.io / Railway (JVM container) | V1 |
| Edge / WAF / CDN | Cloudflare | MVP-0 |
| Error Monitoring | Sentry | V1 |
| Analytics | PostHog (self-host option) | V1 |
| CI/CD | GitHub Actions | MVP-0 |
| Containerisation | Docker + Docker Compose | V1 |
| Testing | Vitest/Jest (unit), Playwright (E2E) | MVP-0 |
| Package Manager | pnpm | MVP-0 |

## Selection Criteria

1. **Free to start** — generous free tier or permissive open-source license
2. **No security compromise** — encryption, isolation, key custody non-negotiable
3. **Scales smoothly** — paid path is a config change, not a re-architecture
4. **Self-hostable** — same core runs on customer infrastructure
5. **Standards-based** — PAdES, RFC 3161, CSC, OIDC/SAML/SCIM, S3 API
6. **CSC standard** — signing service implements Cloud Signature Consortium API

## Signing Service Runtime

The signing service is a **dedicated JVM microservice** (EU DSS + Apache PDFBox). It runs as a container on Fly.io/Railway, NOT on Cloudflare Workers.

| Aspect | JVM + EU DSS/PDFBox |
|---|---|
| PAdES B-T → B-LTA | Mature, built-in |
| CSC client | Provided by EU DSS |
| eIDAS trust lists | Supported |
| Deployment | Container, private network only |

## Self-Host Alternatives

| Hosted | Self-Host Alternative |
|---|---|
| Cloudflare R2 | MinIO (S3-compatible) |
| Neon Postgres | PostgreSQL 15+ Docker |
| Cloudflare Queues | pg-boss (jobs on Postgres) |
| Resend | Operator SMTP |
| Sentry | GlitchTip |
| PostHog | Umami |

## Cost Progression

| Stage | Monthly Infra |
|---|---|
| Build / MVP-0 | ~$0 (domain only) |
| Private beta | ~$0–25 |
| Early revenue | ~$50–300 |
| Enterprise scale | $300 → several $k |
