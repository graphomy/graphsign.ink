# Getting Started with graphsign.ink

This guide provides step-by-step instructions for cloning, configuring, building, and running graphsign.ink locally on your computer.

---

## 📋 System Prerequisites

Before starting, ensure you have the following installed on your machine:

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **pnpm**: v9.0.0 or higher (`npm install -g pnpm`)
- **PostgreSQL**: v15 or higher (or a cloud PostgreSQL instance such as Neon Postgres)
- **Git**: v2.30 or higher

---

## 🚀 Quick Start Guide

### 1. Clone the Repository

Clone the project repository from GitHub and navigate into the project directory:

```bash
git clone https://github.com/graphomy/graphsign.ink.git
cd graphsign.ink
```

### 2. Install Monorepo Dependencies

Install workspace dependencies across all applications and packages using `pnpm`:

```bash
pnpm install
```

### 3. Environment Configuration

Copy the example environment configuration file to `.env`:

```bash
cp .env.example .env
```

Open `.env` in your code editor and update the database URL and API settings:

```env
# Database Connection URL (PostgreSQL 15+)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/graphsign?schema=public"

# Public API URL (Hono Worker)
NEXT_PUBLIC_API_URL="http://localhost:8787"

# Mailer Configuration (Optional: Leave blank to print email links to console in dev)
RESEND_API_KEY=""
EMAIL_FROM="noreply@graphsign.ink"

# Web App URL
WEB_URL="http://localhost:3000"
```

### 4. Database Setup & Prisma Schema Generation

Initialize the Prisma Client and sync the database schema with your local PostgreSQL database:

```bash
# Generate Prisma Client types
pnpm --filter @graphsign/db exec prisma generate

# Push the schema to your local database
pnpm --filter @graphsign/db exec prisma db push
```

### 5. Running the Application Locally

#### Option A: Run All Services Simultaneously
To start both the API worker service and the Next.js web application together:

```bash
pnpm dev
```

#### Option B: Run Services Individually

- **API Worker Service (Hono on Cloudflare Worker)**:
  ```bash
  pnpm --filter @graphsign/api dev
  ```
  *The API server will run at [http://localhost:8787](http://localhost:8787).*

- **Web App (Next.js App Router)**:
  ```bash
  pnpm --filter @graphsign/web dev
  ```
  *The Web frontend will run at [http://localhost:3000](http://localhost:3000).*

---

## 🧪 Testing & Code Quality

### Running Automated Unit & Integration Tests

Run test suites across the monorepo using Vitest:

```bash
pnpm test
```

### Running Frontend Linting

Validate code style and TypeScript rules in the frontend:

```bash
pnpm --filter @graphsign/web lint
```

### Building for Production

Test building all production bundles:

```bash
# Build Next.js application
pnpm --filter @graphsign/web build
```

---

## 📂 Repository Layout Reference

```
graphsign.ink/
├─ apps/
│  ├─ web/          # Next.js 14+ (Cloudflare Pages / Node) — editor, signer, dashboards
│  └─ api/          # Hono on Workers — REST API, workflow engine, webhooks
├─ services/
│  ├─ signing/      # JVM (EU DSS / PDFBox) — CSC PAdES sealing service
│  └─ workers/      # Node queue consumer workers
├─ packages/
│  ├─ db/           # Prisma schema, RLS policies & migrations
│  └─ sdk/          # API client and TypeScript definitions
├─ infra/           # Docker Compose & Cloudflare configs
└─ wiki/            # GitHub Wiki documentation pages
```

---

## ❓ Troubleshooting & Support

- **Prisma Client module error**: If you encounter `.prisma/client` missing errors, run `pnpm --filter @graphsign/db exec prisma generate`.
- **Port Conflicts**: Ensure ports `3000` (Next.js) and `8787` (Wrangler/Hono) are free.
