# API Standards

> Source of truth: [Confluence — Security Architecture and API Standards](https://graphomy.atlassian.net/wiki/spaces/INK/pages/852307)

## Architecture

REST — resource-oriented, standard HTTP methods, consistent response formats.

## Versioning

URI versioning: `/api/v1/`

Optional header: `Accept: application/vnd.graphsign.v1+json`

No breaking changes within major version. Minimum 6 months deprecation period.

## Resource Names

Plural: `/documents`, `/templates`, `/users`, `/envelopes`, `/signatures`

## HTTP Methods

| Method | Usage |
|---|---|
| GET | Retrieve resources |
| POST | Create resources |
| PUT | Update/replace resources (idempotent) |
| PATCH | Partial updates |
| DELETE | Remove resources (idempotent) |

## Authentication

- **API Keys:** Scoped to organisation, rate-limited, revocable
- **OIDC Tokens:** Zitadel-issued JWTs with standard claims
- **SAML Tokens:** Enterprise (V2+)

Every request validated for tenant isolation and required scopes.

## Status Codes

| Code | Usage |
|---|---|
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (auth failed) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 405 | Method Not Allowed |
| 409 | Conflict (state conflict) |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error (never expose details) |
| 503 | Service Unavailable (maintenance mode) |

## Error Format

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Human-readable error message",
    "details": {
      "field": "field_name",
      "issue": "specific_issue"
    },
    "timestamp": "2026-07-18T12:00:00Z",
    "requestId": "unique-request-identifier",
    "path": "/api/v1/resource"
  }
}
```

Every error includes a `requestId` for tracing and support.

## Rate Limiting

| Endpoint | Limit |
|---|---|
| Authentication | 10 req/min per IP |
| Signing | 5 req/min per user |
| General API | 100 req/min per API key |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` (on 429).

## Pagination

Cursor-based: `?cursor=<token>&limit=25`

## Filtering

`?status=draft&createdAfter=2026-01-01`

## Sorting

`?sort=created_at&order=desc`

## Webhooks

Available in Growth+ and OSS self-host.

### Events

`document.created`, `document.sent`, `document.signed`, `document.completed`, `document.declined`, `document.expired`, `user.created`, `user.updated`

### Delivery

- HTTP POST with JSON payload
- HMAC-SHA256 signature verification
- Retry with exponential backoff
- Dead letter queue for failures

### Payload Format

```json
{
  "event": "document.signed",
  "timestamp": "2026-07-18T12:00:00Z",
  "data": {
    "documentId": "doc_123",
    "organizationId": "org_456"
  },
  "signature": "hmac-sha256-signature"
}
```

## API Surface (Conceptual)

| Area | Example Operations |
|---|---|
| Envelopes | Create, add document, place fields, assign recipients, send, void |
| Templates | Create, list, instantiate |
| Signing | Open magic link, fill fields, decline, complete |
| Documents | Download source, download sealed, completion certificate |
| Certificates | Configure self-signed, import BYO, select QTSP-CSC |
| Webhooks | Subscribe, list, verify |
| Admin | Users, roles, SSO, retention policy, usage |
| Super-Admin | Tenants, health, maintenance mode, feature flags |

## OpenAPI

Every endpoint documented. Use Scalar/Swagger UI for interactive docs.

## AI Rules

Never create undocumented endpoints. Always include request validation (Zod), error handling, and rate limiting.