<div align="center">

# 🖋️ Graphsign.ink

**Open-Source & Globally Compliant Electronic Signature & Document Workflow Platform**

[![Release](https://img.shields.io/badge/release-v0.1.0-blue.svg?style=flat-square)](https://github.com/graphomy/graphsign.ink/releases)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-red.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.0-black.svg?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-4.13.13-E36002.svg?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
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
  <a href="https://github.com/graphomy/graphsign.ink/wiki"><b>Documentation & Wiki</b></a> •
  <a href="#-compliance"><b>Compliance</b></a> •
  <a href="#-acknowledgments"><b>Acknowledgments</b></a>
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
| **Frontend Framework** | [Next.js 16.4.0](https://nextjs.org/) (React 19, Turbopack)                                | Responsive, server-rendered and static web application |
| **Backend API**        | [Hono 4.13.13](https://hono.dev/)                                                          | Ultra-fast, edge-native TypeScript REST API            |
| **Language & Runtime** | [TypeScript 5.9.3](https://www.typescriptlang.org/)                                        | Type-safe end-to-end schemas and contracts             |
| **Styling & Icons**    | [Tailwind CSS 4.3.3](https://tailwindcss.com/) + [Lucide Icons](https://lucide.dev/)       | Modern, accessible, clean design system                |
| **Database & ORM**     | [PostgreSQL (Neon Serverless)](https://neon.tech/) + [Prisma 7.10.1](https://www.prisma.io/) | Multi-tenant schema with driver adapters & migrations  |
| **Email Delivery**     | [Resend](https://resend.com/)                                                              | Transactional signing invitations, alerts & notices    |
| **Hosting & Edge**     | [Cloudflare](https://cloudflare.com/) (Workers, Pages, R2)                                 | Edge API execution, static assets, and object storage  |
| **Authentication**     | [Web Crypto JWT + TOTP](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)   | Stateless, standards-compliant authentication          |
| **Package Manager**    | [pnpm 9+](https://pnpm.io/)                                                                | Fast, disk space-efficient monorepo workspace          |
| **Testing Suite**      | [Vitest 4.1.12](https://vitest.dev/) + React Testing Library                               | 700+ unit and integration tests passing                |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js**: `v20.x` or higher
- **pnpm**: `v9.x` or higher (`npm install -g pnpm`)
- **Cloudflare Account**: [Cloudflare](https://dash.cloudflare.com/) for deploying Workers and Pages
- **Neon Account**: [Neon](https://neon.tech/) for Serverless PostgreSQL
- **Resend Account**: [Resend](https://resend.com/) for email delivery

---

### 2. Service Credentials Setup

#### A. Neon Serverless PostgreSQL
1. Create a project and database on [neon.tech](https://neon.tech).
2. Copy the **Direct connection string** (without `-pooler`) for running Prisma migrations:
   ```text
   postgresql://<user>:<password>@<ep-direct>.neon.tech/neondb?sslmode=require
   ```
3. Copy the **Pooled connection string** (with `-pooler`) for production runtime connection pooling:
   ```text
   postgresql://<user>:<password>@<ep-pooler>.neon.tech/neondb?sslmode=require
   ```

#### B. Resend Transactional Email
1. Sign up at [resend.com](https://resend.com) and create an API key (`re_...`).
2. Verify your sending domain under Domains, or use your account's test sender address for local development.

#### C. Cloudflare (Workers & Pages)
1. Authenticate with Wrangler CLI:
   ```bash
   pnpm exec wrangler login
   ```
2. Note your Cloudflare **Account ID** and **API Token** from the Cloudflare Dashboard for CI/CD deployments.

---

### 3. Installation & Environment Setup

```bash
# Clone the repository
git clone https://github.com/graphomy/graphsign.ink.git
cd graphsign.ink

# Install monorepo dependencies
pnpm install
```

Copy the example environment configuration files:

```bash
cp .env.example .env
cp packages/db/.env.example packages/db/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.local.example apps/web/.env.local
```

Configure your environment files:
- **`packages/db/.env`**:
  ```env
  DATABASE_URL="postgresql://<user>:<password>@<ep-direct>.neon.tech/neondb?sslmode=require"
  ```
- **`apps/api/.dev.vars`**:
  ```env
  DATABASE_URL="postgresql://<user>:<password>@<ep-pooler>.neon.tech/neondb?sslmode=require"
  JWT_SECRET="your-secure-jwt-secret-at-least-32-chars-long"
  RESEND_API_KEY="re_your_resend_api_key"
  EMAIL_FROM="updates@notification.graphsign.ink"
  ```
- **`apps/web/.env.local`**:
  ```env
  NEXT_PUBLIC_API_URL="http://localhost:8787"
  ```

---

### 4. Database Initialization & Migrations

```bash
# Generate the Prisma client
pnpm db:generate

# Push schema directly or deploy existing migrations
pnpm db:push
```

If connecting to an existing database with pre-created tables, baseline existing migrations first:
```bash
pnpm --filter @graphsign/db exec prisma migrate resolve --applied 20260916_rest_and_webhooks
pnpm --filter @graphsign/db exec prisma migrate deploy
```

---

### 5. Launch Development Servers

```bash
# Start Web Portal (Next.js)
pnpm dev:web

# In a separate terminal, start API Worker (Hono on Cloudflare Workers)
pnpm dev:api
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

# 4. Run entire Vitest unit & integration test suite (700+ tests)
pnpm test

# 5. Validate production build (Next.js & Hono)
pnpm build
```

---

## 📚 Documentation & Wiki

Comprehensive architecture specs, API guides, compliance checklists, and troubleshooting runbooks are maintained in our central Wiki:

👉 **[Graphsign.ink Knowledge Base & Documentation Wiki](https://github.com/graphomy/graphsign.ink/wiki)**

---

## ⚖️ Compliance & Legal Standards

Graphsign.ink is engineered to comply with major global electronic signature frameworks:

- **United States**: Electronic Signatures in Global and National Commerce Act (**ESIGN**) & Uniform Electronic Transactions Act (**UETA**)
- **European Union**: Electronic Identification, Authentication and Trust Services (**eIDAS** Regulation EU No 910/2014)

---

## 💖 Acknowledgments

Graphsign.ink is built possible thanks to the outstanding infrastructure and developer tooling provided by:

- **[Cloudflare](https://cloudflare.com/)**: For globally distributed, hyper-fast edge execution on Cloudflare Workers, Pages, and R2 storage.
- **[Neon](https://neon.tech/)**: For developer-first serverless PostgreSQL with instant branching, autoscaling, and connection pooling.
- **[Resend](https://resend.com/)**: For clean, modern, and highly deliverable transactional email delivery.
- **[Google Antigravity](https://deepmind.google/)**: For intelligent AI pair-programming, codebase indexing, and autonomous engineering workflows.

---

## 🤝 Contributing

We welcome contributions! Please adhere to our standard Git workflow:

1. Ensure work is linked to a Jira issue under EPIC **INK-249** or a GitHub Issue.
2. Create a branch from `develop`: `feature/<issue-id>-<description>` or `bugfix/<issue-id>-<description>`.
3. Verify all formatting, linting, tests, and builds pass locally.
4. Submit a Pull Request targeting `develop`.

---

## 📜 License

This project is licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).
