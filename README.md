<div align="center">

# 🖋️ Graphsign.ink

**Open-Source & Globally Compliant Electronic Signature & Document Workflow Platform**

[![Release](https://img.shields.io/badge/release-v0.1.0-blue.svg?style=flat-square)](https://github.com/graphomy/graphsign.ink/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-red.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.1-black.svg?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-4.13.3-E36002.svg?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%26%20Pages-F38020.svg?style=flat-square&logo=cloudflare&logoColor=white)](https://cloudflare.com/)
[![PostgreSQL](<https://img.shields.io/badge/Database-PostgreSQL%20(Neon)-4169E1.svg?style=flat-square&logo=postgresql&logoColor=white>)](https://neon.tech/)
[![Compliance](https://img.shields.io/badge/Compliance-ESIGN%20%7C%20UETA%20%7C%20eIDAS-10B981.svg?style=flat-square)](.claude/docs/product.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](https://github.com/graphomy/graphsign.ink/pulls)

<p align="center">
  <a href="#-key-features"><b>Key Features</b></a> •
  <a href="#-system-architecture"><b>Architecture</b></a> •
  <a href="#-quick-start"><b>Quick Start</b></a> •
  <a href="#-developer-matrix"><b>Tech Stack</b></a> •
  <a href="#-verification--testing"><b>Testing</b></a> •
  <a href="#-documentation"><b>Documentation</b></a> •
  <a href="#-compliance"><b>Compliance</b></a>
</p>

---

</div>

## 📖 Overview

**Graphsign.ink** is a modern, high-performance, enterprise-grade electronic signature and agreement lifecycle platform. Engineered from the ground up for privacy, edge performance, and global compliance, Graphsign empowers everyone to design, review, sign, and seal contracts with cryptographic auditability and zero vendor lock-in.

---

## ✨ Key Features

- **📑 Visual PDF & Markdown Field Editor**: Drag and drop interactive signature blocks, initials, text fields, dates, checkboxes, and radio buttons directly on top of real PDF documents or live Markdown previews.
- **🔄 Multi-Party Signing Workflows**: Route agreements sequentially (ordered routing) or in parallel across external signers with automatic reminder dispatches and status progression (`Draft` ➔ `In Review` ➔ `Approved` ➔ `Sent` ➔ `Completed`).
- **⚖️ Scoped Review Decision Engine**: Built-in internal review gates strictly accessible by designated reviewers and administrators before contracts are dispatched for execution.
- **🛡️ Enterprise Multi-Tenancy & RBAC**: Strict tenant boundaries enforced via PostgreSQL Row-Level Security (RLS) policies, organization roles (`owner`, `admin`, `member`, `reviewer`), and granular permission enforcement (`documents:read`, `documents:write`, `templates:manage`).
- **🔒 Tamper-Evident Hash Chains**: SHA-256 hash-chained cryptographic audit logs capturing user agent, IP address, exact timestamps, and certificate validations for forensic admissibility.
- **⏱️ Timezone-Standardized Records**: All dates and audit logs formatted deterministically in `DD-MON-YYYY HH:mm (TZ)` (e.g. `23-AUG-2026 15:45 (GMT)`), automatically localized to the user's configured profile timezone.
- **🔑 Dual-Factor Authentication (MFA)**: TOTP authenticator app enforcement, secure session token rotation, and single-session settings controls.

---

## 🏗️ System Architecture

Graphsign is designed as a modular, lightweight monorepo running on distributed edge compute and serverless database infrastructure:

```
graphsign.ink/
├── apps/
│   ├── web/               # Next.js 16 (Turbopack) on Cloudflare Pages
│   │                      # Visual field editor, public signer portal, admin consoles
│   └── api/               # Hono 4.13 REST API on Cloudflare Workers
│                          # State machine, JWT auth, Web Crypto, email notifications
├── packages/
│   └── db/                # Prisma ORM schema, migrations, RLS tenant isolation
├── services/
│   └── signing/           # JVM cryptographic signing microservice (PAdES B-LTA / DSS)
├── Environment_Setup/     # Setup guides, Neon migrations, and local dev guides
└── .github/workflows/     # CI pipelines, deployment matrix, and secret scans
```

---

## 🛠️ Developer Matrix & Tech Stack

| Layer                  | Technology                                                                                 | Purpose                                                |
| :--------------------- | :----------------------------------------------------------------------------------------- | :----------------------------------------------------- |
| **Frontend Framework** | [Next.js 16.3.1](https://nextjs.org/) (React 19, Turbopack)                                | Responsive, server-rendered and static web application |
| **Backend API**        | [Hono 4.13.3](https://hono.dev/)                                                           | Ultra-fast, edge-native TypeScript REST API            |
| **Language & Runtime** | [TypeScript 5.9.3](https://www.typescriptlang.org/)                                        | Type-safe end-to-end schemas and contracts             |
| **Styling & Icons**    | [Tailwind CSS 3.4](https://tailwindcss.com/)                                               | Modern, accessible, clean design system                |
| **Database & ORM**     | [PostgreSQL (Neon Serverless)](https://neon.tech/) + [Prisma 6.19](https://www.prisma.io/) | Multi-tenant schema with driver adapters               |
| **Authentication**     | [Web Crypto JWT + TOTP](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)   | Stateless, standards-compliant authentication          |
| **Package Manager**    | [pnpm 9+](https://pnpm.io/)                                                                | Fast, disk space-efficient monorepo workspace          |
| **Testing Suite**      | [Vitest 3.2](https://vitest.dev/) + React Testing Library                                  | 100% unit and integration test coverage                |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.x` or higher
- **pnpm**: `v9.x` or higher (`npm install -g pnpm`)
- **PostgreSQL**: Local instance or free [Neon Serverless Postgres](https://neon.tech/) database

### 2. Installation

```bash
# Clone repository
git clone https://github.com/graphomy/graphsign.ink.git
cd graphsign.ink

# Install monorepo dependencies
pnpm install
```

### 3. Environment Configuration

Copy the example environment files:

```bash
cp .env.example .env
cp packages/db/.env.example packages/db/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.local.example apps/web/.env.local
```

### 4. Database Setup & Migrations

```bash
# Generate Prisma Client & push schema to database
pnpm db:generate
pnpm db:push
```

### 5. Launch Development Servers

```bash
# Run both API Worker and Web Application concurrently
pnpm dev
```

- 🌐 **Web Portal**: [http://localhost:3000](http://localhost:3000)
- ⚡ **REST API**: [http://localhost:8787](http://localhost:8787)

---

## 🧪 Verification & Testing

Every Pull Request must pass the complete CI verification pipeline:

```bash
# 1. Check code formatting with Prettier
pnpm format:check

# 2. Run ESLint code quality checks
pnpm lint

# 3. Perform TypeScript typechecking across all packages
pnpm typecheck

# 4. Run entire Vitest unit & integration test suite (310+ tests)
pnpm test

# 5. Validate production build (Next.js & Hono)
pnpm build
```

---

## 📚 Documentation & Reference Guides

- 🤖 **[CLAUDE.md](CLAUDE.md)**: Master developer workflow, Git policy, and AI pair-programming instructions.
- 📘 **[Local Development Setup Guide](Environment_Setup/local-development-setup-guide.md)**: Step-by-step developer setup and troubleshooting.
- 📖 **[Product Specifications](.claude/docs/product.md)**: Product goals, compliance matrices, and roadmap.
- 🏗️ **[System Architecture](.claude/docs/architecture.md)**: Edge architecture, component boundaries, and security.
- 🔒 **[Security & Privacy Architecture](.claude/docs/security.md)**: Threat modeling, KMS encryption, and audit controls.
- 🌐 **[REST API Documentation](.claude/docs/api.md)**: API routes, payload validators, and error schemas.

---

## ⚖️ Compliance & Legal Standards

Graphsign.ink is engineered to comply with major global electronic signature frameworks:

- **United States**: Electronic Signatures in Global and National Commerce Act (**ESIGN**) & Uniform Electronic Transactions Act (**UETA**)
- **European Union**: Electronic Identification, Authentication and Trust Services (**eIDAS** Regulation EU No 910/2014)

---

## 🤝 Contributing

We welcome contributions! Please adhere to our standard Git workflow:

1. Ensure work is linked to a Jira issue or GitHub Issue.
2. Create a branch from `develop`: `feature/<issue-id>-<description>`.
3. Verify all formatting, linting, tests, and builds pass locally.
4. Submit a Pull Request targeting `develop`.

---

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).
