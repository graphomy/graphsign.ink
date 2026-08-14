# graphsign.ink

Open-source, globally compliant document generation, agreement workflow, and electronic signature platform.

---

## 🌟 Quick Links & Documentation

- 🤖 **[CLAUDE.md](CLAUDE.md)**: Master AI agent & developer reference guide.
- 📖 **[Product Overview](.claude/docs/product.md)**: Product mission, core principles, compliance scope (ESIGN, UETA, eIDAS, 21 CFR Part 11), and V1 feature scope.
- 🏗️ **[System Architecture](.claude/docs/architecture.md)**: Component layers, edge/JVM deployment topology, trust boundaries.
- ⚡ **[Tech Stack Specifications](.claude/docs/tech-stack.md)**: Approved technologies, frameworks, and dependency constraints.
- 🔒 **[Security Architecture](.claude/docs/security.md)**: Encryption, KMS key management, OWASP mitigations, and RLS multi-tenant isolation.
- 🗄️ **[Database & Schema](.claude/docs/database.md)**: PostgreSQL 15+, Prisma ORM, RLS tenant isolation, and migrations.
- 🌐 **[REST API Specifications](.claude/docs/api.md)**: URI versioning (`/api/v1/`), standard HTTP status codes, error payload schema, and rate limits.
- 🧪 **[Testing Pyramid & Standards](.claude/docs/testing.md)**: 70/20/10 testing pyramid, coverage thresholds (80%-100%), and domain tests.
- 📚 **[Wiki — Home](wiki/Home.md)**: Product architecture, agreement versioning, Markdown drafting, and compliance overview.
- 🚀 **[Wiki — Getting Started](wiki/Getting-Started.md)**: Detailed instructions for setting up and running graphsign.ink locally.

---

## ✨ Key Platform Features

- **Markdown Agreement Drafting**: Real-time Markdown live editor with formatting toolbar (headings, bold, lists, tables, code, links).
- **Active Agreement PDF Viewer**: Verified legal A4 document view with watermarks, signature boxes, and print/download controls.
- **Semantic Versioning**: `v0.1` draft baseline, automatic minor bumps (`+0.1`), and major version promotions (`v1.0`, `v2.0`) upon activation.
- **Timezone-Aware Date Standards**: All dates standardized in `DD-MON-YYYY` format (e.g. `14-AUG-2026`) based on user profile timezone with GMT fallback.
- **Tamper-Evident Signatures**: Cryptographic signing and append-only hash-chained audit trails.

---

## 📦 Monorepo Layout

```
graphsign.ink/
├── apps/
│   ├── web/            # Next.js (Cloudflare Pages) — editor, signer, dashboards
│   └── api/            # Hono on Cloudflare Workers — REST API, workflow state machine, auth
├── packages/
│   └── db/             # Prisma schema, migrations, RLS tenant isolation policies
├── services/
│   └── signing/        # JVM container (EU DSS / PDFBox) — PAdES B-LTA sealing & CSC protocol
├── .claude/            # AI agent instructions, personas, commands, and skills
└── CLAUDE.md           # Master AI agent navigation guide
```

---

## 🚀 Running Locally

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Setup database schema & client
pnpm --filter @graphsign/db exec prisma generate
pnpm --filter @graphsign/db exec prisma db push

# 3. Start development servers
pnpm dev
```

- **Web App**: [http://localhost:3000](http://localhost:3000)
- **API Worker**: [http://localhost:8787](http://localhost:8787)

---

## 🧪 Verification & Testing Commands

```bash
# Run unit & integration test suites
pnpm test

# Run TypeScript type check across all workspace projects
pnpm typecheck

# Run ESLint check
pnpm lint

# Check code formatting (Prettier)
pnpm format:check

# Format code automatically
pnpm format

# Production build test
pnpm build
```

---

## 📜 License

[AGPL-3.0](LICENSE) — Open Source Software
