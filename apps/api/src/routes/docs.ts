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
      { url: 'https://dev-graphsign-api.kunal-f9f.workers.dev', description: 'Development API' },
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
            mimeType: { type: 'string' },
            fileSize: { type: 'integer' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths: {
      '/api/v1/documents': {
        get: {
          summary: 'List documents',
          description:
            'Retrieve paginated list of documents with optional status and metadata filters.',
          responses: {
            '200': { description: 'Successful list response' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          summary: 'Create document',
          description: 'Create a new draft document or agreement from markdown or base64 PDF.',
          responses: {
            '201': { description: 'Document successfully created' },
            '200': { description: 'Idempotent replay of previously created document' },
            '400': { description: 'Invalid payload' },
            '409': { description: 'Idempotency conflict' },
          },
        },
      },
      '/api/v1/documents/{id}': {
        get: {
          summary: 'Get document by ID',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Document found' },
            '404': { description: 'Document not found' },
          },
        },
        put: {
          summary: 'Replace document',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Document updated' },
            '400': { description: 'Invalid input' },
          },
        },
        patch: {
          summary: 'Partially update document',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Document updated' },
          },
        },
        delete: {
          summary: 'Soft-delete document',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '204': { description: 'Document deleted' },
          },
        },
      },
      '/api/v1/webhooks': {
        get: {
          summary: 'List webhook subscriptions',
          responses: { '200': { description: 'List of subscriptions' } },
        },
        post: {
          summary: 'Create webhook subscription',
          responses: { '201': { description: 'Subscription created with one-time secret' } },
        },
      },
      '/api/v1/webhooks/{id}': {
        get: { summary: 'Get webhook subscription details' },
        patch: { summary: 'Update webhook subscription' },
        delete: { summary: 'Delete webhook subscription' },
      },
      '/api/v1/webhooks/{id}/rotate-secret': {
        post: { summary: 'Rotate webhook signing secret with 24-hour grace period' },
      },
      '/api/v1/webhooks/{id}/test': {
        post: { summary: 'Dispatch synthetic test event to webhook endpoint' },
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
  router.get('/', (c) => {
    const html = `<!doctype html>
<html>
  <head>
    <title>GraphSign API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/v1/docs/openapi.json"
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
    return c.html(html);
  });

  return router;
}
