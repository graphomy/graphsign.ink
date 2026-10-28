import { Hono } from 'hono';

/**
 * Interactive API Documentation Routes (INK-146, FR-016).
 * Serves OpenAPI specification and interactive UI.
 */
export function createDocsRoutes() {
  const router = new Hono();

  const openApiSpec = {
    openapi: '3.1.0',
    info: {
      title: 'GraphSign REST API',
      version: '1.0.0',
      description:
        'Official REST APIs and Webhook capabilities for the graphsign.ink electronic signature platform.',
    },
    servers: [
      { url: 'https://api.graphsign.ink', description: 'Production API' },
      { url: 'http://localhost:8787', description: 'Local Development' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter user JWT or OAuth2 access token',
        },
      },
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: {
              type: 'string',
              enum: [
                'DRAFT',
                'SENT',
                'IN_PROGRESS',
                'COMPLETED',
                'DECLINED',
                'CANCELLED',
                'EXPIRED',
              ],
            },
            version: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        WebhookSubscription: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'failing', 'disabled'] },
            failureCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiClientBinding: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            clientId: { type: 'string' },
            name: { type: 'string' },
            scopes: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'disabled', 'revoked'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiRequestLog: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            requestId: { type: 'string' },
            method: { type: 'string' },
            routeTemplate: { type: 'string' },
            statusCode: { type: 'integer' },
            durationMs: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/api/v1/auth/login': {
        post: { summary: 'Authenticate user and receive session JWT' },
      },
      '/api/v1/auth/refresh': {
        post: { summary: 'Rotate session tokens' },
      },
      '/api/v1/documents': {
        get: { summary: 'List tenant agreements with state filtering' },
        post: { summary: 'Create a new agreement envelope' },
      },
      '/api/v1/documents/{id}': {
        get: { summary: 'Get agreement details and field manifests' },
        put: { summary: 'Update agreement metadata and recipient lists' },
        delete: { summary: 'Cancel/void an agreement' },
      },
      '/api/v1/documents/{id}/audit': {
        get: { summary: 'Retrieve cryptographically verified audit trail logs' },
      },
      '/api/v1/documents/{id}/verify': {
        get: { summary: 'Public integrity verification of sealed PDF' },
      },
      '/api/v1/organisations/me/api-clients': {
        get: {
          summary: 'List trusted machine API client bindings (OAuth2 Client Credentials)',
          security: [{ BearerAuth: [] }],
        },
        post: {
          summary: 'Register a new trusted machine client binding',
          security: [{ BearerAuth: [] }],
        },
      },
      '/api/v1/organisations/me/api-clients/{id}': {
        patch: {
          summary: 'Update or deactivate machine API client binding',
          security: [{ BearerAuth: [] }],
        },
        delete: {
          summary: 'Revoke and soft-delete an API client binding',
          security: [{ BearerAuth: [] }],
        },
      },
      '/api/v1/organisations/me/api-logs': {
        get: {
          summary: 'Query searchable, redacted API request logs',
          security: [{ BearerAuth: [] }],
        },
      },
      '/api/v1/webhooks': {
        get: {
          summary: 'List registered outbound webhook endpoints',
          security: [{ BearerAuth: [] }],
        },
        post: {
          summary: 'Subscribe external HTTPS endpoint to domain events',
          security: [{ BearerAuth: [] }],
        },
      },
      '/api/v1/webhooks/{id}': {
        get: { summary: 'Get webhook subscription details' },
        patch: { summary: 'Update webhook target URL, events, or filters' },
        delete: { summary: 'Delete a webhook subscription' },
      },
      '/api/v1/webhooks/{id}/test': {
        post: { summary: 'Trigger a manual test delivery with sample payload' },
      },
      '/api/v1/webhooks/{id}/deliveries': {
        get: { summary: 'Inspect recent delivery attempts and responses' },
      },
      '/api/v1/webhooks/{id}/metrics': {
        get: { summary: 'Get delivery metrics or CSV export' },
      },
      '/api/v1/webhook-events': {
        get: { summary: 'List all supported webhook event definitions and sample fixtures' },
      },
      '/api/v1/health': {
        get: { summary: 'Sanitized platform readiness probe' },
      },
    },
  };

  // Serve OpenAPI 3.1 JSON
  router.get('/openapi.json', (c) => c.json(openApiSpec));

  // Serve Interactive Scalar UI
  const serveScalarDocs = (c: any) => {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: data:; img-src 'self' data: https:;",
    );
    const specJson = JSON.stringify(openApiSpec).replace(/</g, '\\u003c');
    const html = `<!doctype html>
<html>
  <head>
    <title>GraphSign API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json">
      ${specJson}
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
    return c.html(html);
  };

  router.get('/', serveScalarDocs);
  router.get('/*', serveScalarDocs);

  return router;
}
