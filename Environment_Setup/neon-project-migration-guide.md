# Step-by-Step Guide: Changing the Neon Database Project

This guide outlines the complete process for switching or migrating to a different Neon PostgreSQL project for **graphsign.ink**.

---

## 1. Obtain the New Connection String from Neon

1. Log into your [Neon Console](https://console.neon.tech/).
2. Select your target project.
3. On the **Dashboard**, locate your connection details.
4. Select **Pooled connection** (recommended for serverless environments and Cloudflare Workers).
5. Copy the connection string. It will look like:
   ```text
   postgresql://<user>:<password>@ep-<project>-pooler.<region>.neon.tech/<dbname>?sslmode=require
   ```

---

## 2. Initialize the Database Schema & Seed Data

A new Neon database is empty and requires creating all tables, indexes, and initial configuration.

From your local repository root, run:

```bash
# 1. Push the Prisma schema to generate all database tables, relations, and indexes
DATABASE_URL="<NEW_NEON_DATABASE_URL>" pnpm db:push

# 2. Seed default core RBAC roles and superadmin user
DATABASE_URL="<NEW_NEON_DATABASE_URL>" pnpm --filter @graphsign/db exec tsx prisma/seed.ts
```

> **Note (Optional Data Migration):** If you need to migrate existing data (users, organizations, agreements) from the previous Neon project, export and import using `pg_dump` and `psql`:
>
> ```bash
> pg_dump "<OLD_NEON_DATABASE_URL>" --no-owner --no-privileges | psql "<NEW_NEON_DATABASE_URL>"
> ```

---

## 3. Update GitHub Secrets & Environments

The CI/CD pipeline reads `DATABASE_URL` during deployment to validate connection health and upload secrets to Cloudflare Workers.

1. Navigate to your repository on GitHub.
2. Go to **Settings** → **Secrets and variables** → **Actions**.
3. Update the `DATABASE_URL` secret under:
   - **Environment secrets**: Update within the `development` and/or `production` environments.
   - **Repository secrets**: Update if configured as a global repository secret fallback.

---

## 4. Update Cloudflare Worker Secrets

Choose one of the following methods to apply the new secret to running Cloudflare Workers:

### Option A: Automatic via CI/CD Deployment (Recommended)

- Trigger the **Deploy API** GitHub Actions workflow (or push a commit to `develop` / `main`).
- The deployment workflow will automatically run `wrangler secret bulk` and configure the Worker with the new database URL.

### Option B: Immediate Update via Wrangler CLI

Run the following from your local workspace:

```bash
# For Development API Worker:
pnpm --filter @graphsign/api exec wrangler secret put DATABASE_URL --name dev-graphsign-api

# For Production API Worker:
pnpm --filter @graphsign/api exec wrangler secret put DATABASE_URL --name graphsign-api
```

_(When prompted, paste your new Neon pooled connection string)_

---

## 5. Update Local Development Files (Optional)

To point your local development environment to the new Neon instance:

1. Update `DATABASE_URL` in `packages/db/.env`:
   ```env
   DATABASE_URL="<NEW_NEON_DATABASE_URL>"
   ```
2. Update `DATABASE_URL` in `apps/api/.dev.vars` (for local Wrangler / Hono development):
   ```env
   DATABASE_URL="<NEW_NEON_DATABASE_URL>"
   ```
