# Cloudflare Deploy Skill

Deploy graphsign.ink to Cloudflare Pages + Workers + R2.

## Context

See `docs/tech-stack.md` and `docs/architecture.md` § Deployment Topology for full details.

## Prerequisites

- Cloudflare account with API token
- wrangler CLI installed (`npm install -g wrangler`)
- R2 bucket created
- Neon Postgres database provisioned

## Deploy Frontend (Cloudflare Pages)

```bash
cd apps/web
npm run build
npx wrangler pages deploy .next --project-name graphsign
```

## Deploy API (Cloudflare Workers)

```bash
cd apps/api
npx wrangler deploy
```

### Wrangler Config (`wrangler.toml`)

```toml
name = "graphsign-api"
main = "src/index.ts"
compatibility_date = "2026-07-01"

[[r2_buckets]]
binding = "DOCUMENTS"
bucket_name = "graphsign-documents"

[[queues.producers]]
binding = "NOTIFICATION_QUEUE"
queue = "graphsign-notifications"

[vars]
ENVIRONMENT = "production"
```

## Environment Secrets

Set via `wrangler secret put`:

- `NEON_DATABASE_URL`
- `R2_ACCESS_KEY`, `R2_SECRET`
- `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET`
- `SIGNING_SERVICE_URL`, `SERVICE_TOKEN`
- `RESEND_API_KEY`
- `SENTRY_DSN`

## Validation

After deployment:

1. Verify Pages URL loads the frontend
2. Verify Workers API responds to health check
3. Verify R2 connectivity (upload/download test)
4. Verify Neon database connectivity
