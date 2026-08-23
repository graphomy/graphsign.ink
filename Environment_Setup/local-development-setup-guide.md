# Local Development Setup Guide

This guide provides end-to-end instructions for configuring, running, and troubleshooting **graphsign.ink** in a local development environment.

---

## 1. System Prerequisites

Ensure the following tools are installed on your machine:

- **Node.js**: `v20.0.0` or higher (LTS recommended)
- **pnpm**: `v9.0.0` or higher (`npm install -g pnpm`)
- **PostgreSQL**: PostgreSQL 15+ database (either local PostgreSQL or a cloud [Neon](https://neon.tech) instance)
- **Git**: `v2.30` or higher

---

## 2. Installation & Workspace Setup

Clone the repository and install all monorepo dependencies:

```bash
git clone https://github.com/graphomy/graphsign.ink.git
cd graphsign.ink
pnpm install
```

---

## 3. Environment & Secret Configuration

The application requires environment configuration for three packages. **All local secret files are ignored by git and will never be committed to GitHub.**

### 3.1 Database Environment (`packages/db/.env`)

Create `packages/db/.env` (or copy from `.env.example` in repository root):

```env
# Direct/Pooled PostgreSQL connection string
DATABASE_URL="postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### 3.2 Backend API Secrets (`apps/api/.dev.vars`)

Cloudflare Workers running via Wrangler read local secrets from `apps/api/.dev.vars`. Create `apps/api/.dev.vars` (copy from `apps/api/.dev.vars.example`):

```env
# Must match the DATABASE_URL configured in packages/db/.env
DATABASE_URL="postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require&channel_binding=require"

# Secure random JWT signing secret (min 32 characters)
JWT_SECRET="generate-a-secure-random-string-at-least-32-chars"

# Optional: Resend API key for sending live transactional emails
# If left empty (""), verification links and emails will print directly to the API terminal console
RESEND_API_KEY=""
```

> **Tip (Generating a Secure JWT Secret):**
> Run the following in your terminal:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

> [!IMPORTANT]
> **Database Alignment**: Ensure the `DATABASE_URL` in `packages/db/.env` and `apps/api/.dev.vars` point to the **exact same database**.

### 3.3 Frontend Web App (`apps/web/.env.local` - Optional)

By default, Next.js connects to `http://localhost:8787` for local development. If needed, create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://localhost:8787"
```

---

## 4. Database Synchronization & Prisma Generation

Generate Prisma client types and synchronize the schema with your database:

```bash
# 1. Generate Prisma Client
pnpm db:generate

# 2. Push schema to database
pnpm db:push
```

---

## 5. Starting Local Development Servers

Run the backend API worker and the Next.js frontend in separate terminal windows:

### Terminal 1 — Backend API (Cloudflare Worker on Hono)

```bash
pnpm dev:api
```

- **Service URL**: `http://localhost:8787`
- **Health Check**: `http://localhost:8787/health`

### Terminal 2 — Frontend Web App (Next.js App Router)

```bash
pnpm dev:web
```

- **Web UI**: `http://localhost:3000`

---

## 6. Authentication & User Flow in Development

1. Navigate to `http://localhost:3000/register`.
2. Fill in email and password to create an account.
3. **Verify Email**:
   - If `RESEND_API_KEY` is configured: Check your email inbox and click "Verify Email".
   - If `RESEND_API_KEY` is empty: Look at the `pnpm dev:api` terminal log. Find the output line starting with `[MAILER] Verify URL:`:
     ```text
     [MAILER] Verify URL: http://localhost:3000/verify-email?token=...
     ```
     Copy and open that link in your browser to activate the account.
4. Sign in at `http://localhost:3000/login`.

---

## 7. Common Pitfalls & Troubleshooting

### Issue 1: "Unable to connect to the server. Please try again later."

- **Cause**: The frontend cannot reach the backend API worker at `http://localhost:8787`.
- **Solution**: Ensure `pnpm dev:api` is running in an active terminal window.

### Issue 2: `401 Unauthorized: Please verify your email address before logging in.`

- **Cause**: Newly registered accounts start in `pending_verification` status until the verification link is visited.
- **Solution**: Open the verification URL (sent via email or logged in the `dev:api` console) before attempting to log in.

### Issue 3: "Port 3000 is in use by process..." or "Another next dev server is already running"

- **Cause**: A previous `next dev` instance is already running in the background.
- **Solution**: Either use the already active server at `http://localhost:3000`, or terminate the PID:
  ```powershell
  # Windows PowerShell
  taskkill /PID <PID> /F
  pnpm dev:web
  ```

---

## 8. Quality Checks & Test Commands

Before committing code or opening a Pull Request, run the local verification suite:

```bash
# Type check across all monorepo packages
pnpm typecheck

# Run unit and integration tests
pnpm test

# Check code formatting (Prettier)
pnpm format:check

# Format code automatically
pnpm format

# Production build check
pnpm build
```
