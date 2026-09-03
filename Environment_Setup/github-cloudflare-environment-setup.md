# Comprehensive Guide: Setting Up a New Environment in GitHub & Cloudflare

This guide provides end-to-end instructions for configuring a new deployment environment (e.g., **Development**, **Staging**, or **Production**) across **GitHub** and **Cloudflare** for **graphsign.ink**.

---

## 1. Cloudflare Setup

### 1.1 Obtain Cloudflare Account ID

1. Log into your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. On the right-hand sidebar of any page or under **Workers & Pages**, find and copy your **Account ID**.

### 1.2 Generate Cloudflare API Token

1. Go to **My Profile** → **API Tokens** → **Create Token**.
2. Click **Use template** next to **Edit Cloudflare Workers** (or create a Custom Token).
3. Ensure the token includes the following permissions:
   - `Account` → `Workers Scripts` → `Edit`
   - `Account` → `Cloudflare Pages` → `Edit`
   - `Account` → `Account Settings` → `Read`
   - `Zone` → `Workers Routes` → `Edit` _(if using custom domain routes)_
4. Under **Account Resources**, select **Include** → `All Accounts` (or your specific account).
5. Click **Continue to summary** → **Create Token**.
6. Copy and store the token safely (it won't be shown again).

### 1.3 Cloudflare Pages Project (Web App)

1. In Cloudflare Dashboard, go to **Compute (Workers & Pages)** → **Create** → **Pages** tab.
2. Select **Upload Assets** (or create direct project):
   - Project Name:
     - Development: `dev-graphsign-web`
     - Production: `graphsign-web`
     - Staging (if used): `staging-graphsign-web`
3. Under Project Settings:
   - **Framework preset**: `Next.js (Static HTML Export)`
   - **Build output directory**: `.vercel/output/static`

### 1.4 Cloudflare Workers Project (API)

The Worker is automatically deployed by Wrangler during CI/CD with naming conventions:

- Development: `dev-graphsign-api`
- Production: `graphsign-api`
- Staging (if used): `staging-graphsign-api`

---

## 2. GitHub Repository Configuration

### 2.1 Create the Environment in GitHub

1. In your GitHub repository, go to **Settings** → **Environments**.
2. Click **New environment** and enter the environment name:
   - `development` (for `develop` branch)
   - `production` (for `main` branch)
   - `staging` (if applicable)
3. _(Optional)_ Configure Deployment Protection Rules (e.g., required reviewers for `production`).

---

### 2.2 Configure Environment Secrets

In **Settings** → **Environments** → Click your environment → **Environment secrets** → **Add secret**:

| Secret Name             | Description                                                  | Example / Format                                                               |
| :---------------------- | :----------------------------------------------------------- | :----------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API Token created in Step 1.2                     | `v1.0-...`                                                                     |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID from Step 1.1                          | `a1b2c3d4e5f6...`                                                              |
| `DATABASE_URL`          | Neon PostgreSQL pooled connection string with SSL            | `postgresql://user:pass@ep-xyz-pooler.region.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET`            | 32+ character cryptographically secure secret for JWT tokens | `openssl rand -base64 48`                                                      |
| `RESEND_API_KEY`        | API Key from Resend for transactional email delivery         | `re_123456789...`                                                              |

> **Tip (Generating a Secure JWT Secret):**
> Run `openssl rand -base64 48` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in your terminal.

---

### 2.3 Configure Environment Variables

In **Settings** → **Environments** → Click your environment → **Environment variables** → **Add variable**:

| Variable Name         | Description                                     | Example / Format                                                                   |
| :-------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Base URL of the API Worker for this environment | `https://dev-graphsign-api.<subdomain>.workers.dev` or `https://api.graphsign.ink` |

---

## 3. External Services & Email Setup (Resend)

The application uses **Resend** for email verification, invitation emails, and audit notifications.

1. Log into [Resend.com](https://resend.com/).
2. Go to **Domains** → **Add Domain** (e.g., `mail.graphsign.ink` or `mail.graphomy.com`).
3. Add the required DNS records (SPF, DKIM, DMARC, MX) in your DNS provider (Cloudflare DNS).
4. Verify the domain status changes to **Verified**.
5. Go to **API Keys** → **Create API Key** → Set permission to `Sending access`.
6. Copy the key and save it as `RESEND_API_KEY` in GitHub Secrets.

---

## 4. CORS & Environment Variable Alignment

To ensure the frontend Web App can communicate with the backend Worker API without CORS errors:

In `apps/api/wrangler.toml` (or via Cloudflare Dashboard / GitHub deployment variables), ensure `WEB_URL` includes the frontend origin:

```toml
[vars]
EMAIL_FROM = "notification@mail.graphomy.com"
# Development:
WEB_URL = "https://dev.graphsign.ink,https://dev-graphsign-web.pages.dev,http://localhost:3000"
# Production:
# WEB_URL = "https://graphsign.ink,https://www.graphsign.ink,https://graphsign-web.pages.dev,http://localhost:3000"
API_URL = "https://dev-graphsign-api.<account>.workers.dev"
NODE_ENV = "development" # or "production"
JWT_ACCESS_TOKEN_EXPIRY = "15m"
```

---

## 5. Deployment Verification & Testing

### 5.1 Triggering Deployment

Pushing to the target branch will automatically trigger the respective workflows:

- `push` to `develop` → deploys to `development` environment (`dev-graphsign-api` & `dev-graphsign-web`).
- `push` to `main` → deploys to `production` environment (`graphsign-api` & `graphsign-web`).

### 5.2 Verification Checklist

1. **API Health & Version Check**:

   ```bash
   curl -I https://<your-api-worker>.workers.dev/api/v1/agreements
   ```

   _(Should return `401 Unauthorized` expecting JWT, proving the API is alive and routing correctly)._

2. **Web App Frontend Check**:
   - Open `https://<your-pages-project>.pages.dev/login`.
   - Test login / registration flow.
   - Verify that API calls in browser Network tab succeed without CORS errors.

3. **Email Delivery**:
   - Register a new test user or trigger a password reset.
   - Confirm verification email is delivered via Resend.
