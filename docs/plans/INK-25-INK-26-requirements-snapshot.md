# INK-25 / INK-26 — requirements snapshot

Retrieved 2026-09-16. Jira query: `parent in (INK-25, INK-26) ORDER BY key ASC`. Complete result: 20 child stories; no further pages, nested subtasks, comments, or issue links were returned. All were To Do. This is a source snapshot, not the implementation plan.

## INK-146: Route Documents to Approvers Based on Predefined Rules

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-146)

**As a** Backend Developer, **I want** to design and document REST API contracts for document operations (e.g., create, read, update, delete, search), **So that** frontend and third-party developers can integrate with the system seamlessly.

**Description**: This story covers the design and documentation of REST API endpoints, including request/response schemas, examples, and error codes. The APIs must follow RESTful best practices (e.g., resource naming, HTTP methods, status codes).

**Acceptance Criteria**:

- Given a developer reviews the API documentation, When they look up an endpoint (e.g., `POST /api/v1/documents`), Then they see:

  - **Endpoint**: URL, HTTP method (e.g., `POST /api/v1/documents`).
  - **Request Schema**: Required/optional fields, data types, and examples.
  - **Response Schema**: Success/error responses with examples.
  - **Error Codes**: HTTP status codes (e.g., `200 OK`, `400 Bad Request`, `401 Unauthorized`, `500 Internal Server Error`).
  - **Authentication**: Required headers (e.g., `Authorization: Bearer <token>`).

- Given an invalid request is made (e.g., missing required field), When the API is called, Then the system returns a **400 Bad Request** with a **detailed error message** (e.g., `"error": "Field 'name' is required"`).

**Definition of Done**:

- API contracts are documented in **OpenAPI/Swagger** format.
- Documentation includes **interactive examples** (e.g., Swagger UI).
- All endpoints follow **RESTful conventions** (e.g., plural nouns for resources, HTTP methods for actions).
- Documentation is **versioned** (e.g., v1.0).

**Dependencies**:

- API design tool (e.g., Swagger, Postman).
- Authentication/authorization system.

## INK-147: Develop REST APIs for Create, Read, Update, and Delete (CRUD) Operations on Documents

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-147)

**As a** Frontend Developer, **I want** to call REST APIs to create, read, update, and delete documents, **So that** I can build a responsive and functional user interface.

**Description**: This story covers the implementation of CRUD APIs for documents, including validation, error handling, and integration with the database.

**Acceptance Criteria**:

- Given a user creates a document via `POST /api/v1/documents`, When the request includes valid data (e.g., `{ "name": "Contract.pdf", "content": "..." }`), Then the system:

  - Stores the document in the database.
  - Returns a **201 Created** response with the document ID and metadata.
  - Logs the action in the audit trail (link to FR-011).

- Given a user requests a document via `GET /api/v1/documents/{id}`, When the document exists, Then the system returns a **200 OK** response with the document data.
- Given a user updates a document via `PUT /api/v1/documents/{id}`, When the request includes valid data, Then the system updates the document and returns a **200 OK** response.
- Given a user deletes a document via `DELETE /api/v1/documents/{id}`, When the document exists, Then the system deletes it and returns a **204 No Content** response.
- Given an invalid request (e.g., missing fields, invalid ID), When the API is called, Then the system returns a **400 Bad Request** or **404 Not Found** with an error message.

**Definition of Done**:

- All CRUD endpoints are fully functional and tested.
- APIs support pagination for `GET /api/v1/documents` (e.g., `?page=1&limit=10`).
- APIs validate input data (e.g., file size, required fields).
- Error responses include machine-readable error codes (e.g., `"error_code": "invalid_field"`).

**Dependencies**:

- Story 1 (Design and Document REST API Contracts).
- Database schema for documents.

## INK-148: Secure REST APIs with JWT/OAuth2 Authentication and Role-Based Access Control (RBAC)

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-148)

**As a** Security Administrator, **I want** REST APIs to require authentication and enforce role-based permissions, **So that** only authorized users and applications can access sensitive endpoints.

**Description**: This story covers the implementation of authentication (JWT/OAuth2) and authorization (RBAC) for REST APIs. Each endpoint must validate the user's identity and permissions.

**Acceptance Criteria**:

- Given a user calls an API endpoint without authentication, When the request is made, Then the system returns a **401 Unauthorized** response.
- Given a user with a valid JWT calls an endpoint they have permission to access, When the request is made, Then the system processes the request and returns a **200 OK** (or appropriate) response.
- Given a user with a valid JWT calls an endpoint they **do not** have permission to access, When the request is made, Then the system returns a **403 Forbidden** response.
- Given a user’s JWT expires, When they call an API, Then the system returns a **401 Unauthorized** with `"error": "token_expired"`.

**Definition of Done**:

- APIs support **JWT and OAuth2** for authentication.
- RBAC is enforced for all endpoints (e.g., `admin`, `editor`, `viewer` roles).
- Tokens include expiration times (e.g., 1 hour for access tokens, 24 hours for refresh tokens).
- Refresh token endpoint (`POST /api/v1/auth/refresh`) is implemented.

**Dependencies**:

- Authentication service (e.g., Auth0, Keycloak).
- User/role management system.

## INK-149: Implement Rate Limiting to Prevent API Abuse

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-149)

**As a** System Administrator, **I want** to limit the number of API requests per user/IP to prevent abuse and ensure fair usage, **So that** the system remains stable and performant.

**Description**: This story covers the implementation of rate limiting for REST APIs to prevent abuse (e.g., DDoS, brute force attacks). Limits should be configurable per endpoint and user role.

**Acceptance Criteria**:

- Given a user makes >100 requests/minute to a rate-limited endpoint, When they exceed the limit, Then the system returns a **429 Too Many Requests** response with:

  - "error": "rate_limit_exceeded"
  - "retry_after": 60 (seconds until the next request is allowed).

- Given an admin configures rate limits, When they set `limit=50 requests/minute` for a specific endpoint, Then the system enforces the limit for all users of that endpoint.

**Definition of Done**:

- Rate limits are configurable per endpoint, user, or IP.
- Limits are enforced using a token bucket or sliding window algorithm.
- Admins can whitelist specific IPs or users from rate limits.
- Rate limit headers are included in responses (e.g., `X-RateLimit-Limit`, `X-RateLimit-Remaining`).

**Dependencies**:

- Rate limiting library (e.g., Redis, NGINX).

## INK-150: Support Multiple API Versions to Ensure Backward Compatibility

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-150)

**As a** Developer, **I want** the system to support multiple API versions (e.g., v1.0, v2.0), **So that** existing integrations continue to work while new features are introduced.

**Description**: This story covers the implementation of API versioning to allow for backward compatibility and gradual migration. Versions should be specified in the URL path (e.g., /api/v1/documents) or headers (e.g., Accept: application/vnd.company.v1+json).

**Acceptance Criteria**:

- Given a user calls /api/v1/documents, When the endpoint exists in v1.0, Then the system returns the v1.0 response.
- Given a user calls /api/v2/documents, When the endpoint exists in v2.0, Then the system returns the v2.0 response.
- Given a user calls an unsupported version (e.g., /api/v3/documents), When the request is made, Then the system returns a 404 Not Found with "error": "version_not_supported".

**Definition of Done**:

- API versions are URL-based (e.g., /api/v1/..., /api/v2/...).
- Default version is v1.0 if no version is specified.
- Deprecated endpoints return a warning header (e.g., Warning: 299 - "API v1.0 will be deprecated on 2026-12-31").

**Dependencies**:

- Story 1 (Design and Document REST API Contracts).

## INK-151: Trigger Webhooks for Document Lifecycle Events (e.g., Created, Signed, Deleted)

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-151)

**As a** Third-Party Developer, **I want** to receive real-time notifications via webhooks when document events occur (e.g., created, updated, signed, deleted), **So that** I can integrate with external systems (e.g., CRM, ERP).

**Description**: This story covers the implementation of webhooks for document lifecycle events. Webhooks must be configurable per user/organization and support retry logic for failed deliveries.

**Acceptance Criteria**:

- Given a user configures a webhook for the document.signed event, When a document is signed, Then the system sends a POST request to the configured URL with:

  - Event type (e.g., "event": "document.signed").
  - Document ID and metadata (e.g., {"id": "123", "name": "Contract.pdf"}).
  - Timestamp of the event.

- Given a webhook delivery fails (e.g., 500 error), When the system retries, Then it:

  - Retries 3 times with exponential backoff (e.g., 1s, 5s, 10s).
  - Logs the failure in the audit trail and notifies the admin.

**Definition of Done**:

- Webhooks support all document lifecycle events (create, update, delete, sign, verify).
- Users can add, edit, and delete webhook configurations via UI/API.
- Webhook payloads include a signature header (e.g., X-Signature) for verification.
- Failed deliveries are logged and retried.

**Dependencies**:

- Event-driven architecture (e.g., Kafka, RabbitMQ).
- Story 2 (Implement Document CRUD APIs).

## INK-152: Log API Requests and Responses for Debugging and Auditing

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-152)

**As a** System Administrator, **I want** all API requests and responses to be logged, **So that** I can debug issues and audit API usage.

**Description**: This story covers the implementation of API logging for all requests and responses, including headers, payloads, and timestamps. Logs must be searchable and retainable for compliance.

**Acceptance Criteria**:

- Given a user makes an API request, When the request is processed, Then the system logs:

  - Timestamp
  - HTTP Method (e.g., GET, POST)
  - Endpoint (e.g., /api/v1/documents)
  - Request Headers (excluding sensitive fields like Authorization)
  - Request Payload (if applicable)
  - Response Status Code (e.g., 200, 404)
  - Response Payload (if applicable)
  - User ID (if authenticated)

- Given an admin searches the logs, When they filter by user_id=123 and endpoint=/api/v1/documents, Then the system returns all matching logs in a paginated list.

**Definition of Done**:

- Logs are stored in a centralized logging system (e.g., ELK Stack, Datadog).
- Logs are retained for 90 days (configurable).
- Sensitive data (e.g., passwords, tokens) is redacted from logs.
- Logs are searchable by timestamp, user, endpoint, and status code.

**Dependencies**:

- Logging infrastructure (e.g., ELK, Splunk).

## INK-153: Implement Health Check and Monitoring Endpoints for APIs

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-153)

**As a** DevOps Engineer, **I want** to monitor API health and performance via dedicated endpoints, **So that** I can proactively detect and resolve issues.

**Description**: This story covers the implementation of health check and monitoring endpoints to provide visibility into API status, performance, and dependencies (e.g., database, external services).

**Acceptance Criteria**:

- Given a user calls `GET /api/v1/health`, When the system is healthy, Then it returns a **200 OK** response with status details of all dependencies.
- Given a dependency (e.g., database) is down, When `GET /api/v1/health` is called, Then the system returns a **503 Service Unavailable** response with details about the unhealthy dependency.
- Given a user calls `GET /api/v1/metrics`, When the request is made, Then the system returns performance metrics (e.g., request latency, error rates) in **Prometheus** format.

**Definition of Done**:

- Health check endpoint (`/api/v1/health`) is publicly accessible (no auth required).
- Metrics endpoint (`/api/v1/metrics`) is secured (requires admin role).
- Health checks are automated (e.g., run every 30 seconds).
- Metrics are integrated with monitoring tools (e.g., Prometheus, Grafana).

**Dependencies**:

- Monitoring tools (e.g., Prometheus, Grafana).
- Health check library (e.g., Spring Boot Actuator, FastAPI middleware).

## INK-154: Ensure Idempotency for Critical API Operations (e.g., Document Creation, Signing)

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-154)

**As a** Frontend Developer, **I want** critical API operations (e.g., document creation, signing) to be idempotent, **So that** duplicate requests (e.g., due to network retries) do not cause unintended side effects.

**Description**: This story covers the implementation of idempotency keys for critical API operations to prevent duplicate processing. The system must generate or accept a unique key for each request and use it to deduplicate.

**Acceptance Criteria**:

- Given a user creates a document with an idempotency key (`Idempotency-Key: abc123`), When the same request is retried with the same key, Then the system:

  - Returns the same response as the first request (no duplicate document created).
  - Returns a `200 OK` with the existing document if it was already processed.

- Given a user creates a document without an idempotency key, When the request is made, Then the system generates a unique key and returns it in the response headers (`Idempotency-Key: xyz456`).
- Given a user retries a request with a different idempotency key, When the request is made, Then the system processes it as a new request.

**Definition of Done**:

- Idempotency is supported for `POST /api/v1/documents` and `POST /api/v1/documents/{id}/sign`.
- Idempotency keys are stored for 24 hours (configurable).
- The system returns a `409 Conflict` if a duplicate key is used for a different request.

**Dependencies**:

- Story 2 (Implement Document CRUD APIs).
- Database or cache (e.g., Redis) for storing idempotency keys.

## INK-155: Generate and Publish SDKs and Code Examples for REST APIs

Parent: [INK-25](https://graphomy.atlassian.net/browse/INK-25) · [Story](https://graphomy.atlassian.net/browse/INK-155)

**As a** Third-Party Developer, **I want** SDKs (e.g., Python, JavaScript, Java) and code examples for the REST APIs, **So that** I can integrate with the system quickly and with minimal effort.

**Description**: This story covers the generation and publication of SDKs and code examples for the REST APIs. SDKs must be well-documented and easy to use, with support for common languages and frameworks.

**Acceptance Criteria**:

- Given a developer visits the API documentation, When they look for SDKs, Then they find:

  - Official SDKs for Python, JavaScript, Java, and cURL.
  - Code examples for common operations (e.g., create document, sign document, verify signature).
  - Installation instructions (e.g., pip install document-api-sdk).

- Given a developer uses the Python SDK to create a document, When they call client.create_document(name="Contract.pdf", content="..."), Then the SDK:

  - Sends a valid request to the API.
  - Returns the document ID and metadata in a structured format.

**Definition of Done**:

- SDKs are auto-generated from the OpenAPI specification.
- SDKs are published to package managers (e.g., PyPI, npm, Maven).
- Code examples are tested and up-to-date with the latest API version.
- SDKs include error handling and retry logic for rate limits.

**Dependencies**:

- Story 1 (Design and Document REST API Contracts).
- SDK generation tool (e.g., OpenAPI Generator, Swagger Codegen).

## INK-156: Design and Document Webhook Events and Payload Structures

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-156)

**As a** Backend Developer, **I want** to define the list of supported webhook events (e.g., `document.created`, `document.signed`, `document.deleted`) and their payload structures, **So that** third-party developers can integrate with the system effectively.

This story covers the **design and documentation** of webhook events, including the **event types**, **payload schemas**, and **examples**. Each event must have a clear purpose and a well-defined payload.

## Acceptance Criteria

- Given a developer reviews the webhook documentation, When they look up the `document.signed` event, Then they see:

  - Event Name: `document.signed`
  - Trigger: Fires when a document is successfully signed.
  - Payload Schema
  - Example Payload: A real-world example of the payload.
  - Retries and Errors: How failed deliveries are handled.

- Given an unsupported event is requested, When a developer checks the documentation, Then the system clearly states: "This event is not supported."

## Definition of Done

- All document lifecycle events are documented (e.g., `document.created`, `document.updated`, `document.deleted`, `document.signed`, `document.verified`).
- Payload schemas are versioned (e.g., `v1.0`).
- Documentation includes interactive examples (e.g., using Swagger or Postman).
- Payloads include metadata (e.g., `event`, `timestamp`, `data`).

## Dependencies

- API design tool (e.g., Swagger, Postman).
- Clear understanding of document lifecycle events.

## INK-157: Allow Users to Subscribe to and Manage Webhook Events

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-157)

**As a** User or Administrator, **I want** to subscribe to specific webhook events and manage my subscriptions (e.g., add, edit, delete), **So that** I can receive real-time notifications for the events I care about.

This story covers the implementation of a **subscription management system** for webhooks, allowing users to configure which events trigger webhook notifications and where they are sent.

## Acceptance Criteria

- Given a user navigates to the Webhook Subscriptions page, When they click "Add Subscription", they can:

  - Select one or more events (e.g., `document.created`, `document.signed`).
  - Enter a callback URL (e.g., `https://example.com/webhook`).
  - Choose HTTP method (e.g., `POST`).
  - Add custom headers (e.g., `Authorization: Bearer <token>`).
  - Save the subscription.

- Given a user attempts to add a subscription with an invalid URL (e.g., `not-a-url`), When they click "Save", Then the system displays: "Error: Invalid callback URL."
- Given a user edits an existing subscription, When they update the callback URL, Then the system validates the new URL and saves the changes.
- Given a user deletes a subscription, When they confirm deletion, Then the system removes the subscription and stops sending events to the callback URL.

## Definition of Done

- Users can add, edit, and delete webhook subscriptions via UI and API.
- Subscriptions are validated (e.g., URL format, HTTPS requirement).
- Users can test subscriptions by triggering a sample event.
- Subscriptions are stored securely in the database.

## Dependencies

- User authentication and authorization system.
- Database schema for storing subscriptions.

## INK-158: Develop the Webhook Delivery System to Send Events to Subscribers

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-158)

**As a** Backend Developer, **I want** the system to deliver webhook events to subscribed callback URLs, **So that** third-party applications receive real-time notifications.

This story covers the implementation of the **webhook delivery system**, which processes events and sends payloads to subscribed callback URLs. The system must handle **retries, timeouts, and errors** gracefully.

## Acceptance Criteria

- Given a document is signed, When the `document.signed` event is triggered, Then the system:

  - Identifies all subscriptions for the `document.signed` event.
  - Sends a POST request to each callback URL with the event payload.
  - Includes a signature header (e.g., `X-Signature: sha256=<hash>`) for payload verification.

- Given a callback URL returns a 200 OK response, When the webhook is delivered, Then the system logs the success and marks the delivery as complete.
- Given a callback URL returns a 500 Internal Server Error, When the webhook is delivered, Then the system:

  - Retries the delivery 3 times with exponential backoff (e.g., 1s, 5s, 10s).
  - Logs the failure and notifies the subscription owner after 3 failed attempts.

- Given a callback URL is unreachable (e.g., DNS failure), When the webhook is delivered, Then the system retries and logs the error.

## Definition of Done

- Webhook deliveries are asynchronous (e.g., using a queue system like RabbitMQ or Kafka).
- The system supports HTTPS only (rejects HTTP URLs).
- Deliveries include retry logic with exponential backoff.
- Failed deliveries are logged and visible to subscription owners.

## Dependencies

- Event-driven architecture (e.g., Kafka, RabbitMQ).
- Story 2 (Implement Webhook Subscription Management).

## INK-159: Sign Webhook Payloads to Ensure Data Integrity and Authenticity

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-159)

**As a** Security Administrator, **I want** webhook payloads to be signed using a secret key, **So that** recipients can verify the payload was sent by our system and hasn't been tampered with.

This story covers the implementation of **payload signing** for webhooks, ensuring that recipients can verify the authenticity and integrity of the payloads they receive.

## Acceptance Criteria

- Given a webhook is delivered, When the payload is sent, Then the system:

  - Generates a HMAC-SHA256 signature of the payload using a secret key.
  - Includes the signature in the `X-Signature` header (e.g., `X-Signature: sha256=<signature>`).
  - Includes the secret key ID in the `X-Signature-Key-ID` header.

- Given a recipient receives a webhook, When they verify the payload, Then they can:

  - Use the secret key (shared securely) to recompute the signature.
  - Compare it with the `X-Signature` header to confirm the payload is authentic and untampered.

- Given a recipient uses an incorrect secret key, When they verify the payload, Then the signature fails validation.

## Definition of Done

- Each subscription has a unique secret key for signing payloads.
- Secret keys are rotatable (e.g., via UI or API).
- The system provides code examples for payload verification in multiple languages (e.g., Python, JavaScript).
- Secret keys are never exposed in logs or payloads.

## Dependencies

- Cryptographic library (e.g., OpenSSL, PyJWT).
- Secure storage for secret keys (e.g., AWS Secrets Manager, HashiCorp Vault).

## INK-160: Limit Webhook Delivery Rate to Prevent Abuse

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-160)

**As a** System Administrator, **I want** to limit the rate at which webhooks are delivered to a callback URL, **So that** recipients are not overwhelmed by too many requests in a short time.

This story covers the implementation of **rate limiting** for webhook deliveries to prevent abuse and ensure fair usage. Limits should be configurable per subscription.

## Acceptance Criteria

- Given a subscription has a rate limit of 10 requests/minute, When the system attempts to deliver the 11th webhook in a minute, Then it delays the delivery until the rate limit resets.
- Given a subscription owner configures a rate limit, When they set `rate_limit=5 requests/minute`, Then the system enforces the limit for that subscription.
- Given a delivery is rate-limited, When the system retries, Then it respects the rate limit and does not exceed it.

## Definition of Done

- Rate limits are configurable per subscription (default: 10 requests/minute).
- The system uses a token bucket algorithm for rate limiting.
- Rate-limited deliveries are logged and visible to subscription owners.
- The system includes rate limit headers in responses (e.g., `X-RateLimit-Limit`, `X-RateLimit-Remaining`).

## Dependencies

- Rate limiting library (e.g., Redis, NGINX).
- Story 3 (Implement Webhook Delivery System).

## INK-161: Implement Retry Logic and Dead Letter Queue for Failed Webhook Deliveries

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-161)

**As a** Backend Developer, **I want** failed webhook deliveries to be retried and eventually moved to a Dead Letter Queue (DLQ) if they continue to fail, **So that** no events are lost and failures can be analysed.

This story covers the implementation of **retry logic** and a **Dead Letter Queue (DLQ)** for webhook deliveries that fail repeatedly. This ensures that failed deliveries can be analysed and reprocessed later.

## Acceptance Criteria

- Given a webhook delivery fails (e.g., 500 error), When the system retries, Then it:

  - Retries 3 times with exponential backoff (e.g., 1s, 5s, 10s).
  - Logs each retry attempt.

- Given a webhook delivery fails 3 times, When the final retry fails, Then the system:

  - Moves the event to a Dead Letter Queue (DLQ).
  - Notifies the subscription owner via email/Slack with the event details and error.

- Given an admin views the DLQ, When they filter by subscription ID, Then the system displays all failed events for that subscription, including:

  - Event type
  - Payload
  - Error message
  - Timestamp of last retry

## Definition of Done

- Retry logic uses exponential backoff.
- Failed events are stored in the DLQ for 30 days (configurable).
- Admins can reprocess events from the DLQ via UI or API.
- Subscription owners receive notifications for failed deliveries.

## Dependencies

- Queue system (e.g., RabbitMQ, AWS SQS).
- Story 3 (Implement Webhook Delivery System).

## INK-162: Allow Subscribers to Filter Webhook Events by Custom Criteria

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-162)

**As a** User, **I want** to filter webhook events based on custom criteria (e.g., only receive `document.signed` events for documents in the "Legal" folder), **So that** I can reduce noise and only receive relevant notifications.

This story covers the implementation of **event filtering** for webhooks, allowing subscribers to define custom criteria for which events they receive.

## Acceptance Criteria

- Given a user configures a subscription with a filter (e.g., `folder = \"Legal\"`), When a `document.signed` event is triggered for a document in the "Legal" folder, Then the system delivers the event to the callback URL.
- Given a `document.signed` event is triggered for a document not in the "Legal" folder, When the filter is applied, Then the system does not deliver the event to the callback URL.
- Given a user adds multiple filters (e.g., `folder = \"Legal\" AND status = \"approved\"`), When an event matches all filters, Then the system delivers the event.

## Definition of Done

- Filters support AND/OR logic (e.g., `folder = \"Legal\" AND status = \"approved\"`).
- Users can add, edit, and remove filters via UI and API.
- Filters are validated (e.g., invalid fields are rejected).
- Filtered events are logged for debugging.

## Dependencies

- Story 2 (Implement Webhook Subscription Management).
- Database schema for storing filters.

## INK-163: Track and Monitor Webhook Delivery Metrics

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-163)

**As a** DevOps Engineer, **I want** to monitor webhook delivery metrics (e.g., success rate, latency, errors), **So that** I can proactively detect and resolve issues.

This story covers the implementation of **metrics and monitoring** for webhook deliveries, providing visibility into the health and performance of the webhook system.

## Acceptance Criteria

- Given a user views the Webhook Metrics Dashboard, When they filter by subscription ID, Then they see:

  - Total deliveries (successful/failed).
  - Success rate (e.g., 99.9%).
  - Average latency (e.g., 200ms).
  - Error rate (e.g., 0.1%).
  - Recent failures (last 100 errors).

- Given a delivery fails, When the system logs the error, Then it includes:

  - Subscription ID
  - Event type
  - Callback URL
  - Error message (e.g., "500 Internal Server Error")
  - Timestamp

## Definition of Done

- Metrics are collected in real-time and stored for 90 days.
- Metrics are visualised in a dashboard (e.g., Grafana).
- Alerts are triggered for abnormal metrics (e.g., success rate < 99%).
- Metrics are exportable (e.g., CSV, Prometheus).

## Dependencies

- Monitoring tools (e.g., Prometheus, Grafana).
- Story 3 (Implement Webhook Delivery System).

## INK-164: Allow Subscribers to Customise Webhook Payloads

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-164)

**As a** User, **I want** to customise the payload sent to my callback URL (e.g., include/exclude specific fields), **So that** I can receive only the data I need.

This story covers the implementation of **payload customisation** for webhooks, allowing subscribers to define which fields are included in the payload.

## Acceptance Criteria

- Given a user configures a subscription with a custom payload template, When an event is triggered, Then the system sends a payload with only the selected fields (e.g., `document_id`, `document_name`).
- Given a user selects "Include All Fields", When an event is triggered, Then the system sends the full payload.
- Given a user selects "Custom Fields" and chooses `document_id` and `signer_email`, When an event is triggered, Then the payload includes only those fields.

## Definition of Done

- Users can select fields to include/exclude via UI or API.
- Custom payloads are validated (e.g., selected fields must exist in the event schema).
- The system provides a preview of the custom payload.
- Custom payloads are stored with the subscription.

## Dependencies

- Story 2 (Implement Webhook Subscription Management).
- Story 1 (Define Webhook Events and Payloads).

## INK-165: Provide Tools for Testing and Debugging Webhooks

Parent: [INK-26](https://graphomy.atlassian.net/browse/INK-26) · [Story](https://graphomy.atlassian.net/browse/INK-165)

**As a** Developer, **I want** to test and debug webhook subscriptions before deploying them to production, **So that** I can ensure they work as expected.

This story covers the implementation of **testing and debugging tools** for webhooks, allowing users to simulate events, inspect payloads

---

## Confluence source: FR-016 REST APIs

[Source](https://graphomy.atlassian.net/wiki/spaces/INK/pages/753792/FR-016+REST+APIs), version 2.

# FR-016 REST APIs

## Purpose

Provide programmatic access to core product capabilities so the platform can integrate with external systems and internal services.

This module defines the public and internal API surface for graphsign.ink. It must be reliable enough to support the product UI, external integrations, automation, and self-hosted deployments without forcing callers to depend on the browser experience.

## V1 scope

This module covers the API surface required for product operation, integrations, and basic automation.

The V1 expectation is a stable, tenant-aware REST API that can create, read, update, and list the key product objects, while applying the same permission and audit rules as the UI.

## Primary users

- External integrators
- Document author / sender
- Platform developers
- Self-hosting operators

## What the REST API must do

The REST API must:

- expose core product capabilities programmatically
- respect tenant and role boundaries
- support authenticated access
- provide stable versioned endpoints
- return predictable responses
- support integration and automation use cases
- log significant API activity where appropriate
- align with the same business rules as the application UI

The API should be a first-class product interface, not a thin afterthought around the frontend.

## Functional capabilities

### 1. Create agreements via API

The system must allow agreements to be created programmatically.

Expected behaviour:

- create an agreement workspace from an API request
- support basic metadata and ownership at creation time
- allow the caller to choose a valid starting mode where permitted
- return a stable identifier for the new agreement
- enforce tenant and permission checks before creation

This is important for automation, migration, and system-to-system workflows.

### 2. Read agreement data via API

The system must allow agreement data to be retrieved by authorised callers.

Expected behaviour:

- fetch agreement metadata, status, and relevant related data
- return only what the caller is allowed to see
- support retrieval by identifier and list-style access where appropriate
- reflect current canonical state from the application data model

Read access is the baseline requirement for any integration.

### 3. Update agreements via API

The system must allow permitted updates to be made through the API.

Expected behaviour:

- update supported agreement fields such as metadata or controlled lifecycle values
- reject updates that would violate workflow or approval rules
- preserve auditability for all changes
- respect the same lifecycle restrictions as the UI

The API must not allow a caller to bypass workflow or state protections.

### 4. List templates via API

The system must allow templates to be fetched programmatically.

Expected behaviour:

- list templates visible to the caller
- support filtering by scope, ownership, or status where appropriate
- distinguish templates from agreements in the response model
- keep template retrieval permission-aware and tenant-scoped

This supports template-driven automation and external tools.

### 5. Retrieve audit data via API

The system must allow authorised access to audit-related information.

Expected behaviour:

- expose audit information only to appropriate roles
- support retrieval of relevant events or summaries where allowed
- preserve tenant isolation and data minimisation
- make audit access consistent with the audit trail module

Audit access through API is useful for compliance tools, admin consoles, and integrations.

### 6. Support authentication for API clients

The system must allow API clients to authenticate securely.

Expected behaviour:

- support token-based or otherwise approved authentication methods
- reject unauthenticated requests safely
- distinguish between user-authenticated and service-authenticated access where applicable
- tie API access to tenant and role context

Authentication must be strong enough for external integrators and internal services alike.

### 7. Respect tenant scoping

The system must ensure API requests remain tenant-isolated.

Expected behaviour:

- all API actions are scoped to the caller’s authorised tenant or organisation
- cross-tenant reads or writes are blocked
- tenant context should be enforced in backend logic, not only in route structure
- responses should not leak hidden tenant data through errors or metadata

Tenant scoping is a core security requirement, not a convenience feature.

### 8. Version API endpoints

The system must provide stable versioned endpoints for future evolution.

Expected behaviour:

- API versions should be explicit and discoverable
- future changes should not silently break existing integrations
- versioning should support safe deprecation over time
- major behaviour changes should be isolated to new versions

External consumers need predictable integration behaviour across releases.

### 9. Return predictable responses

The system must keep API behaviour consistent for clients and integrations.

Expected behaviour:

- response shapes should be structured and stable
- success and failure states should be consistent
- validation failures should be understandable and actionable
- pagination, sorting, and filtering should behave consistently where provided

Predictability reduces integration fragility and support burden.

### 10. Log API activity

The system must record API usage in the audit or operational logs where appropriate.

Expected behaviour:

- important API actions should be traceable
- authentication, modification, and sensitive reads should be logged according to policy
- logs should support troubleshooting and compliance review
- logging should not expose secrets or excessive sensitive payload data

The API should leave a meaningful trail without turning logs into a liability.

## Business rules

- API access must respect tenant and role boundaries.
- API actions must be auditable.
- APIs must not expose more information than the UI for the same role.
- Versioned API behavior should remain stable across releases.
- API calls must not bypass workflow, approval, signing, or retention controls.
- Error responses must not leak privileged data.
- Write actions must be permission-checked and state-checked before mutation.
- Public API behaviour should remain compatible with the documented product model.

## Scope and boundary rules

The REST API should cover only product capabilities that are safe and useful to expose programmatically. It should not become a separate shadow application or an alternate business logic path. The API must stay aligned with the same domain rules used by the UI and backend services.

## Acceptance expectations

A Jira story split from this page should normally be able to answer:

- which object type is being accessed
- whether the caller is authenticated and authorised
- whether the request is tenant-scoped
- whether the action is read or write
- what the response shape looks like
- how errors are returned
- whether the action is auditable
- whether the endpoint is versioned

## Developer implementation notes

### API design guidance

Developers should treat the REST API as the canonical integration surface for core product objects. The API should be designed around the domain model rather than around UI screens.

### Versioning guidance

Versioning should be explicit from the beginning. A breaking change should result in a new version or a controlled deprecation path, not silent drift in response shape or semantics.

### Authorization guidance

Every endpoint should apply:

- authentication
- tenant resolution
- permission checks
- object-level state checks
- response filtering

Authorization should be enforced at the backend even if the client already hides controls.

### Response consistency guidance

Responses should be structured enough for programmatic consumption and stable enough for long-lived integrations. Validation and error reporting should be machine-readable and human-readable.

### Logging and audit guidance

Separate operational logs from audit-relevant events where possible, but ensure that significant API actions can be traced back to a caller and tenant. Avoid storing secrets, tokens, or raw sensitive document payloads in logs.

## Related requirements

- FR-011 Audit Trail
- FR-017 Webhooks
- FR-022 Multi-tenancy
- FR-024 Accessibility

## Story-level breakdown

### FR-016.001 Create agreement via API

Allow agreements to be created programmatically.

Acceptance detail:

- API caller can create a valid agreement workspace
- request is checked for tenant and role permissions
- response returns a stable agreement identifier
- create action is audit-relevant and recorded where required

### FR-016.002 Read agreement via API

Allow agreement data to be retrieved by authorised callers.

Acceptance detail:

- caller can fetch agreement details by identifier
- returned data is filtered by access scope
- read response reflects canonical agreement state
- unauthorised fields are omitted

### FR-016.003 Update agreement via API

Allow permitted updates to be made through the API.

Acceptance detail:

- permitted fields can be updated successfully
- invalid state transitions or workflow-breaking edits are rejected
- update is written to the audit trail where required
- response reflects the updated canonical state

### FR-016.004 List templates via API

Allow templates to be fetched programmatically.

Acceptance detail:

- caller can list templates visible to them
- template and agreement objects remain distinct in the API model
- filtering and scoping are respected
- results are returned in a predictable order or pagination scheme

### FR-016.005 Retrieve audit data via API

Allow authorised access to audit-related information.

Acceptance detail:

- only appropriate roles can access audit data
- tenant scope is enforced
- response includes enough context to be useful without overexposing sensitive data
- audit access can be traced or logged where required

### FR-016.006 Support authentication for API clients

Allow API clients to authenticate securely.

Acceptance detail:

- unauthenticated requests are rejected
- authenticated requests carry tenant and role context
- service or user authentication is handled according to policy
- invalid tokens or credentials fail safely

### FR-016.007 Respect tenant scoping

Ensure API requests remain tenant-isolated.

Acceptance detail:

- every request is evaluated within the caller’s tenant scope
- cross-tenant data access is blocked
- tenant isolation applies to reads and writes
- no hidden tenant data leaks through response metadata

### FR-016.008 Version API endpoints

Provide stable versioned endpoints for future evolution.

Acceptance detail:

- API version is explicit in the route or equivalent contract
- older integrations continue to work until deprecation is announced
- breaking changes are isolated to a new version
- versioning strategy is documented for developers

### FR-016.009 Return predictable responses

Keep API behavior consistent for clients and integrations.

Acceptance detail:

- response payloads are stable and documented
- validation errors are consistent and actionable
- success and failure responses are distinguishable
- pagination and sorting behave consistently

### FR-016.010 Log API activity

Record API usage in the audit or operational logs where appropriate.

Acceptance detail:

- significant API actions are logged
- logs do not expose tokens or secrets
- sensitive reads and writes are traceable where required
- logging supports troubleshooting and compliance needs

## Notes for Jira decomposition

This page is intended to support direct Jira ticket creation. For implementation work, split further by:

- API authentication and tenant resolution
- agreement read/write endpoints
- template endpoints
- audit endpoints
- versioning and compatibility policy
- response and error schema
- operational and audit logging

The REST API should be treated as a durable product contract, not as an internal convenience layer.

---

## Confluence source: FR-017 Webhooks

[Source](https://graphomy.atlassian.net/wiki/spaces/INK/pages/1376257/FR-017+Webhooks), version 2.

# FR-017 Webhooks

## Purpose

Push important product events to external systems so customers can automate downstream workflows.

This module is the outbound event delivery layer for graphsign.ink. It must notify external systems when important lifecycle events happen so customers can keep CRM, ERP, compliance, document, and automation tools in sync without polling the API.

## V1 scope

This module covers webhook delivery for core envelope and signing lifecycle events.

The V1 expectation is a reliable tenant-scoped webhook system with subscription management, signed payloads, retry handling, and clear operational visibility.

## Primary users

- External integrator
- Document author / sender
- Self-hosting operator

## What webhooks must do

Webhook delivery must:

- emit events for significant product changes
- allow tenants to configure subscriptions
- deliver signed or verifiable payloads where designed
- retry transient failures
- remain tenant-isolated
- avoid unnecessary sensitive data exposure
- support operational monitoring and troubleshooting

Webhooks should be the push complement to the REST API, not a duplicate API surface.

## Functional capabilities

### 1. Emit lifecycle events

The system must generate webhook events from significant workflow changes.

Expected behaviour:

- create webhook events when important product state changes occur
- tie events to workflow, signing, and admin actions where relevant
- emit events only for meaningful transitions, not for noise
- preserve a reliable event identity for each emitted event

Webhook events are the trigger source for downstream automation.

### 2. Deliver signed event payloads

The system must deliver event payloads with integrity controls where designed.

Expected behaviour:

- payloads should be structured and machine-readable
- delivery should support signing or integrity verification where required
- external systems should be able to trust the payload origin
- payloads should not reveal more than the recipient needs

Signed payloads make it easier for customers to trust event origin and detect tampering.

### 3. Support webhook subscriptions

Tenants must be able to configure which endpoints receive which events.

Expected behaviour:

- subscription configuration is tenant-scoped
- different event types can be subscribed to independently
- endpoint configuration should support enabling and disabling
- subscription changes should be auditable

This lets each customer choose exactly what they want to receive.

### 4. Retry failed webhook deliveries

The system must retry webhook deliveries that fail for transient reasons.

Expected behaviour:

- retry transient failures according to policy
- avoid endless retry loops
- clearly distinguish retryable from terminal failures
- keep retry behaviour consistent across event types

Reliable retry handling is essential because external endpoints are not always available.

### 5. Allow webhook configuration by tenant

Webhook settings must be configurable per tenant.

Expected behaviour:

- each tenant manages its own endpoints and subscriptions
- one tenant’s webhook setup must not affect another’s
- configuration must respect permissions and roles
- tenant-level configuration changes should be logged

Tenant isolation is critical because webhooks often contain customer-specific business events.

### 6. Emit envelope created event

External systems must be notified when an envelope is created.

Expected behaviour:

- create event is emitted after a valid envelope creation action
- event includes enough context for downstream systems to identify the record
- event should not expose draft content unnecessarily
- duplicates should be prevented or clearly handled

This is useful for syncing document records into external systems from the beginning.

### 7. Emit envelope sent event

External systems must be notified when a document is sent for signing.

Expected behaviour:

- emit when the envelope enters the sent state
- event should reflect the authoritative workflow state
- payload should identify the envelope and the relevant tenant
- event timing should be consistent with the workflow engine

This is one of the most important lifecycle milestones for external automation.

### 8. Emit viewed event

External systems must be notified when a recipient opens a document.

Expected behaviour:

- emit when a signing link is opened or a document is viewed where applicable
- event should be clearly distinguished from signing or completion
- event payload should remain privacy-aware
- repeated views should follow the designed event policy

This can be used for tracking engagement or triggering follow-up automation.

### 9. Emit signed event

External systems must be notified when a signing action is completed.

Expected behaviour:

- emit after a valid signing action is accepted
- event should reflect the signer and document context allowed by policy
- signed event should precede or align with sealing/completion orchestration as designed
- duplicate signed events should be avoided

This is the key event for integrations that depend on signature completion.

### 10. Emit completed event

External systems must be notified when a workflow is completed.

Expected behaviour:

- emit once the envelope reaches final completion
- include a stable reference to the completed record
- event should align with audit and sealed output generation
- event should not fire prematurely

Completion events are used to trigger downstream processing such as archiving, billing, or record import.

### 11. Emit declined event

External systems must be notified when a signer declines.

Expected behaviour:

- emit when a decline is recorded as the authoritative action
- include the envelope reference and decline state
- event should make it clear that the document is not completed
- decline reason should be included only where allowed

Decline is a workflow-stopping event and should be unambiguous.

### 12. Track webhook activity

The system must record delivery attempts and failures.

Expected behaviour:

- record queued, sent, succeeded, failed, retried, and terminal failure states where applicable
- make activity available for debugging and support
- preserve enough detail to explain delivery outcomes
- keep logging consistent with tenant and privacy rules

Operational visibility is necessary because webhook failures otherwise become invisible integration problems.

## Business rules

- Webhook delivery must respect tenant boundaries.
- Events should be generated from significant workflow changes.
- Delivery failures should be observable and recoverable.
- Webhook payloads should avoid unnecessary sensitive data.
- A tenant should only receive events they explicitly subscribed to.
- Event delivery should not mutate the underlying business record.
- Duplicate events should be minimized through idempotent design where possible.
- Webhook processing must not block the primary user workflow.

## Event scope alignment

Webhooks should focus on authoritative state transitions such as:

- envelope created
- envelope sent
- viewed
- signed
- completed
- declined
- voided
- expired
- other important lifecycle or admin events where configured

The exact event catalogue should be controlled and versioned so integrations can rely on it.

## Acceptance expectations

A Jira story split from this page should normally be able to answer:

- what event was emitted
- what caused the event
- which tenant received it
- what payload was delivered
- how delivery is retried
- how failures are surfaced
- how subscriptions are managed
- how the event is secured

## Developer implementation notes

### Event emission guidance

Webhook events should come from canonical domain events, not from frontend UI actions. The system should emit an event only after the source-of-truth state change has occurred.

### Delivery pipeline guidance

Developers should treat webhooks as asynchronous work:

- domain event occurs
- webhook event is created
- tenant subscription rules are checked
- payload is generated
- delivery job is queued
- endpoint is called
- result is stored
- retry logic is applied where appropriate

### Payload guidance

Payloads should be structured, versioned, and minimal. The payload should include enough data to identify the event and fetch more detail through the API if necessary, but should not duplicate all sensitive document content by default.

### Security guidance

Webhook delivery should support integrity and authenticity controls such as signed payloads or verifiable headers where designed. Secrets used to validate deliveries must be managed securely and rotated according to policy.

### Idempotency guidance

Because webhook delivery can be retried, event identifiers and delivery identifiers should support deduplication at the receiver side. The platform should avoid emitting logically duplicate events where possible.

### Observability guidance

Operators need to see enough to answer:

- was the event generated
- was it subscribed to
- was it queued
- was it delivered
- did it fail
- was it retried
- is it terminal

## Related requirements

- FR-007 Workflow Engine
- FR-009 Notifications
- FR-016 REST APIs
- FR-011 Audit Trail

## Story-level breakdown

### FR-017.001 Emit envelope created event

Notify external systems when an envelope is created.

Acceptance detail:

- event is emitted after a successful envelope creation
- payload identifies the envelope and tenant
- event is generated from the authoritative domain state
- duplicate emission is prevented or traceable

### FR-017.002 Emit envelope sent event

Notify external systems when a document is sent for signing.

Acceptance detail:

- event fires when the envelope enters the sent state
- payload reflects the current workflow state
- event is not emitted for invalid or aborted sends
- delivery is tracked in webhook activity history

### FR-017.003 Emit viewed event

Notify external systems when a recipient opens a document.

Acceptance detail:

- event records a document view or link open where applicable
- event distinguishes viewing from signing
- privacy boundaries are respected
- repeat views follow the defined event policy

### FR-017.004 Emit signed event

Notify external systems when a signing action is completed.

Acceptance detail:

- event is emitted only after a valid signing action succeeds
- payload identifies the signing context allowed by policy
- signed event aligns with workflow and audit state
- duplicate signed notifications are avoided

### FR-017.005 Emit completed event

Notify external systems when a workflow is completed.

Acceptance detail:

- event is emitted only after final completion
- payload references the completed envelope or record
- event timing matches sealing/completion orchestration
- completion event is auditable and traceable

### FR-017.006 Emit declined event

Notify external systems when a signer declines.

Acceptance detail:

- decline event is emitted after the decline is recorded
- payload indicates non-completion clearly
- decline reason is included only if permitted
- event is available for downstream escalation or cleanup

### FR-017.007 Retry failed deliveries

Allow webhook delivery retries for transient failures.

Acceptance detail:

- transient failures are queued for retry
- retries stop at a configured terminal condition
- delivery attempt history is preserved
- retry handling does not block user operations

### FR-017.008 Manage webhook subscriptions

Allow tenants to configure subscribed endpoints.

Acceptance detail:

- tenants can create, edit, enable, disable, and remove subscriptions where allowed
- subscription scope is tenant-specific
- configuration changes are audit relevant
- invalid endpoints or configurations are rejected safely

### FR-017.009 Secure webhook payloads

Support payload integrity and delivery security.

Acceptance detail:

- payloads are protected by the designed integrity mechanism
- receiver can verify the delivery came from the platform where supported
- secrets are stored and used securely
- payloads avoid leaking unnecessary sensitive data

### FR-017.010 Track webhook activity

Record delivery attempts and failures.

Acceptance detail:

- delivery lifecycle is visible in operational records
- failures can be inspected and retried where appropriate
- activity is tenant-scoped and permission-controlled
- webhook history supports troubleshooting and support

## Notes for Jira decomposition

This page is intended to support direct Jira ticket creation. For implementation work, split further by:

- domain event model and event catalogue
- subscription storage and management
- payload schema and versioning
- asynchronous delivery worker
- retry, backoff, and terminal failure logic
- signing / verification headers and secrets management
- delivery activity UI and API

Webhooks should be implemented as a resilient integration channel built on canonical domain events, not as synchronous callbacks from the UI.
