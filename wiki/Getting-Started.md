# Getting Started with graphsign.ink

This guide provides step-by-step instructions for cloning, configuring, building, running, and developing with graphsign.ink.

---

## 📑 Documentation Table of Contents

### 1. System Architecture & Foundation

- **[Home](Home.md)** — Project overview, mission, architectural pillars, and technology stack
- **[Getting Started](Getting-Started.md)** — System prerequisites, local setup, and developer guide
- **[Security & Immutable Audit Trail](Security-and-Audit-Trail.md)** — Hash-chained audit logs, token hashing, and compliance

### 2. Feature & Domain Guides

- **[Authentication & Identity Management](Authentication-and-Identity.md)** — User registration, email verification, TOTP MFA, JWT sessions
- **[Organization & Multi-Tenancy](Organization-and-Tenancy.md)** — Tenant boundaries, teams, custom domains, storage quotas, RBAC
- **[Agreement & Document Management](Agreement-Management.md)** — PDF/DOCX uploads, Markdown scratch editor, semantic versioning, change history
- **[Visual Document Editor & Field Placement](Document-Editor-and-Fields.md)** — Multi-page canvas, drag & drop field palette, recipient assignment, validation, preview mode
- **[Workflow Engine & Signer Portal](Workflow-Engine-and-Signer-Portal.md)** — Review workflows, sequential/parallel routing, tokenized signer portal, conditional logic engine
- **[Template Management](Template-Management.md)** — Reusable contract templates, publishing governance, instantiation
- **[Cryptographic Signing & Verification](Cryptographic-Signing-and-Verification.md)** — PAdES B-T/B-LTA document sealing, BYO/self-signed certificates, RFC 3161 timestamps, CSC v2.2, public verification portal

### 3. Developer & Integration References

- **[REST API Reference](REST-API-Reference.md)** — Complete API endpoints, request/response formats, authentication, error handling

---

## 📋 System Prerequisites

Ensure you have the following installed on your local development machine:

- **Node.js**: v18.0.0 or higher (v20+ LTS recommended)
- **pnpm**: v9.0.0 or higher (`npm install -g pnpm`)
- **PostgreSQL**: v15 or higher (or cloud PostgreSQL such as Neon)
- **Git**: v2.30 or higher

---

## 🚀 Quick Start Guide

### 1. Clone the Repository

```bash
git clone https://github.com/graphomy/graphsign.ink.git
cd graphsign.ink
```

### 2. Install Monorepo Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

Copy the example environment configuration file to `.env`:

```bash
cp .env.example .env
```

Configure your local environment variables in `.env`:

```env
# Database Connection URL (PostgreSQL 15+)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/graphsign?schema=public"

# Public API URL (Hono Cloudflare Worker)
NEXT_PUBLIC_API_URL="http://localhost:8787"

# Mailer Configuration (Leave blank for console logging in development)
RESEND_API_KEY=""
EMAIL_FROM="noreply@example.com"

# Web App URL
WEB_URL="http://localhost:3000"
```

### 4. Database Setup & Prisma Client Generation

```bash
# Generate Prisma Client types
pnpm --filter @graphsign/db exec prisma generate

# Push schema changes to your database
pnpm --filter @graphsign/db exec prisma db push
```

### 5. Running the Application Locally

#### Run All Services (Full Stack)

```bash
pnpm dev
```

#### Run Services Individually

- **API Worker Service (Hono on Cloudflare Worker)**:

  ```bash
  pnpm --filter @graphsign/api dev
  ```

  _Running at [http://localhost:8787](http://localhost:8787)_

- **Web Frontend (Next.js App Router)**:
  ```bash
  pnpm --filter @graphsign/web dev
  ```
  _Running at [http://localhost:3000](http://localhost:3000)_

---

## 🧪 Testing & Validation Commands

Run tests and verification checks across the entire monorepo:

```bash
# Run all unit and integration test suites
pnpm test

# Run test suites with interactive UI
pnpm --filter @graphsign/api test
pnpm --filter @graphsign/web test

# Run ESLint across all workspace packages
pnpm lint

# Run full production build and type checking
pnpm build
```
