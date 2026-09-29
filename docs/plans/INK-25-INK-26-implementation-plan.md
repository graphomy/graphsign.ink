# Implementation handoff: INK-25 REST APIs and INK-26 Webhooks

Prepared 2026-09-16 against repository commit `789b30f`, including the working tree visible on that date. This document is an implementation specification, not a report of completed implementation.

## 1. Assignment and source of truth

Implement every child story of [INK-25 — FR-016 REST APIs](https://graphomy.atlassian.net/browse/INK-25) and [INK-26 — FR-017 Webhooks](https://graphomy.atlassian.net/browse/INK-26). The complete Jira hierarchy contains **20 stories: INK-146–INK-155 and INK-156–INK-165**. All were To Do; none had nested subtasks, comments, or explicit issue links. Do not mistake the empty Jira `subtasks` field on the epics for an absence of child stories.

The accompanying [requirements snapshot](./INK-25-INK-26-requirements-snapshot.md) preserves all child descriptions and the two PRDs so this handoff can be used without Jira access. Source PRDs: [REST APIs, version 2](https://graphomy.atlassian.net/wiki/spaces/INK/pages/753792/FR-016+REST+APIs) and [Webhooks, version 2](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1376257/FR-017+Webhooks).

Use child-story acceptance criteria as the implementation checklist, supplement them with parent/PRD requirements, and use the explicit resolutions below where sources disagree. Proposed choices in this plan are distinguished from source requirements. Re-fetch Jira before starting if available; document material changes rather than silently changing scope.

### Instructions for the implementing agent

1. Read `CLAUDE.md`, relevant `.claude/docs/` standards, and applicable `AGENTS.md` files. For frontend work, read `apps/web/AGENTS.md` and the installed Next.js documentation it requires.
2. Inspect the current branch and working tree. At preparation time the branch was `feature/INK-287-super-administration`, with existing edits to `apps/api/src/index.ts`, admin routes/tests/validators, and `packages/db/prisma/schema.prisma`; untracked maintenance, feature-flag, and health services/routes were present. Preserve them. Use an isolated checkout from the agreed base where appropriate; do not reset, stash, commit, or overwrite someone else's work automatically.
3. Follow the dependency sequence in section 8. Keep routes thin, share domain services, inject adapters for tests, and retain existing browser behavior.
4. Implement code, migrations, tests, documentation, SDK generation, and operational configuration. Do not mark a story done on the basis of mocked unit tests alone when it requires database isolation, a running queue, an IdP, or package publication.
5. Record per-story files changed, acceptance tests, test results, and remaining external setup. Do not merge your own PRs. Deployment and publication need the required environment access and authorization; prepare concrete artifacts first.

All file paths below are repository-relative so this document remains portable.

## 2. Verified baseline and gaps

| Area            | What exists                                                                                                                                                                       | Implementation consequence                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API runtime     | Hono route factories under `apps/api/src/routes`; Worker entry `src/index.ts`; `/api/v1` prefix                                                                                   | Extend the existing app; do not introduce another API framework.                                                                                           |
| Dependencies    | Actual manifests use Hono `^4.13.5`, Zod `^4.4.3`, jose `^6.2.10`, Vitest `^4.1.11`, Prisma `^7.10.0`                                                                             | Trust installed code/manifests over older README version claims.                                                                                           |
| Documents       | `Agreement` is the persisted document/workflow aggregate; `AgreementService` supports upload, scratch, reads, draft edits, metadata, versions, clone, archive, soft delete        | Add a public document adapter over this aggregate. Do not add a second Document table or duplicate state machine.                                          |
| Routes          | `/agreements/upload`, `/scratch`, `/:id`, `/:id/draft`, `/:id/metadata`, versions/history/file routes                                                                             | Preserve current routes and response bodies; add the Jira-required `/documents` contract.                                                                  |
| Templates/audit | `routes/templates.ts`, `TemplateService`; `/organisations/me/audit-logs`, agreement history                                                                                       | Reuse and harden these for FR-016.004/.005. They must not disappear because Jira child titles emphasize document CRUD.                                     |
| Auth            | Local HS256 JWTs, `jwtAuth`, static RBAC, tenant status middleware                                                                                                                | OAuth2 and refresh flow need implementation. JWT verifier does not currently require all claims; middleware does not enforce durable revocation.           |
| Auth hazards    | Routes use `default-org-id`/`unknown` fallbacks; auth middleware wraps `await next()` in its authentication catch; super-admin shortcuts and optional identity checks exist       | Fail closed on missing context; preserve downstream status codes; explicitly restrict service principals and tenant content access.                        |
| Rate limiting   | Per-process in-memory fixed-window map; disabled in test mode                                                                                                                     | Replace with shared durable enforcement and test the real algorithm. Worker instances cannot share this map.                                               |
| Audit           | `PrismaAuditService` reads the latest tenant hash, then inserts; domain operations often write state and audit separately                                                         | Add transaction-aware audit writes and serialization for concurrent append operations before relying on atomic events. Preserve historical hashes.         |
| Signing         | `WorkflowService.submitRecipientSignature` saves signature, marks COMPLETED, then attempts sealing and catches seal errors                                                        | A completed webhook cannot simply be appended to this method: introduce a recoverable completion job and emit only after required output is durably ready. |
| Health          | `/health` is liveness only; working-tree `PlatformHealthService` and admin health endpoint exist                                                                                  | Reuse the service while providing sanitized public readiness and real failure status codes.                                                                |
| Storage/jobs    | No webhook, idempotency, or refresh models in inspected schema; no queue/cron bindings in inspected `wrangler.toml`; no checked-in SQL migration files found by repository search | Establish migration baseline safely, add durable models, and configure real workers. Do not use `db push` against production.                              |
| Test tooling    | API/web Vitest suites; API lint command and DB test command are placeholders                                                                                                      | Add real DB integration coverage and necessary scripts; a placeholder exit code is not validation.                                                         |

## 3. Resolve requirements before introducing contracts

These are concrete proposed defaults for implementation. Record them in an ADR and contract tests. Only external credentials, unavailable infrastructure, or a material newly discovered conflict should block the affected phase.

| Conflict or ambiguity                                                                                                                 | Implementation resolution                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INK-146 title says “Route Documents to Approvers Based on Predefined Rules,” but its entire description is API contracts              | Implement its description and acceptance criteria: OpenAPI and interactive docs. Preserve the original title in traceability; report the title mismatch without inventing approval-routing work.                                                                                                           |
| Parent epics list FR story labels that differ from actual Jira children; Webhooks PRD expands five parent bullets into ten FR stories | Implement all 20 Jira children and cover all parent/PRD behavior using the mapping in section 9.                                                                                                                                                                                                           |
| `/documents` in Jira vs `/agreements` in code                                                                                         | Add `/api/v1/documents` as a DTO adapter around `AgreementService`; the same UUID identifies both. Existing `/agreements` contracts remain supported.                                                                                                                                                      |
| PUT replacement vs existing draft PATCH                                                                                               | PUT replaces the editable document representation, not server-controlled state. Require name and source/content fields for replacement; optional editable fields omitted by PUT reset to documented defaults. PATCH remains partial. Neither can set tenant, author, status, signatures, or seal metadata. |
| Mixed error examples (`error` string, `error_code`, standard nested object)                                                           | Keep the repository's nested `error` object as canonical. Use stable `error.code`; document how it represents story examples. Do not replace existing error shapes with strings.                                                                                                                           |
| Page pagination in Jira vs cursor pagination in local standards                                                                       | Keep page/limit for `/documents` and existing routes; additionally support cursor mode for integration lists. Reject requests mixing page and cursor. Share limits, filters, deterministic ordering, and DTOs.                                                                                             |
| Multiple versions vs no specified v2 feature                                                                                          | Provide separate v1/v2 router/serializer boundaries. Ship a minimal documented v2 document CRUD surface with the same initial semantics, independently contract-tested. `/api/documents` defaults to v1; `/api/v3/...` returns `VERSION_NOT_SUPPORTED`. Never rewrite non-API paths or CSC version paths.  |
| Deprecation example names 2026-12-31, but local policy requires six months                                                            | Do not adopt the example date. Add configurable deprecation headers only for actually deprecated endpoints, with at least six months' notice; test with a fixture date.                                                                                                                                    |
| Retry wording alternates “3 retries” and “3 failed attempts”                                                                          | Define **one initial attempt plus three retries**, four HTTP attempts total. Proposed delays: 1, 2, 4 seconds, true exponential backoff; the Jira 1/5/10 sequence is illustrative. Add bounded jitter and honor valid Retry-After within an operator cap. Document this interpretation prominently.        |
| Webhook token bucket vs “11th request in a minute waits”                                                                              | Use a token bucket plus a rolling-minute ceiling of the configured rate. This satisfies both requirements, including sustained traffic; test the rolling boundary.                                                                                                                                         |
| Webhook rate-limit headers “in responses”                                                                                             | Expose quota headers on management/test API responses and include quota context in outbound request headers. The sender cannot control the receiver's response headers.                                                                                                                                    |
| Custom HTTP method vs POST delivery requirement                                                                                       | V1 supports POST only; show POST as the method choice and reject other methods. Do not silently store an ignored method.                                                                                                                                                                                   |
| Logs ask for payloads; security standards prohibit document/secret logging                                                            | Store allowlisted, redacted request/response summaries, sizes, status, and metadata. Never store raw content, signatures, credential headers, cookies, signing tokens, or arbitrary response bodies.                                                                                                       |
| `folder = Legal` filtering example, but no folder entity                                                                              | Define optional customer metadata `metadata.folder`, surfaced as event data `folder`. Validate it as a bounded string; do not build a folder subsystem. `status` always means canonical lifecycle status, not a caller-invented approval flag.                                                             |
| “Include All Fields”                                                                                                                  | All fields in the documented, permission-filtered event schema; never the raw Prisma record or internal metadata. Required delivery envelope remains present with custom field selections.                                                                                                                 |
| Secret-key example in payload vs signature headers                                                                                    | Signature lives in headers only. Never put a key or self-referential signature in JSON.                                                                                                                                                                                                                    |
| INK-165 description ends at “inspect payloads” and has no acceptance criteria                                                         | Use the explicitly proposed test/debug acceptance criteria in section 7.10; record that they are derived, not quoted Jira requirements.                                                                                                                                                                    |
| API-key guidance in local standards vs JWT/OAuth2 story                                                                               | OAuth2 client credentials is the primary machine flow; JWT sessions remain supported. Do not claim API-key auth exists unless it is also implemented. Document API keys as a separate contract extension rather than disguising a static key as OAuth2.                                                    |

## 4. Shared architecture and contracts

### 4.1 Request identity and authorization

Introduce a typed `RequestPrincipal` carrying `kind: user | service | signer`, principal ID, current organisation ID, user ID when applicable, roles, granted scopes, authentication issuer, and request ID. Resolve it once; domain services receive a required context instead of optional IDs and role strings. Organisation comes from verified identity plus active membership/client binding, never from arbitrary request data.

For machine clients create an `ApiClientBinding` mapping trusted `(issuer, clientId/subject)` to one organisation, explicit allowed scopes, active status, and an optional designated acting member. Resolve the acting member's current permissions on every request where member-owned records are involved; effective permission is the intersection of client scopes, configured grants, and applicable member permissions. Retain client ID in audit metadata. Service clients cannot inherit super-admin powers from email claims or sign for other people. Organisation-wide integrations require an explicit organisation-admin grant and remain tenant scoped.

Add explicit webhook read/manage, delivery replay, integration-client management, and operational-log read permissions to the existing registry and custom-role resolution. Ordinary members may manage subscriptions they own for resources they can currently read; organisation-wide subscriptions and administration events require org-admin permission. Re-evaluate grants before delivery; a revoked user or disabled tenant must stop further delivery. Global metrics and policy management require genuine platform-admin identity; tenant admins see only tenant operational data.

Treat foreign-tenant object IDs as 404, permission failures within the visible tenant as 403, and missing/invalid identity as 401. List totals, cursor tokens, exports, audit history, errors, and delivery IDs must obey the same boundary. Keep public signing and verification deliberately separate from user/service authentication.

### 4.2 API contract

Create `apps/api/src/contracts/` for Zod DTOs and explicit response mappers, `docs/api/openapi-v1.yaml`, `docs/api/openapi-v2.yaml`, and a versioned interactive documentation entry. Avoid returning Prisma objects directly. Proposed v1 document DTO:

```json
{
  "id": "uuid",
  "name": "Contract.pdf",
  "description": "Optional description",
  "status": "DRAFT",
  "version": "0.1",
  "mimeType": "application/pdf",
  "fileSize": 1024,
  "tags": [],
  "metadata": { "folder": "Legal" },
  "createdAt": "2026-09-16T10:00:00.000Z",
  "updatedAt": "2026-09-16T10:00:00.000Z"
}
```

Use a single-object body for CRUD. List bodies are `{ data, pagination }`; page mode includes page/limit/total and cursor mode includes limit/nextCursor/hasMore. Default limit 20, maximum 100; validate positive integers, recognized filters, date ranges, and allowlisted sort fields. Sort by creation time plus UUID tie-breaker. Return protected content through the separately authorized content/file endpoint, not arbitrary metadata blobs. Public metadata must exclude existing internal fields such as base64 files, verification tokens, and seal internals.

Create accepts `{ name, content, contentEncoding, mimeType, description?, tags?, metadata? }`: UTF-8 Markdown/text or base64 PDF/DOCX, with explicit MIME/encoding combinations; document defaults for the simple `name/content` SDK call. Verify actual decoded size and format rather than trusting `fileSize`; reuse existing 15 MiB file and 512 KiB Markdown limits. Template-based creation may use the existing template instantiation path; document it rather than duplicating it.

Add `Location` for 201; 204 has no JSON body. Uniform errors include code, message, safe field details, timestamp, requestId, and safe path. Add handlers for malformed JSON, unsupported versions, missing routes/methods, upstream dependency failure, and unavailable rate-limit storage. Validate or replace inbound request IDs (bounded printable format). Redact token-bearing path segments in logs and error paths. Expose request, idempotency, and rate-limit headers through CORS; add Idempotency-Key and conditional-update headers to allowed headers.

### 4.3 Data model additions

Use UUID v7 IDs, snake_case database mappings, tenant indexes, foreign keys, and appropriate timestamps. The following are proposed models; split migrations by phase rather than one unreviewable migration.

| Model                                   | Essential fields and invariants                                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApiClientBinding`                      | organisationId, issuer, externalSubject/clientId, actingUserId?, scopes, status, audit timestamps; unique trusted issuer/client mapping or explicit tenant selection mapping.                                                                              |
| `RefreshSession`                        | organisationId, userId/client binding, tokenHash unique, familyId, expiresAt, consumedAt, revokedAt, replacementId; atomic rotation and family revocation on reuse. Store provider refresh tokens only encrypted if a server-side broker must retain them. |
| `RevokedAccessToken`                    | issuer, jti or session reference, expiry; durable local revocation. Provider tokens use the documented provider validation/revocation policy.                                                                                                              |
| `IdempotencyRecord`                     | organisationId, principalId, operation, keyHash, requestHash, state, leaseUntil, responseStatus/body, resourceId, expiresAt; unique `(organisationId, principalId, operation, keyHash)`.                                                                   |
| `ApiRateLimitPolicy` / `RateLimitState` | route group, role/principal/IP selector, limit/window, audited whitelist; durable token/window state updated atomically. Index expiration for cleanup.                                                                                                     |
| `ApiRequestLog`                         | org/principal nullable for unauthenticated traffic, requestId, route template, method, status, duration, redacted summaries, createdAt/expiresAt; indexed time/user/route/status. Unauthenticated/global rows are operator-only.                           |
| `WebhookSubscription`                   | organisationId, ownerId, scope (own/organisation), URL, POST, event types, enabled/deletedAt, encrypted custom headers, filter JSON, payload selection JSON, rateLimit, configuration revision.                                                            |
| `WebhookSigningKey`                     | organisationId, subscriptionId, keyId, encrypted secret or vault reference, activeFrom, retiredAt, graceUntil. Never persist cleartext secrets.                                                                                                            |
| `DomainEvent` (outbox)                  | organisationId, eventId, type, schemaVersion, resourceId, aggregateSequence, actor reference, occurredAt, immutable safe data snapshot, dedupeKey, dispatch state/lease; unique tenant/dedupeKey.                                                          |
| `WebhookDelivery`                       | organisationId, eventId, subscriptionId, replayGeneration, frozen payload bytes/hash, configuration revision, state, attemptCount, nextAttemptAt, lease/version, last status/error; unique event/subscription/replayGeneration.                            |
| `WebhookAttempt`                        | organisationId, deliveryId, attemptNumber, start/end times, status/error category, duration, safe response summary, signing keyId; unique delivery/attemptNumber.                                                                                          |
| `WebhookDeadLetter`                     | organisationId, deliveryId unique, reason, finalAttemptAt, expiresAt, replay references; retains authorized immutable payload reference for default 30 days.                                                                                               |
| `MetricBucket` / `OperationalAlert`     | tenant/subscription or platform scope, time bucket, counts and latency histogram; alert cooldown/resolution and durable notification state. Keep metric history 90 days.                                                                                   |

An attempt is append-only once finished; mutable processing state belongs to Delivery. Operational logs and DLQ are not the legal audit chain and use their own retention rules. Keep event/payload references until all deliveries and the DLQ replay period finish; never delete a parent event while replay remains available. Soft-delete subscriptions immediately; clean retained encrypted credentials only when safely retired. Do not cascade-delete domain audit evidence.

Create a transaction helper that sets tenant context using transaction-local database settings on the same Prisma transaction connection. RLS needs both USING and WITH CHECK with actual schema organisation mapping. Confirm application roles cannot bypass RLS; test missing tenant context as denial. For background workers, use a narrowly privileged claim routine for job IDs, then process each job in an explicitly tenant-scoped transaction; never accept tenant scope solely from a queue message. Document any security-definer SQL and test its privileges. Reconcile the existing database baseline before `migrate deploy`; do not generate a migration that recreates existing production tables.

### 4.4 Reliable mutation, audit, idempotency, and outbox

For a successful mutation, one database transaction must cover domain changes, audit append, idempotency result where applicable, and immutable DomainEvent creation. Refactor selected services to accept `Prisma.TransactionClient` and a transaction-bound AuditService. Serialize audit append per tenant and persist the exact timestamp used for new hashes. Preserve and version the existing hash format rather than rewriting history; new-format verification must cover the fields it claims to protect.

Network calls to email, sealing, IdP, or webhook receivers must not occur while holding long database transactions. Persist follow-up work, then perform it asynchronously. A failed transaction produces no deliverable event. A committed transaction whose queue publish fails remains recoverable from the outbox. Immediate post-commit publication reduces latency; a scheduled sweeper recovers unsent or expired-lease jobs.

Use Cloudflare Queues plus Cron for hosted dispatch, and a pg-boss adapter for self-hosting, matching the repository stack. Define a queue interface so domain services do not import Worker bindings. Export `fetch`, `queue`, and `scheduled` handlers without losing existing routes or test imports. Keep an exported Hono app/factory for request tests.

Cloudflare Queues provides at-least-once delivery, so assume duplicate messages and no global ordering. Queue messages contain IDs, not customer payloads or secrets. Claim a delivery with an atomic lease and fencing version; stale workers cannot finalize over a newer lease. Acknowledge only after persisting the result or retry schedule. If HTTP succeeds but persistence fails, redelivery may occur: receivers must deduplicate event/delivery IDs. [Cloudflare delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

Queue infrastructure retry/DLQ handles failed worker executions; the database tracks actual HTTP attempt count, business retries, and 30-day replayable failures. Use delayed retry messages and a persisted nextAttemptAt rather than sleeping a Worker. Configure batching and retry behavior explicitly. [Cloudflare batching, retries, and delays](https://developers.cloudflare.com/queues/configuration/batching-retries/).

### 4.5 Event catalogue and wire format

Use `document.*` as canonical wire names; envelope in the PRD maps to the same Agreement aggregate. Do not emit duplicate envelope/document aliases.

| Event                                                               | Authoritative producer / rule                                                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.created`                                                  | Upload, scratch, clone, and template instantiation after aggregate creation commits.                                                                                                     |
| `document.updated`                                                  | Material committed editable-data changes; no event for no-op/idempotent replay. Exclude internal worker bookkeeping.                                                                     |
| `document.deleted`                                                  | First successful soft deletion; snapshot allowed identity before deletion.                                                                                                               |
| `document.sent`                                                     | `WorkflowService.sendForSignature`, once per successful send cycle.                                                                                                                      |
| `document.viewed`                                                   | `recordRecipientView`, once per recipient per send cycle on first recorded view.                                                                                                         |
| `document.signed`                                                   | `submitRecipientSignature`, once per accepted recipient signature; not equivalent to whole-document completion.                                                                          |
| `document.completed`                                                | Completion job after all required recipients finish and required sealed output/reference is durably stored.                                                                              |
| `document.declined`                                                 | `declineRecipientSignature`, after authoritative decline. Omit free-text reason by default.                                                                                              |
| `document.voided`                                                   | Successful cancellation of an active send cycle, even though current implementation restores DRAFT. Payload states actual resulting status plus cancelled cycle.                         |
| `document.expired`                                                  | Expiration processor after conditional transition, once per send cycle.                                                                                                                  |
| `document.verified`                                                 | Successful explicit verification of a known tenant-owned stored document; not arbitrary uploaded files, failed checks, or repeated page polls. Deduplicate by verification operation ID. |
| `user.created`, `user.updated`, `user.role_changed`, `user.removed` | Authoritative membership acceptance/addition, supported tenant member update, role change, removal. Scope to membership's tenant; avoid global profile-change broadcasts.                |

Add a persisted send-cycle ID and internal aggregate revision/sequence; existing display version `0.1` is not a reliable sequence. Dedupe keys should include transition type, resource ID, cycle/revision, and recipient ID where relevant. Unique constraints enforce exactly one logical event per transition; retries remain at-least-once delivery. Include sequence in payload so receivers can detect out-of-order arrival; do not promise strict global ordering.

```json
{
  "id": "event-uuid",
  "event": "document.signed",
  "schemaVersion": "1.0",
  "timestamp": "2026-09-16T10:00:00.000Z",
  "organisationId": "organisation-uuid",
  "sequence": 8,
  "test": false,
  "data": {
    "document_id": "agreement-uuid",
    "document_name": "Contract.pdf",
    "status": "SENT",
    "recipient_id": "recipient-uuid",
    "signer_email": "signer@example.test",
    "folder": "Legal"
  }
}
```

`signer_email` is an explicitly selectable, permission-checked field, omitted by default. Never serialize signatures, raw documents, signer tokens, passwords, or private keys. Validate every fixture and emitted payload against its versioned schema. Snapshot filtering and payload-selection settings when materializing delivery; freeze exact JSON bytes for retries. Before sending, re-check that the subscription, tenant, and grants are still active. If destination/configuration changes, cancel old pending deliveries rather than silently redirecting them; new events use the new revision. Replays explicitly use current authorized configuration and create a new delivery generation.

## 5. REST endpoint inventory

| Method/path                                                     | Behavior and authorization                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/documents`                                        | Create through AgreementService; documents:create; 201 first request, 200 successful replay per INK-154.                                                                           |
| `GET /api/v1/documents` and `GET /:id`                          | Scoped list/detail; documents:read plus object policy; 200.                                                                                                                        |
| `PUT /api/v1/documents/:id`                                     | Replace editable representation under draft/state rules; documents:update; 200.                                                                                                    |
| `PATCH /api/v1/documents/:id`                                   | Optional documented partial editable update; same rules; 200.                                                                                                                      |
| `DELETE /api/v1/documents/:id`                                  | Soft delete, documents:delete; 204. Repeat delete in authorized tenant is 204 without another event. Unknown/foreign resource is 404.                                              |
| `GET /api/v1/documents/:id/file`                                | Authorized download, reusing file service behavior and privacy restrictions.                                                                                                       |
| `POST /api/v1/documents/:id/sign`                               | Adapter to existing signer submission, requiring recipient authorization/consent/OTP where configured; Idempotency-Key supported. Generic service token cannot impersonate signer. |
| Existing `/api/v1/templates` and `/organisations/me/audit-logs` | Document and test visible templates/audit retrieval; retain established response compatibility.                                                                                    |
| `POST /api/v1/auth/refresh`                                     | Local or provider-backed refresh adapter with validated grant/client binding; preserve separate access/refresh token types.                                                        |
| `GET /api/v1/health`                                            | Public sanitized readiness: 200 healthy, 503 required dependency unavailable. Preserve `/health` liveness.                                                                         |
| `GET /api/v1/metrics`                                           | Admin-authenticated Prometheus text; tenant-safe vs global operator scopes.                                                                                                        |
| `GET /api/v1/organisations/me/api-logs`                         | Tenant operational-log reader with filters/pagination; platform equivalent under admin if required.                                                                                |
| `/api/v1/admin/api-rate-limit-policies`                         | Audited operator CRUD including selectors and whitelists.                                                                                                                          |
| `/api/v1/organisations/me/api-clients`                          | Manage trusted machine-client mappings and scopes; org admin only.                                                                                                                 |
| `GET /api/v1/openapi.json`, `/api/v1/docs`                      | Public documentation without secrets; interactive requests require explicit credentials.                                                                                           |

Implement equivalent document CRUD in `/api/v2` through version-specific DTO/router modules; share domain code. Default-version alias `/api/documents` dispatches to v1 without a redirect that could alter POST semantics.

## 6. INK-25 story implementation tasks

### 6.1 INK-146 — API contracts (title mismatch noted above)

[Jira](https://graphomy.atlassian.net/browse/INK-146). Dependencies: initial contract decisions; iterate as routes land.

1. Inventory current route factories and browser callers in `apps/web/src/lib/api.ts`; classify public, user, service, tenant-admin, and platform-admin operations.
2. Create contracts, OpenAPI documents, examples, response mappers, auth schemes/scopes, operation IDs, pagination/filter/sort rules, and error-code catalogue. Include templates, audit, signing, verification, health, and webhook management.
3. Serve interactive Swagger/Scalar docs using a pinned asset/build approach compatible with CSP; do not globally relax API security headers. Disable token persistence in docs.
4. Add specification validation and contract tests so implementation schemas/examples and generated SDK inputs cannot drift. Include a version and changelog.

Files: new `src/contracts/*`, `src/routes/docs.ts`, `docs/api/*`; update entry and CI. Done when every supported endpoint has method/path, inputs, outputs, permission requirements, and executable safe examples; invalid payloads produce documented 400 errors with field details. Verify interactive rendering and authenticated try-it behavior against a test environment.

### 6.2 INK-147 — Document CRUD

[Jira](https://graphomy.atlassian.net/browse/INK-147). Dependencies: INK-146 contract, INK-148 identity; integrate INK-154 before production writes.

1. Add `routes/documents.ts`, `validators/document-validators.ts`, and a document DTO mapper. Map `name` to Agreement.title and content to the existing scratch/upload input.
2. Refactor shared service methods to require tenant/principal context. Apply actual byte/format limits, existing quota rules, object visibility, and state protections. Use conditional updates/revision checks to prevent concurrent draft overwrites; return 409 on stale revision.
3. Implement create/list/get/PUT/PATCH/soft-delete with section 5 statuses. Retain existing agreement routes' response contracts. Ensure repeated identical PUT does not bump version/audit/event unnecessarily.
4. Reject server-owned metadata and unsupported lifecycle changes; return only public DTO fields. Include template listing and tenant audit endpoint regression tests to close the parent FR gaps.
5. Wire transaction-bound audit and event production; repeated DELETE must not emit duplicate deletion events.

Tests: valid text/PDF creation; actual-vs-declared size mismatch; malformed IDs/JSON; pagination/order/filter boundaries; author/reviewer/admin/service visibility; cross-tenant reads/writes/list totals; stale updates; immutable signing state; deletion visibility; rollback produces no orphan audit/event. Done when CRUD acceptance passes with a real database and existing agreement web tests still pass.

### 6.3 INK-148 — JWT, OAuth2, RBAC, refresh

[Jira](https://graphomy.atlassian.net/browse/INK-148). Dependencies: schema/tenant groundwork.

1. Add `api-auth.ts` and principal resolution, retaining `jwtAuth` compatibility for browser routes. Move downstream `next()` outside JWT verification catch so a domain 403/409/500 is not remapped to 401.
2. Harden local JWT verification with explicit algorithm, required/typed expiry and identity claims, issuer/audience policy for new tokens, durable revocation, and active membership. Provide a bounded migration path for existing local sessions; never accept missing expiry or fallback signing secrets in production.
3. Implement OAuth2 resource-server support using the already installed `jose` library and the approved Zitadel integration. Configure trusted issuer/audience/JWKS; never use a token-controlled key URL. Validate JWT access tokens, and support configured introspection for opaque tokens. Map verified client/user identity through local bindings and grants. JWT and OAuth2 are distinct acceptance paths, not synonyms.
4. Document and exercise a machine client-credentials flow and a user authorization-code/PKCE flow. Provider setup and scopes belong in environment documentation. Scope changes/revocation must have a defined maximum propagation time; introspect where immediate provider revocation is required.
5. Add refresh rotation for local sessions and a fixed-provider refresh adapter where necessary. Use hashed random refresh tokens, atomic consume/replace, bounded expiry, reuse detection, family revocation, logout revocation, and client binding. Retain existing 15-minute access default unless explicitly reconfigured; the Jira one-hour value is an example. Use 24-hour refresh lifetime as the proposed default. Cookie refresh requires CSRF/Origin checks and secure cookie flags. Never use an access token as a refresh grant.
6. Resolve actual custom role grants server-side. Add integration settings for client bindings/revocation without displaying client secrets from the IdP. Reject unscoped/missing tenant identity instead of defaulting it.

Files: auth middleware/utils/service/routes/tests, new principal/client-binding/provider modules, permission registry, Prisma models. Tests: missing/expired/tampered token; wrong algorithm/issuer/audience; unknown/revoked client; inactive user/tenant; real RBAC matrix; fresh-role changes; refresh race/reuse; downstream 403 preserved; signer impersonation blocked. Validate OAuth2 and refresh with a local/test Zitadel instance before marking complete. [Zitadel token validation](https://zitadel.com/docs/guides/integrate/token-introspection), [OAuth endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints).

### 6.4 INK-149 — Durable API rate limits

[Jira](https://graphomy.atlassian.net/browse/INK-149). Dependencies: identity and policy schema.

1. Replace the in-memory map with a `RateLimitStore` abstraction and a transactional Postgres token-bucket/sliding-window implementation shared across replicas. Keep any memory adapter test-only.
2. Key policies by route template and authenticated principal (including client ID); use a separate trusted-proxy IP bucket for unauthenticated routes. Default auth to 10/min/IP, signing to 5/min/signer, general API to 100/min/principal. Do not trust arbitrary forwarded headers outside configured proxies.
3. Define precedence: explicit principal/IP policy, route+role policy, route default, global default; enforce an absolute operator ceiling. Add audited admin CRUD and specific-user/IP whitelist. Whitelists do not bypass authentication or tenant controls.
4. Emit quota/reset headers and Retry-After seconds, plus a machine-readable retry interval in the documented error body. Storage unavailable returns controlled 503 rather than silently disabling abuse protection. Exclude liveness/readiness from expensive limiter recursion.

Tests: first 100 admitted/101st rejected, configured 50/min, refill/reset, two Worker instances sharing state, concurrent attempts, whitelist precedence, forged IP headers, correct Retry-After, test-mode enforcement. Load-test contention at target traffic; redesign storage behind the interface if DB contention violates latency targets.

### 6.5 INK-150 — Versioning and compatibility

[Jira](https://graphomy.atlassian.net/browse/INK-150). Dependencies: INK-146/147.

1. Extract app factory and v1/v2 registration without changing existing URL routing order. Separate DTOs even when initial v2 output matches v1.
2. Add v1 default aliases for documented API resources; unsupported version errors are structured JSON, not the default Hono text 404.
3. Add configurable deprecation metadata and warning/Sunset/link headers with policy validation. Keep currently supported routes free of invented deprecation deadlines.
4. Snapshot representative v1 contracts and run them against every later change. Document additive vs breaking changes and how old SDKs continue working.

Tests: v1 and v2 CRUD responses, unversioned default, unsupported v3, unknown route within supported version, deprecated fixture headers, unchanged `/verify`, `/csc/v2`, and existing browser calls.

### 6.6 INK-151 — Domain-to-webhook integration

[Jira](https://graphomy.atlassian.net/browse/INK-151). Dependencies: INK-156 event contracts, outbox, INK-157–161 pipeline; shares work rather than building another webhook system.

1. Inject an event publisher accepting the active transaction into AgreementService, WorkflowService, template instantiation, verification, and relevant organisation/role membership mutations.
2. Implement every section 4.5 producer with dedupe keys and safe snapshots. Events are generated from backend state, whether mutation originated in UI, API, or scheduled work.
3. Refactor final signing into a recoverable completion orchestration: accept signature once; persist completion work; perform idempotent sealing outside the transaction; then atomically store completion state/audit/outbox. Persist failure/retry status and expose signing-pending/completion-pending state without claiming a finished artifact. Preserve existing public status compatibility by using internal completion state until a supported public transition can be made.
4. Concurrent last signers must create one completion job and one completed event. A completed event must not fire after a swallowed seal failure. Reuse a stored successful seal on recovery rather than sealing again blindly.
5. Put external completion emails behind durable post-commit work so an email failure cannot roll back or duplicate signing. Retain all consent, OTP, sequential routing, and signature validation rules.

Tests: create/update/delete/sign/verify and all PRD lifecycle/admin events; transaction rollback; duplicate API request; duplicate queue message; two final signers; failed seal then recovery; no event for failed send/view/token; repeated view policy; tenant payload isolation. Done only when an actual test receiver receives signed events and failures retry through the shared pipeline.

### 6.7 INK-152 — Searchable API logs

[Jira](https://graphomy.atlassian.net/browse/INK-152). Dependencies: principal/request IDs; logging storage.

1. Add outer request-logging middleware that records final response status/duration for success, auth failure, validation, 404, rate limits, and exceptions. Capture bounded allowlisted summaries; avoid consuming request/response streams or buffering files.
2. Redact before enqueue/storage, not only at display time. Normalize token paths to route templates, remove query credentials, mask custom headers, sanitize error text, and prevent newline/log injection. Skip raw document, certificate, signature, and auth bodies entirely.
3. Implement a centralized durable log sink using the existing database for the initial deployment behind an adapter, with batching/retention and a path to an external collector. Bound buffers; monitor dropped operational logs. Transactional audit persistence remains mandatory for business mutations even if the operational sink fails.
4. Add tenant/admin query API and UI filters for time, user/client, route, status, requestId; paginate and export only redacted fields. Default retention 90 days, configurable cleanup. Do not run audit-chain retention through this cleanup.

Files: `middleware/request-logger.ts`, `services/api-log-service.ts`, log routes/validators, integration/admin UI, migrations. Tests: nested secrets, binary bodies, URL signing tokens, errors, logs searched by user+endpoint, retention boundary, tenant isolation, sink failure. A log containing sample secret strings fails the acceptance suite.

### 6.8 INK-153 — Health and monitoring

[Jira](https://graphomy.atlassian.net/browse/INK-153). Dependencies: shared telemetry; reconcile existing INK-287 health work.

1. Extend/reuse PlatformHealthService with bounded probes for required database and configured queue/signing dependencies. Public readiness returns component name/status only, with no hostnames, credentials, query errors, stack traces, memory internals, or tenant data. Optional unconfigured integrations are explicitly not-configured rather than falsely healthy.
2. Return 503 on required dependency failure; retain `/health` as cheap liveness. Keep detailed diagnostics on the existing protected admin endpoint.
3. Add admin-secured Prometheus exposition for counts, errors, duration histograms, queue lag, and failures. Aggregate across Worker instances using durable metrics/collector, not process-local counters. Use route templates and bounded labels, not user IDs or raw paths.
4. Supply a monitoring configuration with an external 30-second probe/scrape interval. Do not assume a minute-based cron can implement 30-second probes. Include dashboard panels and failure alerts.

Tests: healthy DB, timeout, signing dependency failure, safe public 503, unauthenticated metrics 401, wrong role 403, valid Prometheus text, aggregation across instances. Exercise actual scrape configuration in staging; document dependencies intentionally excluded from readiness.

### 6.9 INK-154 — Idempotent create and sign

[Jira](https://graphomy.atlassian.net/browse/INK-154). Dependencies: transaction layer and principal; must precede production external mutations.

1. Validate Idempotency-Key length/format; hash key and canonical request representation with method, canonical operation, resource ID, and relevant body. Scope uniqueness by tenant and effective principal. Exclude volatile headers/request IDs from body hash.
2. Reserve the key transactionally, perform mutation/audit/outbox, and save the safe replay response in the same transaction. On identical completed create return the same body and 200, while initial create is 201; add Idempotency-Replayed header. A different body with the same key returns 409.
3. Concurrent in-progress requests return documented `IDEMPOTENCY_IN_PROGRESS` 409 with retry guidance; never execute twice. Long-running signing uses a persisted operation ID/result state, not an open transaction during sealing. Recover expired leases using persisted operation state.
4. If no key is supplied generate and return it; explicitly explain that a caller who loses that first response cannot deduplicate without knowing the generated key. SDKs should generate keys before first send and reuse them on network retries.
5. Default retention 24 hours, configurable. Scope across v1/default aliases to the same logical operation. Authenticate and authorize before serving a replay; revoked access cannot retrieve cached results. After a signer token is consumed, allow only the exact authorized same-key replay tied to its hashed token/session identity, never a new signature operation.

Tests: parallel same-key create produces one document/audit/event; different body 409; different principal/tenant isolated; generated header; expiry; restart after commit before HTTP response; signing replay after token consumption; failed/rolled-back operation; no duplicate seal/email. Store no raw signer token or credential in the record.

### 6.10 INK-155 — SDKs and examples

[Jira](https://graphomy.atlassian.net/browse/INK-155). Dependencies: stable validated OpenAPI and auth/idempotency contracts.

1. Add pinned OpenAPI generator configuration and reproducible output under `sdks/typescript`, `sdks/python`, and `sdks/java`; cURL is executable examples, not a package language. Use deterministic operation IDs and automated regeneration checks.
2. Add small maintained wrappers only where generation cannot implement shared retry/idempotency behavior. Expose typed models/errors with requestId, configurable base URL/version, token provider, timeouts, and cancellation.
3. Retry 429 using Retry-After with bounded backoff; retry network/5xx only for safe reads or writes carrying a stable idempotency key. Never retry a signature or create by generating a fresh key. Never retry authorization/validation errors indefinitely.
4. Provide tested create/list/update/delete, template/audit retrieval, signer-authorized signing, verification, webhook configuration, and signature-verification examples in Python, JavaScript, Java, and cURL as appropriate.
5. Add package build/test/release workflows for npm, PyPI, and Maven; version and changelog them together with API contract releases. Select real available package coordinates at release time; do not present placeholder installation commands as published packages.

Tests: generate twice with no diff; compile all languages; run SDK smoke suites against the same local API fixture; Python `create_document(name=..., content=...)` returns structured ID/metadata; 429 recovery preserves key; OpenAPI breaking-change gate. Story remains “implementation ready, publication pending” until actual packages are published with authorized credentials and installation from registries succeeds.

## 7. INK-26 story implementation tasks

### 7.1 INK-156 — Event and payload contracts

[Jira](https://graphomy.atlassian.net/browse/INK-156). Dependencies: domain inspection and section 3 decisions.

1. Create `src/contracts/webhook-events.ts` as an event registry with versioned schema, trigger, safe fields, filterable fields, selectable fields, required scope, and fixture for every section 4.5 event.
2. Add `GET /api/v1/webhook-events` with supported schemas/examples and an event-details endpoint that returns a structured unsupported-event error for unknown names. Use this catalogue for UI options and API validation.
3. Publish `docs/webhooks/events.md` and a Postman/example collection with delivery, ordering, duplicates, signing, retries, terminal failures, and privacy behavior.
4. Validate fixtures and generated payloads in CI; schema-breaking changes require a new payload version. Subscription pins payload version independently of REST version.

Tests: all required lifecycle/admin events registered; unsupported event rejected; fixtures schema-valid; signing event distinct from completion; no secret fields; each registry entry has an authoritative producer and documentation.

### 7.2 INK-157 — Subscription management UI/API

[Jira](https://graphomy.atlassian.net/browse/INK-157). Dependencies: INK-148/156, subscription storage; sample test delivery integrates INK-165.

1. Add `routes/webhooks.ts`, validators, subscription service, and CRUD at `/api/v1/webhooks`. GET list/detail; POST 201; PATCH 200; DELETE 204. Add enabled/disabled controls, event/version selection, owner scope, POST method, custom headers, rate, filter, and payload projection settings.
2. Build `apps/web/src/app/(auth)/settings/integrations/page.tsx` with Webhooks, API clients, and API activity views plus detail components under `components/features/integrations/`. Reuse API client, role guards, primitives, navigation, and date utilities. Provide loading/empty/error states, field-level validation, keyboard access, and explicit deletion confirmation.
3. Validate HTTPS URLs at create/update and again before every delivery. Reject URL credentials/fragments, loopback/private/link-local/multicast/reserved addresses, metadata endpoints, obfuscated IP formats, and unsafe ports. Normalize hosts with a vetted parser; reject redirects.
4. Introduce a `SafeWebhookTransport` with enforced egress policy. DNS pre-check followed by unrestricted fetch is insufficient against DNS rebinding. Hosted delivery must use a verified platform enforcement mechanism or controlled egress relay; self-host transport resolves and pins a permitted IP with correct TLS hostname checks and network firewall rules. If that guarantee cannot be established, keep external delivery disabled and report the concrete blocker.
5. Encrypt credential-bearing custom headers, cap count/size, reject CR/LF and transport/signature-controlled headers such as Host, Content-Length, X-Signature, and Connection. UI shows configured/masked values; unchanged secrets survive PATCH without round-tripping plaintext.
6. Delete/disable stops pending/retry sends and audits the change. A request already in flight may complete; document this boundary. Apply entitlement checks using existing plan policy; local standards say Growth+ and OSS self-host, so isolate entitlement logic and verify actual plan mapping before release.

Tests: owner/org-admin permissions, cross-tenant IDs, all URL/redirect/DNS cases, encrypted headers, no secret read-back, edit revision invalidation, disabled/deleted subscription, entitled/unen­titled deployment, accessible CRUD flow. Do not expose outbound fetch before safe transport tests pass.

### 7.3 INK-158 — Asynchronous delivery

[Jira](https://graphomy.atlassian.net/browse/INK-158). Dependencies: INK-156/157/159, outbox; integrate retry/rate/filter/projection modules.

1. Add `services/domain-event-service.ts`, `webhook-dispatch-service.ts`, `webhook-delivery-service.ts`, and worker entry helpers. Define injectable queue, clock, transport, signing, and persistence interfaces.
2. Fan out each event only to eligible same-tenant subscriptions that existed and were enabled for that event time/revision; new subscriptions do not receive historical events unless explicitly replayed. Persist event/subscription matches idempotently and page large fan-outs with a durable cursor.
3. Evaluate owner visibility and filters against immutable canonical event data, then project fields, validate, serialize, and persist the exact bytes. Re-check revocation/destination status before send; do not fetch arbitrary current document content to reconstruct old events.
4. Claim lease, acquire quota, sign bytes, and POST using SafeWebhookTransport. Proposed defaults: 10-second timeout, 256 KiB outbound payload ceiling, 8 KiB maximum redacted response snippet. Abort oversized/slow responses; do not follow redirects.
5. Treat all 2xx as success; persist attempt, status, latency, and sanitized error on all outcomes. Persist a domain-independent delivery audit/operational record. Queue publication and webhook network latency never block a primary document request.

Tests: successful real HTTPS receiver, 204 success, duplicate messages, restart recovery, queue outage/sweeper recovery, partial fan-out crash, lease expiry/fencing, HTTP success followed by DB failure, timeout/DNS/error response, cross-tenant poisoning, subscription removed mid-flight. Done includes deployed queue-consumer smoke verification, not just calling a service function in a test.

### 7.4 INK-159 — HMAC signatures and rotation

[Jira](https://graphomy.atlassian.net/browse/INK-159). Dependencies: event bytes and subscription secrets storage.

1. Generate a unique cryptographically random 256-bit secret per subscription. Store via a dedicated webhook secret-store/vault abstraction; use KMS-backed encryption/vault in hosted deployment and a documented secure self-host equivalent. Do not reuse a user's document signing certificate or JWT secret.
2. Return the new secret once on creation/rotation over an authenticated TLS response with no-store; ordinary GET/list never returns it. UI requires deliberate copy and warns it will not be shown again. Ensure response logging masks this response.
3. Sign exact raw UTF-8 body bytes with Web Crypto HMAC-SHA256. Set `X-Signature: sha256=<hex>` and `X-Signature-Key-ID`, plus stable event/delivery IDs and attempt number. Body includes immutable event timestamp/id. Receivers deduplicate IDs; examples explain replay handling for delayed deliveries rather than assuming every event is less than five minutes old.
4. Implement `POST /webhooks/:id/rotate-secret`, returning the new key and grace deadline once. Sign new attempts with the current key, keep payload bytes/event ID stable, and record keyId per attempt. Receivers retain the previous key for the documented grace interval (proposed 24 hours); retire/revoke it afterward. Secret storage outage must prevent unsigned delivery.
5. Provide Python and JavaScript verification examples using constant-time digest comparison and raw request body. Include test vectors with Unicode and whitespace differences.

Tests: valid/wrong secret, single-byte tampering, serialization change, Unicode, unique tenant keys, rotation/in-flight retry, vault unavailable, secret absent from logs/payloads/UI state after dismissal. Never claim HMAC alone prevents replay; persistent receiver deduplication is required.

### 7.5 INK-160 — Outbound rate limiting

[Jira](https://graphomy.atlassian.net/browse/INK-160). Dependencies: INK-158; reuse durable rate-limit storage, separate API/outbound buckets.

1. Implement per-subscription token bucket and rolling-minute ceiling; default 10/min, configurable positive bounded integer, including 5/min acceptance case. Use a shared atomic store across consumers.
2. Every real network attempt, including retry/replay/test, consumes capacity. Lack of capacity sets RATE_LIMITED/nextAttemptAt and reschedules; it does not count as a failed HTTP attempt or exhaust retry budget.
3. Apply fair claiming across subscriptions/tenants to prevent a high-volume tenant starving others. Expose rate-delayed state in activity UI/API; report reset/remaining quota as defined in section 3.
4. Edits to rate policy take effect on the next quota acquisition without resetting accumulated usage to allow bursts.

Tests: eleven immediate deliveries send ten and delay one; continuous traffic obeys rolling window; 5/min configuration; concurrent consumers; retries cannot bypass limit; clock/refill boundaries; tenant fairness; delayed job survives restart.

### 7.6 INK-161 — Retry, DLQ, notifications, replay

[Jira](https://graphomy.atlassian.net/browse/INK-161). Dependencies: INK-158/160 and durable notifications.

1. Implement delivery state machine: PENDING → IN_FLIGHT → SUCCEEDED, RETRY_SCHEDULED, or DEAD_LETTER; RATE_LIMITED is delayed eligibility; CANCELLED for disabled/deleted/unauthorized configuration. Persist each real attempt exactly once using attempt number and lease fencing.
2. Retry timeouts, network/DNS errors, 408, 429, and 5xx. Treat other 4xx and redirects as terminal. One initial attempt plus three retries by default; compute exponential delay plus bounded jitter. Honor Retry-After for 429/503 within configured maximum. Invalid URL/egress policy/secret failures are operationally visible and never become an unsigned or unsafe send.
3. Exhaustion writes one DLQ record and one durable terminal-notification job. Use existing MailerService for owner email; notify tenant admin if owner inactive. Email contains safe IDs, event type, failure category, and authenticated detail link, not raw payload or credentials. Slack is optional because Jira allows email/Slack; no Slack dependency is required.
4. Provide filtered `GET /api/v1/webhooks/:id/dead-letters`, delivery detail/history, and `POST /api/v1/webhook-deliveries/:id/replay`. Replay requires permission, applies current destination/filter/projection/grants, preserves event ID, creates new delivery ID/generation, and leaves original evidence immutable. Deleted subscriptions cannot replay. Reject schema-incompatible projection replay with an actionable error.
5. Retain DLQ 30 days by default; configurable sweeper respects replay/reference constraints. Notification failure must not lose DLQ state or cause duplicate alerts; retry notification jobs independently.

Tests: exact four-attempt budget, backoff timings with fake clock, 429 Retry-After, terminal 400, persisted attempts after restart, duplicate terminal processing, owner notification dedupe, notification outage recovery, authorized replay, foreign-tenant replay denial, expiry cleanup. Test queue infrastructure DLQ recovery separately from business delivery DLQ.

### 7.7 INK-162 — Filters

[Jira](https://graphomy.atlassian.net/browse/INK-162). Dependencies: INK-156/157; dispatch calls this before projection.

1. Store a typed JSON AST rather than executable text. Proposed shape: `{ and: [{ field: "folder", op: "eq", value: "Legal" }, { or: [...] }] }`. Support AND/OR and equality/inequality/inclusion over registry-allowlisted fields; no arbitrary JavaScript, SQL, JSONPath execution, or unbounded regex.
2. Limit nesting to 5 and predicates to 20; validate field/operator/value types for every selected event. A missing field evaluates false for comparisons, including inequality, unless an explicit supported exists operator is used. Reject invalid fields with structured 400.
3. Build UI condition groups plus API CRUD and a preview evaluator using sample data. Map folder to validated event snapshot metadata.folder. Evaluate against full authorized canonical data before payload field selection.
4. Record bounded FILTERED_OUT activity with event/subscription/rule identifiers and reason, without creating network attempts or exposing content. Apply retention to avoid unbounded match-decision growth.

Tests: Legal match/nonmatch, combined AND/OR, status comparisons, missing/null fields, illegal fields/operators, type mismatch, deep/large trees, no code execution, filtered event causes zero HTTP calls, filter changes apply only under stated revision semantics.

### 7.8 INK-163 — Metrics, dashboard, alerts, export

[Jira](https://graphomy.atlassian.net/browse/INK-163). Dependencies: delivery attempts and shared telemetry.

1. Define metrics precisely: logical deliveries vs HTTP attempts, terminal success/failure counts, pending backlog, first-attempt success, eventual success, timeout/error category, dispatch lag, and attempt latency (network start to outcome). Never count one retried event as four logical deliveries.
2. Persist minute/hour aggregates and reconcile from durable attempt records; deduplicate metric updates by attempt/outcome identifier. Default retention 90 days. No-data success rate is null/“No deliveries,” not 100%.
3. Implement `GET /webhooks/:id/metrics?from=&to=` and CSV export; tenant-wide rollup for admins. Show totals, success/error rate, average and percentile latency, and last 100 safe errors with subscription/event/URL/timestamp. Sanitize callback URL credentials/query fields; prevent CSV formula injection.
4. Add dashboard tab/detail panels in integration settings and Prometheus export for operators with bounded labels. Supply optional Grafana dashboard configuration using the same defined metrics.
5. Default alert: success rate below 99% over a rolling 15-minute window with at least 100 finished deliveries; configurable threshold/minimum volume. Add cooldown, recovery notification, and durable dispatch via email. Exclude synthetic tests from production SLO totals by default.

Tests: retry denominators, duplicate messages, aggregate reconciliation, 90-day purge, no data, last-100 ordering, tenant filtering, export escaping, threshold/cooldown/recovery, test-event exclusion. Validate a staging scrape and a deliberately induced alert before completion.

### 7.9 INK-164 — Payload customization

[Jira](https://graphomy.atlassian.net/browse/INK-164). Dependencies: registry, subscription storage/UI; used by dispatcher before signing.

1. Add payload mode ALL/CUSTOM and per-event include/exclude data fields. Keep immutable envelope fields required; “only selected fields” applies to data. Validate selected field existence/type and permissions against every selected event or require explicit per-event configuration.
2. Provide UI field picker and preview; support `document_id`, `document_name`, and authorized `signer_email` exactly as described in Jira. Public DTO casing and event field casing must be documented separately.
3. Project from safe schema-defined snapshots, not arbitrary metadata. ALL means all permitted published fields. Omit unavailable optional fields consistently; reject protected field names rather than silently including them.
4. Validate output and persist its exact serialization per delivery. Signature covers transformed bytes. Projection changes affect future materializations; current-config replay creates a new generation with a new body, preserving original history.

Tests: ALL, two selected fields, exclude behavior, nonexistent/secret fields, multi-event field compatibility, empty data selection rules, preview equals queued body, Unicode signing, retry body unchanged after settings edits.

### 7.10 INK-165 — Test/debug tools (proposed acceptance)

[Jira](https://graphomy.atlassian.net/browse/INK-165). Source description is incomplete; the following criteria complete its stated intent without pretending they were supplied by Jira.

1. Add `POST /webhooks/:id/test` with an allowlisted event type and validated synthetic overrides. Return 202 with event/delivery IDs and a generated/reused idempotency key. Sample events use `test: true` and fixture IDs/data; they never mutate a real agreement or membership.
2. Route tests through the same URL security, grants, projection, filter, signing, quota, queue, and retry pipeline as real deliveries. A nonmatching filter returns visible FILTERED_OUT status rather than silently forcing delivery. Cap test frequency.
3. Add delivery list/detail views and `GET /webhook-deliveries/:id`: redacted exact payload, safe sent headers (no secrets), timestamps, attempt timings, response status/snippet, error category, next retry, and terminal reason. Use bounded polling with backoff/cancellation; show expired history clearly.
4. Provide preview before send, Send test action, delivery status updates, copy-safe payload, receiver-verification examples, and permission-controlled replay. Render response bodies as escaped text, never HTML.
5. Add a local receiver fixture/harness that can return 2xx/400/429/500, delay, disconnect, and verify HMAC; configure test-only local transport separately from production SSRF policy.

Proposed acceptance: an authorized owner can preview and queue a sample; observe actual outcome; inspect redacted attempts; demonstrate success, retry, terminal failure, signature verification, and filtered-out behavior; replay a failed sample without altering source data. Another tenant cannot inspect or trigger it. No live customer payload or secret is copied to a third-party debugging service.

## 8. Delivery sequence and dependencies

| Phase / suggested PR                                                         | Stories                            | Concrete exit gate                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| 0. Contract ADR, current-behavior tests, source mapping                      | INK-146, INK-156                   | Resolve section 3 choices; contract fixtures and migration baseline recorded.         |
| 1. Principal, OAuth2/refresh, RBAC, tenant transactions                      | INK-148                            | Real-token and real-DB tenant tests pass; browser auth regression suite passes.       |
| 2. Shared storage, durable rate limiter, atomic audit/idempotency primitives | INK-149, INK-154 groundwork        | Concurrency/restart/RLS tests pass; no lost audit/outbox writes.                      |
| 3. Document adapter, templates/audit contract, versioning                    | INK-147, INK-150, INK-154          | CRUD+sign contract tests, retry semantics, and existing agreement UI pass.            |
| 4. Operational logs/readiness/metrics                                        | INK-152, INK-153                   | Sanitized searchable logs; correct public health status; authenticated scrape works.  |
| 5. Event schemas, subscription API/UI, safe transport, secrets               | INK-156, INK-157, INK-159          | Tenant CRUD, secure URL transport, key rotation and HMAC vectors pass.                |
| 6. Outbox, queue, producer transactions, completion orchestration            | INK-151, INK-158                   | Real receiver observes canonical events; crash and sealing recovery work.             |
| 7. Rate/filter/projection, retries/DLQ/alerts                                | INK-160, INK-161, INK-162, INK-164 | Final pipeline ordering and all failure tests pass; owner failure notification works. |
| 8. Dashboard/debug/exports                                                   | INK-163, INK-165                   | Accessible end-to-end configure/test/fail/replay flow; alert/scrape checks.           |
| 9. Final contracts, generated SDKs, release materials                        | INK-146 completion, INK-155        | Contract drift checks, SDK install/smoke tests and publication gates.                 |

The dependency graph is architectural rather than a demand for separate agents. If work is divided, assign nonoverlapping modules with one owner for schema, entry point, principal, and event contracts. Integrate INK-151 with INK-158 rather than creating two delivery engines. Filters/projection can be implemented before producer rollout, but production events must not bypass them while those features are incomplete.

## 9. Full parent/PRD coverage map

| Parent/PRD requirement                                                                      | Implementing Jira stories                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-016.001 create                                                                           | INK-147, INK-148, INK-154                                                                                                                                             |
| FR-016.002 read                                                                             | INK-146, INK-147, INK-148                                                                                                                                             |
| FR-016.003 update                                                                           | INK-147, INK-148, INK-151                                                                                                                                             |
| FR-016.004 template list                                                                    | INK-146/147: existing template route contract, permission and pagination hardening                                                                                    |
| FR-016.005 audit retrieval                                                                  | INK-146/147/148: existing tenant audit route, DTO/filter authorization tests                                                                                          |
| FR-016.006 API client auth                                                                  | INK-148                                                                                                                                                               |
| FR-016.007 tenant scope                                                                     | INK-148 plus real-DB isolation tests for every added model/route/worker                                                                                               |
| FR-016.008 versioning                                                                       | INK-150                                                                                                                                                               |
| FR-016.009 predictable responses                                                            | INK-146, INK-147, INK-149, INK-150, INK-154                                                                                                                           |
| FR-016.010 activity logging                                                                 | INK-152, INK-153                                                                                                                                                      |
| FR-017 PRD .001 created, .002 sent, .003 viewed, .004 signed, .005 completed, .006 declined | INK-151, INK-156, INK-158                                                                                                                                             |
| FR-017 PRD .007 retry                                                                       | INK-158, INK-160, INK-161                                                                                                                                             |
| FR-017 PRD .008 subscriptions                                                               | INK-157, INK-162, INK-164                                                                                                                                             |
| FR-017 PRD .009 security                                                                    | INK-148, INK-157, INK-159                                                                                                                                             |
| FR-017 PRD .010 activity                                                                    | INK-158, INK-161, INK-163, INK-165                                                                                                                                    |
| INK-26 parent administration-change notifications                                           | INK-151/156: tenant user/member role events                                                                                                                           |
| Jira extensions beyond parent bullet lists                                                  | INK-149 rate limits; INK-153 health; INK-154 idempotency; INK-155 SDKs; INK-160 outbound quota; INK-162 filters; INK-163 metrics; INK-164 projection; INK-165 testing |

## 10. Verification and release checklist

### Automated checks

Use existing scripts where they exist; add new scripts for new checks and document them. At the inspected baseline, root `test:e2e` and `test:a11y` were not defined, and DB test/API lint were placeholders. Replace/add the necessary checks rather than reporting placeholder success.

```text
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm test:coverage
```

Add executable OpenAPI validation/compatibility, real-Postgres migration/RLS/concurrency, queue-adapter integration, SDK generation/build/smoke, and browser E2E/accessibility scripts. Run against disposable test environments; never seed, migrate, or send callbacks against production as a test shortcut.

Required cross-cutting scenarios:

- Tenant A cannot see/change/replay Tenant B documents, templates, audit, clients, logs, events, subscriptions, keys, deliveries, DLQ, exports, or metric buckets, including direct SQL under the app role.
- Two simultaneous same-key creates produce one aggregate/event; two last signers produce one completion; duplicate queue messages and crash-after-HTTP success remain safe and traceable.
- A committed event survives queue outage; failed mutations produce no deliverable event; audit failure fails the mutation; operational sink failure does not falsify business success.
- Deleted/disabled subscription, revoked owner/client, and suspended tenant prevent future network sends. In-flight boundary is documented and observable.
- Signer consent/OTP/order rules survive API adapters; signed and completed events are correctly separated; sealing failure never emits completed.
- URL validation resists private-network destinations, redirect escape, and DNS rebinding; secrets/document contents never appear in logs, errors, metrics, or unselected payloads.
- Key rotation, idempotency retention, DLQ retention, metric/log retention, retry backoff, Retry-After, quota boundaries, and refresh-token reuse are tested with controllable time.
- Browser configure → preview → test → inspect → induce failure → DLQ → replay works using keyboard navigation and accessible labels.
- Load target follows local NFR documentation: API p95 below 500 ms for representative non-signing calls; webhook HTTP latency is excluded from API request time. Measure queue lag and storage contention under configured subscription quotas.

### Deployment preparation

1. Add migrations with a verified baseline, RLS policies, indexes, uniqueness constraints, and tested rollback/forward-fix steps. Back up before rollout; use additive migrations and retain old API routes. Never drop history in a rollback.
2. Document hosted queue name/bindings, queue infrastructure DLQ, outbox/retry sweep schedules, self-host pg-boss process, trusted IdP configuration, vault/egress transport, monitoring credentials, and retention parameters. Add configuration examples containing names/placeholders only.
3. Separate feature gates for REST external-client exposure, event capture, and outbound delivery. Enable event capture before live delivery; keep schema-compatible producer behavior during rollback. Drain only authorized/current deliveries, not historical records created before subscription activation.
4. Stage with a controlled receiver: create, sign, fail receiver, restart worker, recover, rotate secret, and replay. Confirm no duplicate logical mutation, correct headers, visible attempts, and alerts.
5. Enable for a test tenant, observe queue lag/error rates and audit continuity, then expand. To roll back, pause outbound consumers/producers as appropriate while preserving outbox/DLQ evidence; leave additive tables and existing endpoints intact.
6. Publish SDKs only after staging contract checks. Record actual package coordinates/versions and verify clean installation. Package publication is a distinct external milestone, not inferred from a successful local build.

### External inputs and honest completion reporting

Implementation can proceed with local adapters and test fixtures. Production OAuth2 needs trusted issuer/audience/client registration; hosted delivery needs queue provisioning, a working secret store and verified safe egress; monitoring needs a collector; SDK publication needs registry ownership and credentials. These are operational dependencies, not reasons to leave the code plan vague. Do not mark their acceptance criteria complete until exercised.

Final implementation report must list every INK-146–165 story, acceptance evidence, migrations/configuration, compatibility changes, and any remaining deployment/publication dependency. Link tests and artifacts. Never describe a pending external integration or an inferred acceptance criterion as verified.

## 11. Copy/paste execution prompt

> Implement the attached `INK-25-INK-26-implementation-plan.md` against the graphsign.ink repository. Use the attached requirements snapshot for the original Jira acceptance criteria. Cover all 20 child stories INK-146–165 and the parent/PRD traceability map. First inspect current repository instructions, branch, and uncommitted changes; preserve existing work and revalidate the plan's baseline. Follow the phase order, reuse the existing Agreement/Workflow/Template/Audit services, and implement the documented contract resolutions. Deliver code, additive migrations, security controls, real integration/concurrency tests, UI, OpenAPI, SDK generation, and operational documentation. Preserve existing browser/API behavior. Track completion per Jira story with evidence; explicitly distinguish implemented-and-tested work from pending infrastructure or package publication. Do not silently omit requirements, invent passing test results, or merge your own PRs.
