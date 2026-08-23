# graphsign.ink — AI Agent & Developer Reference Guide

> **MANDATORY INSTRUCTION:** All AI agents and human developers MUST consult this index to identify the specific `.claude/` files governing their task before writing or modifying code.

---

## Quick Navigation Index

| Task Category                    | Key File to Read                                                     | Primary Purpose                                                     |
| :------------------------------- | :------------------------------------------------------------------- | :------------------------------------------------------------------ |
| **Product & Features**           | [.claude/docs/product.md](.claude/docs/product.md)                   | Mission, core principles, V1 feature scope, non-goals               |
| **Architecture & System Design** | [.claude/docs/architecture.md](.claude/docs/architecture.md)         | Component layers, edge/JVM deployment topology, trust boundaries    |
| **Tech Stack & Versions**        | [.claude/docs/tech-stack.md](.claude/docs/tech-stack.md)             | Approved technologies, versions, monorepo packages, libraries       |
| **Coding Style & Structure**     | [.claude/docs/coding-standards.md](.claude/docs/coding-standards.md) | TypeScript strict standards, file layout, naming, git workflow      |
| **Security & Compliance**        | [.claude/docs/security.md](.claude/docs/security.md)                 | Encryption, KMS keys, OWASP, tenant isolation, compliance standards |
| **Database & Prisma**            | [.claude/docs/database.md](.claude/docs/database.md)                 | Schema conventions, RLS isolation policies, migrations, indexes     |
| **API & REST Endpoints**         | [.claude/docs/api.md](.claude/docs/api.md)                           | REST design, versioning (`/api/v1/`), error schema, rate limits     |
| **Testing & Quality Gates**      | [.claude/docs/testing.md](.claude/docs/testing.md)                   | 70/20/10 testing pyramid, coverage limits (80%-100%), domain tests  |
| **UI Components & Style**        | [.claude/docs/ui.md](.claude/docs/ui.md)                             | Next.js App Router, Tailwind, shadcn/ui, WCAG 2.2 AA accessibility  |
| **Domain Model & ERD**           | [.claude/docs/domain-model.md](.claude/docs/domain-model.md)         | Entity relationships, core domain entities, data schemas            |
| **Terminology & Terms**          | [.claude/docs/glossary.md](.claude/docs/glossary.md)                 | Ubiquitous language (PAdES, LTV, CSC, QTSP, Magic Link, RLS)        |
| **Non-Functional Targets**       | [.claude/docs/nfr-stories.md](.claude/docs/nfr-stories.md)           | Performance SLAs (P95 < 500ms), availability (99.9%), audit SLAs    |
| **Forbidden Anti-Goals**         | [.claude/docs/anti-goals.md](.claude/docs/anti-goals.md)             | Strict prohibitions: what NOT to build or modify                    |

---

## 1. Documentation Files (`.claude/docs/`)

Each file in `.claude/docs/` provides canonical guidance on a specific operational domain:

### 1.1 [.claude/docs/product.md](.claude/docs/product.md) — Product Overview & Mission

- **Contents**: Open-source mission (AGPL-3.0), product vision, core principles (Security First, Compliance by Design, Open Source First, API First, Multi-Tenant).
- **Compliance Scope**: ESIGN Act, UETA, eIDAS (SES/AES/QES), 21 CFR Part 11.
- **When to follow**: Before starting any story to confirm feature scope and ensure non-goals/enterprise features are not implemented in V1 core.

### 1.2 [.claude/docs/architecture.md](.claude/docs/architecture.md) — System Architecture

- **Contents**: High-level system topology, container boundaries, deployment models (Hosted multi-tenant Cloudflare + Fly.io vs. Self-hosted Docker Compose).
- **Layering Rules**: Web App (Next.js) → API/BFF (Hono on Workers) → Neon Postgres (RLS) & JVM Signing Service (EU DSS/PDFBox).
- **Forbidden**: Direct frontend-to-database connections. Business logic outside service layer.

### 1.3 [.claude/docs/tech-stack.md](.claude/docs/tech-stack.md) — Approved Technologies & Versions

- **Contents**: Exact technology selections (TypeScript strict, Next.js 14+, Tailwind CSS, shadcn/ui, Hono framework, Prisma ORM, Neon Postgres 15+, Cloudflare R2, Zitadel OIDC, JVM EU DSS/PDFBox, Vitest, Playwright).
- **When to follow**: When choosing libraries or frameworks. Adding unapproved dependencies is forbidden.

### 1.4 [.claude/docs/coding-standards.md](.claude/docs/coding-standards.md) — Language & Code Guidelines

- **Contents**: General principles, file structure (`apps/web`, `apps/api`, `packages/`, `services/`), naming conventions (PascalCase classes/interfaces, camelCase functions/variables, UPPER_CASE constants, kebab-case files).
- **Rules**: Max function length (50 lines), max file length (500 lines), max nesting (3 levels), strict TypeScript (`no implicit any`), Zod runtime validation, JSDoc required for all exports.

### 1.5 [.claude/docs/security.md](.claude/docs/security.md) — Security & Compliance Architecture

- **Contents**: Encryption standards (TLS 1.3 in transit, KMS envelope encryption at rest), key management, JWT & MFA auth, RBAC permissions, OWASP Top 10 mitigation, rate limiting, logging safety (never log secrets/tokens/PII).
- **When to follow**: Before writing any endpoint, database query, authentication handler, or key processing logic.

### 1.6 [.claude/docs/database.md](.claude/docs/database.md) — Database & Storage Design

- **Contents**: PostgreSQL 15+ & Prisma conventions, UUID v7 primary keys, soft deletes (`deleted_at`), `organisation_id` multi-tenancy requirement, Row-Level Security (RLS) SQL policies, indexing strategy, backup/recovery rules.
- **When to follow**: When creating or modifying database models, migrations, indexes, or queries in `packages/db/`.

### 1.7 [.claude/docs/api.md](.claude/docs/api.md) — REST API Specifications

- **Contents**: URI versioning (`/api/v1/`), standard HTTP methods/statuses, unified error payload (`{ error: { code, message, details, requestId, path } }`), rate-limiting headers, cursor-based pagination (`?cursor=...&limit=...`), webhook delivery specs.
- **When to follow**: When implementing or updating API routes in `apps/api/`.

### 1.8 [.claude/docs/testing.md](.claude/docs/testing.md) — Test Strategy & Coverage Thresholds

- **Contents**: 70/20/10 testing pyramid (Unit, Integration, E2E), strict coverage requirements (80% global, 90% core logic, 100% cryptographic sealing & audit log, 95% auth), domain-specific testing rules (RLS isolation, PAdES byte-range validation, hash chain tamper checks, magic link single-use).
- **When to follow**: When writing test suites in Vitest or Playwright. PRs dropping coverage are blocked.

### 1.9 [.claude/docs/ui.md](.claude/docs/ui.md) — UI Component & Styling Guidelines

- **Contents**: Component patterns (shadcn/ui, Tailwind CSS), Next.js App Router layout standards, WCAG 2.2 AA accessibility requirements (keyboard navigation, aria tags, contrast), PDF.js canvas viewer integration.
- **When to follow**: When building or modifying React pages and components in `apps/web/`.

### 1.10 [.claude/docs/domain-model.md](.claude/docs/domain-model.md) — Domain Entities & Relationships

- **Contents**: Entity Relationship Diagram (ERD), schema definitions for `Organisation`, `User`, `Document`, `Envelope`, `Recipient`, `Signature`, `Template`, `AuditLog`, `ApiKey`, `Webhook`.
- **When to follow**: When designing features touching business domain entities or database models.

### 1.11 [.claude/docs/glossary.md](.claude/docs/glossary.md) — Ubiquitous Domain Vocabulary

- **Contents**: Precise definitions of domain terms (PAdES, LTV, CSC v2, QTSP, Magic Link, Hash Chain, Envelope, Signer, RLS, TOTP, KMS).
- **When to follow**: To ensure consistent naming in variable names, documentation, code comments, and API payloads.

### 1.12 [.claude/docs/nfr-stories.md](.claude/docs/nfr-stories.md) — Non-Functional Requirements

- **Contents**: Quantitative performance criteria (P95 latency < 500ms for API, document sealing < 2s), 99.9% uptime targets, disaster recovery RPO/RTO goals, security audit SLAs.
- **When to follow**: When evaluating performance optimizations, connection pooling, and infrastructure changes.

### 1.13 [.claude/docs/anti-goals.md](.claude/docs/anti-goals.md) — Explicit Anti-Goals & Restrictions

- **Contents**: 8 strict prohibitions:
  1. No new unapproved frameworks.
  2. No Enterprise-only features in V1 core.
  3. No bypassing audit logging.
  4. No direct database access from UI.
  5. No hardcoded secrets or credentials.
  6. No unversioned public API changes.
  7. No unnecessary complexity.
  8. No breaking backward compatibility without explicit instruction.

---

## 2. Agent Personas (`.claude/agents/`)

When acting under a specific engineering role or delegating sub-tasks, refer to the corresponding persona file:

| Agent File                                                                     | Specialized Domain & Responsibilities                                                         |
| :----------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| [.claude/agents/orchestrator.md](.claude/agents/orchestrator.md)               | Story breakdown, task ordering, agent delegation, multi-agent output verification             |
| [.claude/agents/frontend-engineer.md](.claude/agents/frontend-engineer.md)     | `apps/web/`, Next.js App Router, React 18, Tailwind CSS, shadcn/ui, PDF field placement       |
| [.claude/agents/api-engineer.md](.claude/agents/api-engineer.md)               | `apps/api/`, Hono framework on Workers, REST controllers, Zod validation, error middleware    |
| [.claude/agents/db-engineer.md](.claude/agents/db-engineer.md)                 | `packages/db/`, Prisma schema migrations, RLS policies, indexes, Neon Postgres optimization   |
| [.claude/agents/auth-engineer.md](.claude/agents/auth-engineer.md)             | `packages/auth/`, Zitadel OIDC, JWT session handling, RBAC permissions, TOTP MFA, magic links |
| [.claude/agents/signing-engineer.md](.claude/agents/signing-engineer.md)       | `services/signing/`, JVM EU DSS/PDFBox, PAdES B-LTA sealing, CSC protocol, KMS keys           |
| [.claude/agents/security-reviewer.md](.claude/agents/security-reviewer.md)     | Security audits, OWASP Top 10 inspection, secret scanning, RLS policy verification            |
| [.claude/agents/compliance-reviewer.md](.claude/agents/compliance-reviewer.md) | Legal compliance audits (ESIGN/UETA, eIDAS, 21 CFR Part 11), audit log integrity              |
| [.claude/agents/devops-engineer.md](.claude/agents/devops-engineer.md)         | `infra/`, Docker Compose, Cloudflare Pages/Workers, Fly.io, GitHub Actions CI/CD workflows    |
| [.claude/agents/qa-e2e.md](.claude/agents/qa-e2e.md)                           | Vitest integration testing, Playwright E2E automation, WCAG accessibility test suites         |
| [.claude/agents/docs-writer.md](.claude/agents/docs-writer.md)                 | Technical documentation, OpenAPI specifications, user guides, README updates                  |

---

## 3. Workflow Commands (`.claude/commands/`)

These command specifications define standardized procedures for development and quality workflows:

- [.claude/commands/story.md](.claude/commands/story.md) — Workflow to pick up a Jira story, create a feature branch (`feature/<jira-id>-*`), analyze requirements, write tests, implement code, and push.
- [.claude/commands/security-review.md](.claude/commands/security-review.md) — Security check workflow covering secret scanning, input validation audit, authentication/authorization verification, and RLS checks.
- [.claude/commands/rls-check.md](.claude/commands/rls-check.md) — Automated RLS policy verification workflow testing tenant isolation across all tables containing `organisation_id`.
- [.claude/commands/seal-test.md](.claude/commands/seal-test.md) — Workflow for testing cryptographic PDF sealing, PAdES B-LTA compliance, timestamp tokens, and tamper detection against the JVM signing service.
- [.claude/commands/a11y-check.md](.claude/commands/a11y-check.md) — Accessibility audit workflow using `@axe-core/playwright` to verify WCAG 2.2 AA compliance across all web app views.
- [.claude/commands/new-migration.md](.claude/commands/new-migration.md) — Database migration workflow for generating, testing, verifying RLS policies, and committing Prisma migrations safely.
- [.claude/commands/deploy-preview.md](.claude/commands/deploy-preview.md) — Workflow to build, test, and verify preview environment deployments on Cloudflare Pages and Workers.

---

## 4. Specialized Skills (`.claude/skills/`)

Skill directories contain detailed implementation rules and patterns for complex technical domains:

- [.claude/skills/audit-hash-chain/SKILL.md](.claude/skills/audit-hash-chain/SKILL.md) — Detailed implementation instructions for append-only, cryptographic hash-chained audit logging (`previous_hash` → `current_hash`).
- [.claude/skills/cloudflare-deploy/SKILL.md](.claude/skills/cloudflare-deploy/SKILL.md) — Cloudflare Workers (API) and Cloudflare Pages (Web App) deployment configuration and environment bindings.
- [.claude/skills/csc-integration/SKILL.md](.claude/skills/csc-integration/SKILL.md) — Integration specification for Cloud Signature Consortium (CSC v2 API) endpoints (`credentials/list`, `credentials/authorize`, `signatures/signHash`).
- [.claude/skills/magic-link-signing/SKILL.md](.claude/skills/magic-link-signing/SKILL.md) — Implementation rules for account-less signer access via single-use, hashed magic links with mandatory e-sign consent logging.
- [.claude/skills/nfr-acceptance/SKILL.md](.claude/skills/nfr-acceptance/SKILL.md) — Procedures for measuring and validating non-functional performance requirements (latency, throughput, bundle size).
- [.claude/skills/pades-sealing/SKILL.md](.claude/skills/pades-sealing/SKILL.md) — Rules for PDF digital signatures using EU DSS / PDFBox, PAdES B-LTA validation, RFC 3161 timestamps, and LTV revocation data.
- [.claude/skills/rls-policies/SKILL.md](.claude/skills/rls-policies/SKILL.md) — Recipes and SQL templates for writing tenant isolation Row-Level Security policies in Neon Postgres.

---

## 5. System Configuration Files

- [.claude/README.md](.claude/README.md) — Core agent overview, monorepo layout, quick tech reference, decision hierarchy, global rules.
- [.claude/settings.json](.claude/settings.json) — System settings and tool configurations.
- [.claude/settings.local.json](.claude/settings.local.json) — Local environment override configurations.

---

## Mandatory Git & Development Workflow Rules

All AI agents must follow this workflow without exception:

1. **Source of Work**: Every code change MUST originate from a Jira Story, Task, or Bug.
2. **Branch Creation**: Always create a feature branch from `develop` named `feature/<jira-id>-<description>` (or `bugfix/<jira-id>-<description>`).
3. **Never Commit Directly**: Never commit directly to `main` or `develop`.
4. **Local Verification**: Run all verification checks locally before pushing:
   - `pnpm db:generate`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm format:check`
   - `pnpm build`
   - `pnpm test`
5. **Pull Request Target**: Create Pull Requests targeting `develop` (never `main`). Include the Jira ID in the PR title.
6. **Human Review**: AI agents MUST NEVER approve or merge their own Pull Requests. Only a human maintainer may merge PRs.
