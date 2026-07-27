# graphsign.ink — AI Agent Instructions

## Mandatory Reading

Before making ANY code changes, read these docs in order:

1. `docs/product.md` — mission, scope, V1 features, non-goals
2. `docs/architecture.md` — system design, deployment, runtime flows
3. `docs/tech-stack.md` — approved technologies and versions
4. `docs/coding-standards.md` — TypeScript, naming, structure, style
5. `docs/security.md` — encryption, auth, OWASP, compliance
6. `docs/database.md` — Prisma, RLS, migrations, audit
7. `docs/api.md` — REST, versioning, errors, rate limiting
8. `docs/testing.md` — coverage, pyramid, E2E
9. `docs/ui.md` — React, Tailwind, shadcn/ui, accessibility
10. `docs/anti-goals.md` — what NOT to build

## Project Overview

**graphsign.ink** is an open-source, globally compliant document generation, agreement workflow, and electronic signature platform.

### Monorepo Layout

```
graphsign.ink/
├─ apps/
│  ├─ web/          # Next.js (Cloudflare Pages) — editor, signer, dashboards
│  └─ api/          # Hono on Workers — REST/BFF, workflow, webhooks
├─ services/
│  ├─ signing/      # JVM (EU DSS/PDFBox) — CSC-shaped PAdES sealing
│  └─ workers/      # Node job workers (queue consumers)
├─ packages/
│  ├─ core/         # Domain model, workflow state machine, validation (TS)
│  ├─ db/           # Prisma schema + migrations + RLS policies
│  ├─ pdf/          # PDF.js field-placement helpers (client)
│  ├─ auth/         # Zitadel/OIDC helpers, JWT validation, RBAC
│  └─ sdk/          # API client + types (web + external)
├─ infra/
│  ├─ docker-compose.yml
│  ├─ wrangler/     # Cloudflare Workers/Pages config
│  └─ fly/          # Fly.io configs for signing + Zitadel
└─ .github/workflows/
```

### Tech Stack (Quick Reference)

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) everywhere; Java for signing service |
| Frontend | Next.js 14+, React 18+, Tailwind CSS, shadcn/ui, PDF.js |
| API | Hono on Cloudflare Workers |
| Database | Neon Postgres 15+ with RLS |
| ORM | Prisma |
| Object Storage | Cloudflare R2 (MinIO for self-host) |
| Auth | Zitadel (self-hosted), OIDC, MFA (TOTP) |
| Signing | EU DSS / PDFBox, PAdES B-LTA, CSC protocol |
| Hosting | Cloudflare Pages + Workers, Fly.io (signing/Zitadel) |
| CI/CD | GitHub Actions |
| Testing | Vitest/Jest (unit), Playwright (E2E) |

### Decision Hierarchy

When conflicts occur, follow this order:

1. Security
2. Compliance
3. Product Requirements
4. Architecture
5. Maintainability
6. Performance
7. Developer Convenience

### Agent Roster

| Agent | Scope |
|---|---|
| `orchestrator` | Decomposes stories, delegates, validates |
| `frontend-engineer` | `apps/web/`, React, Tailwind, PDF.js |
| `api-engineer` | `apps/api/`, Hono, REST endpoints |
| `db-engineer` | `packages/db/`, Prisma, migrations, RLS |
| `auth-engineer` | `packages/auth/`, Zitadel, JWT, RBAC, magic links |
| `signing-engineer` | `services/signing/`, PAdES, CSC, KMS |
| `security-reviewer` | Reviews PRs for OWASP, secrets, RLS |
| `compliance-reviewer` | ESIGN/UETA, eIDAS, 21 CFR Part 11 |
| `devops-engineer` | `infra/`, Docker, Cloudflare, CI/CD |
| `qa-e2e` | Playwright, integration tests |
| `docs-writer` | OpenAPI, README, user docs |

### Global Rules

- Never commit secrets, API keys, or credentials
- Never bypass audit logging
- Never access the database directly from UI code
- Never implement Enterprise-only features in V1
- Never change public APIs without versioning
- Never leave TODOs or commented-out code
- Every exported function requires JSDoc
- Every change must include tests
- TypeScript strict mode — no `any`