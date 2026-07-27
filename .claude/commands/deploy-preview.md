# /deploy-preview Command

Deploy a preview build to Cloudflare Pages.

## Usage

```
/deploy-preview
```

## Steps

1. Verify all CI checks pass:
   - [ ] Lint passes
   - [ ] Type-check passes
   - [ ] Unit tests pass
   - [ ] No secrets in code

2. Build the frontend:
   ```
   cd apps/web && npm run build
   ```

3. Deploy to Cloudflare Pages preview:
   ```
   npx wrangler pages deploy apps/web/.next --project-name graphsign-preview
   ```

4. If API changes exist, deploy Workers preview:
   ```
   cd apps/api && npx wrangler deploy --env preview
   ```

5. Output the preview URL

## Prerequisites

- Cloudflare account configured in wrangler
- `CLOUDFLARE_API_TOKEN` available
- Build completes without errors

## Output

- Preview URL for the deployed frontend
- Worker URL if API was deployed
- Build status and any warnings
