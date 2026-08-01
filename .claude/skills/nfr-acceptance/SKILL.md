# NFR Acceptance Skill

Test non-functional requirements for graphsign.ink.

## Context

See `docs/nfr-stories.md` for the full NFR list and targets.

## Performance Tests

### Page Load (< 2 seconds)
```bash
# Lighthouse CI
npx @lhci/cli autorun --collect.url=<URL> --assert.preset=desktop
```
- Assert: Performance score ≥ 90
- Assert: First Contentful Paint < 1.5s
- Assert: Largest Contentful Paint < 2.0s

### API Response (< 300ms average)
```typescript
// k6 load test
import http from 'k6/http';
export const options = { thresholds: { http_req_duration: ['p(95)<500', 'avg<300'] } };
```

### Bundle Size (< 500KB)
```bash
npx next-bundle-analyzer
```

## Security Tests

### Tenant Isolation
- Authenticate as Tenant A
- Attempt to access Tenant B's resources
- Assert: 403 or 404 (never data leakage)

### Rate Limiting
- Send requests exceeding rate limit
- Assert: 429 with `Retry-After` header

### Input Validation
- Send malformed payloads
- Assert: 400 with structured error response

## Accessibility Tests

```bash
npx playwright test --grep @a11y
```

Using axe-core:
- Assert: Zero critical violations
- Assert: Zero serious violations
- Assert: Color contrast ratio ≥ 4.5:1

## Compliance Tests

### Audit Chain Integrity
- Create a sequence of business actions
- Verify hash chain is intact
- Attempt to modify an audit record
- Assert: Modification detected

### Document Tamper-Evidence
- Seal a document
- Modify a byte in the sealed PDF
- Verify the signature shows as invalid
