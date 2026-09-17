# REST API Reference (FR-016)

This document provides complete technical specifications for the graphsign.ink REST API (`/api/v1`).

---

## 🌐 Base URL & Protocol

- **Local Development**: `http://localhost:8787/api/v1`
- **Transport**: HTTPS required in production environments.
- **Data Format**: `application/json` (UTF-8).

---

## 🔑 Authentication & Headers

Authenticated endpoints require a Bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt-access-token>
Content-Type: application/json
```

---

## 📦 Standard Response Envelopes

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested agreement was not found."
  }
}
```

---

## 📑 Endpoint Categories

### 1. Authentication (`/api/v1/auth`)

- `POST /auth/register` — Create new user account.
- `POST /auth/verify-email` — Verify user email address with token.
- `POST /auth/login` — Sign in and receive JWT token.
- `POST /auth/logout` — Invalidate current session.
- `POST /auth/forgot-password` — Request password reset link.
- `POST /auth/reset-password` — Set new password using reset token.
- `POST /auth/mfa/setup` — Generate TOTP QR code and secret.
- `POST /auth/mfa/verify` — Enable TOTP MFA.
- `POST /auth/mfa/disable` — Disable TOTP MFA.

### 2. Organizations & Teams (`/api/v1/organisations`)

- `GET /organisations/me` — Get organization profile, subscription, and storage usage.
- `PATCH /organisations/me` — Update organization branding and settings.
- `DELETE /organisations/me` — Soft-delete organization.
- `POST /organisations/teams` — Create functional team.
- `GET /organisations/teams` — List teams.
- `POST /organisations/domains` — Register custom domain for DNS verification.
- `GET /organisations/domains` — List custom domains and DNS record status.

### 3. Agreements & Documents (`/api/v1/agreements`)

- `GET /agreements` — List agreements (supports `status`, `isArchived`, `search` query params).
- `POST /agreements/upload` — Upload PDF/DOCX agreement binary.
- `POST /agreements/scratch` — Create agreement from scratch Markdown.
- `GET /agreements/:id` — Retrieve agreement metadata and status.
- `PUT /agreements/:id/draft` — Update draft title or Markdown content.
- `POST /agreements/:id/activate` — Promote draft to active state.
- `POST /agreements/:id/clone` — Clone agreement.
- `POST /agreements/:id/archive` — Archive or unarchive agreement.
- `GET /agreements/:id/file` — Stream document content or PDF binary.
- `GET /agreements/:id/history` — Get change history timeline.
- `PATCH /agreements/:id/tags` — Update metadata tags.

### 4. Visual Fields & Recipient Placement (`/api/v1/agreements/:id/fields`)

- `GET /agreements/:id/fields` — Retrieve placed fields and recipient envelope settings.
- `PUT /agreements/:id/fields` — Save field positions, validations, and recipient mappings.

### 5. Workflow State Machine (`/api/v1/agreements/:id/review` & `/send`)

- `POST /agreements/:id/review/submit` — Submit draft for internal review.
- `POST /agreements/:id/review/approve` — Approve document.
- `POST /agreements/:id/review/reject` — Reject document with feedback notes.
- `POST /agreements/:id/send` — Send agreement for signature (Sequential or Parallel).
- `POST /agreements/:id/cancel` — Void/cancel active envelope.
- `POST /agreements/cron/check-expired` — Background job to auto-expire past deadlines.

### 6. Public Signer Portal (`/api/v1/sign`)

- `GET /sign/:token` — Resolve signer session and view assigned fields.
- `POST /sign/:token/view` — Record recipient viewed beacon.
- `POST /sign/:token/complete` — Submit electronic signature and field values.
- `POST /sign/:token/decline` — Decline signing request.

### 7. Templates (`/api/v1/templates`)

- `GET /templates` — List templates.
- `POST /templates` — Create new template.
- `GET /templates/:id` — Get template details.
- `PUT /templates/:id` — Update template.
- `DELETE /templates/:id` — Archive template.
- `POST /templates/:id/publish` — Publish template for organization use.
- `POST /templates/:id/clone` — Clone template.

### 8. Search & Filter Presets (`/api/v1/search`)

- `GET /search/agreements` — Search agreements by keywords, status, tags, and date ranges.
- `GET /search/templates` — Search template library.
- `GET /search` — Unified global search across agreements, templates, and recipients.
- `GET /search/presets` — Retrieve saved search and filter presets.
- `POST /search/presets` — Save a custom filter preset.
- `DELETE /search/presets/:id` — Delete a saved filter preset.
- `PATCH /search/presets/:id/default` — Set preset as default active view.

### 9. Certificates & Trust Store (`/api/v1/certificates`)

- `GET /certificates` — List organization signing certificates.
- `GET /certificates/default` — Get or auto-provision default certificate.
- `POST /certificates/generate` — Generate a self-signed X.509 certificate with custom subject credentials (CN, O, OU, L, ST, C, EMAIL).
- `POST /certificates/upload` — Import Bring Your Own (BYO) certificate with optional intermediate chain.
- `GET /certificates/:id` — Retrieve certificate details, subject DN, validity, and fingerprint.
- `PUT /certificates/:id/default` — Set certificate as default organization signer.
- `DELETE /certificates/:id` — Revoke signing certificate.
- `GET /certificates/trust-store` — List managed TSA root and intermediate trust entries.
- `POST /certificates/trust-store` — Add custom TSA trust certificate.

### 10. Cryptographic Sealing & PAdES (`/api/v1/signing`)

- `POST /signing/seal/:agreementId` — Cryptographically seal a completed agreement with PAdES B-T, RFC 3161 timestamp, and QR badge.
- `POST /signing/batch` — Batch seal up to 100 agreements in a single atomic transaction.
- `POST /signing/verify` — Authenticated verification of document seal or uploaded PDF.

### 11. Public Verification Portal (`/api/v1/verify`)

- `GET /verify/:token` — Public verification query by token (`GS-xxxxxxxx`), envelope UUID, or agreement ID without authentication.
- `POST /verify/hash` — Public verification query by document SHA-256 hash.
- `POST /verify/file` — Public verification query by uploaded PDF bytes.
- `GET /verify/:token/certificate` — Download Certificate of Authenticity report.

### 12. Cloud Signature Consortium CSC v2.2 (`/csc/v2`)

- `POST /csc/v2/info` — Remote signing service capabilities, supported algorithms, and auth modes.
- `POST /csc/v2/credentials/list` — List remote signing credentials for tenant.
- `POST /csc/v2/credentials/info` — Certificate details, public key, and certificate chain.
- `POST /csc/v2/credentials/authorize` — Issue short-lived Server Authorisation Data (`SAD`) tokens.
- `POST /csc/v2/signatures/signHash` — Remote signature generation on pre-computed hashes.
- `POST /csc/v2/signatures/timestamp` — Issue RFC 3161 timestamp tokens.

### 13. Document CRUD & Lifecycle Adapter (`/api/v1/documents`)

- `POST /documents` — Idempotent document creation from UTF-8 Markdown or Base64 PDF/DOCX.
- `GET /documents` — List documents with cursor/page pagination, status filtering, and search.
- `GET /documents/:id` — Retrieve document DTO with metadata, audit hashes, and MIME type.
- `PUT /documents/:id` — Replace editable draft representation with optimistic revision checks.
- `PATCH /documents/:id` — Partial draft update.
- `DELETE /documents/:id` — Soft-delete agreement and emit `document.deleted` event.
- `GET /documents/:id/file` — Stream document binary content.
- `POST /documents/:id/sign` — Programmatically submit electronic signature and field values.

### 14. Webhooks & Event Delivery (`/api/v1/webhooks`)

- `GET /webhooks/events` — Retrieve canonical event catalogue and schema definitions.
- `GET /webhooks` — List webhook subscriptions for current organization.
- `POST /webhooks` — Create webhook subscription with SSRF validation; returns secret once.
- `GET /webhooks/:id` — Retrieve webhook subscription configuration and key metadata.
- `PATCH /webhooks/:id` — Update subscription URL, event types, rate limits, or status.
- `DELETE /webhooks/:id` — Disable and soft-delete webhook subscription.
- `POST /webhooks/:id/rotate-secret` — Rotate HMAC signing secret with 24-hour grace window.
- `POST /webhooks/:id/test` — Dispatch synthetic test event to verify receiver connectivity.
- `GET /webhooks/:id/metrics` — Aggregate delivery metrics (JSON) or download CSV export.
- `GET /webhooks/:id/dead-letters` — List failed deliveries stored in the 30-day Dead Letter Queue.
- `POST /webhooks/deliveries/:id/replay` — Replay dead-lettered delivery with new generation ID.

### 15. API Client Bindings & Redacted Logs (`/api/v1/organisations/me`)

- `GET /organisations/me/api-clients` — List trusted OAuth2 machine client bindings and scopes.
- `POST /organisations/me/api-clients` — Register new OAuth2 client binding (`ApiClientBinding`).
- `PATCH /organisations/me/api-clients/:id` — Update client binding status or assigned scopes.
- `DELETE /organisations/me/api-clients/:id` — Revoke client binding.
- `GET /organisations/me/api-logs` — Search redacted API request logs with filters and pagination.

### 16. Developer Documentation & Health (`/api/v1`)

- `GET /docs` — Interactive Scalar API documentation console.
- `GET /openapi.json` — Versioned OpenAPI 3.1 specification schema.
- `GET /health` — Sanitized public readiness probe.

> [!TIP]
> For a full architecture breakdown, HMAC signature verification code snippets, and retry flowcharts, see the **[Webhooks & REST API Integration Guide](Webhooks-and-REST-API-Integration.md)**.
