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
* `POST /auth/register` — Create new user account.
* `POST /auth/verify-email` — Verify user email address with token.
* `POST /auth/login` — Sign in and receive JWT token.
* `POST /auth/logout` — Invalidate current session.
* `POST /auth/forgot-password` — Request password reset link.
* `POST /auth/reset-password` — Set new password using reset token.
* `POST /auth/mfa/setup` — Generate TOTP QR code and secret.
* `POST /auth/mfa/verify` — Enable TOTP MFA.
* `POST /auth/mfa/disable` — Disable TOTP MFA.

### 2. Organizations & Teams (`/api/v1/organisations`)
* `GET /organisations/me` — Get organization profile, subscription, and storage usage.
* `PATCH /organisations/me` — Update organization branding and settings.
* `DELETE /organisations/me` — Soft-delete organization.
* `POST /organisations/teams` — Create functional team.
* `GET /organisations/teams` — List teams.
* `POST /organisations/domains` — Register custom domain for DNS verification.
* `GET /organisations/domains` — List custom domains and DNS record status.

### 3. Agreements & Documents (`/api/v1/agreements`)
* `GET /agreements` — List agreements (supports `status`, `isArchived`, `search` query params).
* `POST /agreements/upload` — Upload PDF/DOCX agreement binary.
* `POST /agreements/scratch` — Create agreement from scratch Markdown.
* `GET /agreements/:id` — Retrieve agreement metadata and status.
* `PUT /agreements/:id/draft` — Update draft title or Markdown content.
* `POST /agreements/:id/activate` — Promote draft to active state.
* `POST /agreements/:id/clone` — Clone agreement.
* `POST /agreements/:id/archive` — Archive or unarchive agreement.
* `GET /agreements/:id/file` — Stream document content or PDF binary.
* `GET /agreements/:id/history` — Get change history timeline.
* `PATCH /agreements/:id/tags` — Update metadata tags.

### 4. Visual Fields & Recipient Placement (`/api/v1/agreements/:id/fields`)
* `GET /agreements/:id/fields` — Retrieve placed fields and recipient envelope settings.
* `PUT /agreements/:id/fields` — Save field positions, validations, and recipient mappings.

### 5. Workflow State Machine (`/api/v1/agreements/:id/review` & `/send`)
* `POST /agreements/:id/review/submit` — Submit draft for internal review.
* `POST /agreements/:id/review/approve` — Approve document.
* `POST /agreements/:id/review/reject` — Reject document with feedback notes.
* `POST /agreements/:id/send` — Send agreement for signature (Sequential or Parallel).
* `POST /agreements/:id/cancel` — Void/cancel active envelope.
* `POST /agreements/cron/check-expired` — Background job to auto-expire past deadlines.

### 6. Public Signer Portal (`/api/v1/sign`)
* `GET /sign/:token` — Resolve signer session and view assigned fields.
* `POST /sign/:token/view` — Record recipient viewed beacon.
* `POST /sign/:token/complete` — Submit electronic signature and field values.
* `POST /sign/:token/decline` — Decline signing request.

### 7. Templates (`/api/v1/templates`)
* `GET /templates` — List templates.
* `POST /templates` — Create new template.
* `GET /templates/:id` — Get template details.
* `PUT /templates/:id` — Update template.
* `DELETE /templates/:id` — Archive template.
* `POST /templates/:id/publish` — Publish template for organization use.
* `POST /templates/:id/clone` — Clone template.
