import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRoutes } from './routes/auth.js';
import { createOrganisationRoutes } from './routes/organisations.js';
import { createRoleRoutes } from './routes/roles.js';
import { createUserRoutes } from './routes/users.js';
import { createAgreementRoutes } from './routes/agreements.js';
import { createWorkflowRoutes } from './routes/workflow.js';
import { createSignRoutes } from './routes/sign.js';
import { createTemplateRoutes } from './routes/templates.js';
import { createAdminRoutes } from './routes/admin.js';
import { createSearchRoutes } from './routes/search.js';
import { createCertificateRoutes } from './routes/certificates.js';
import { createSigningRoutes } from './routes/signing.js';
import { createPublicVerifyRoutes } from './routes/verify.js';
import { createCscRoutes } from './routes/csc.js';
import { createFeatureFlagRoutes } from './routes/feature-flags.js';
import { createTrustStoreRoutes } from './routes/trust-store.js';
import { createDocumentRoutes } from './routes/documents.js';
import { createWebhookRoutes } from './routes/webhooks.js';
import { createApiClientRoutes } from './routes/api-clients.js';
import { createApiLogRoutes } from './routes/api-logs.js';
import { createHealthAndMetricsRoutes } from './routes/health.js';
import { createDocsRoutes } from './routes/docs.js';
import { requestLogger } from './middleware/request-logger.js';
import { maintenanceMiddleware } from './middleware/maintenance-middleware.js';

/** Cloudflare Worker environment bindings. */
export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_TOKEN_EXPIRY: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  WEB_URL: string;
  API_URL: string;
  NODE_ENV: string;
  SUPERADMIN_ID: string;
  SIGNING_SERVICE_URL?: string;
  SIGNING_SERVICE_TOKEN?: string;
  TSA_PRIMARY_URL?: string;
  TSA_FALLBACK_URL?: string;
  TSA_FALLBACK2_URL?: string;
};

type Variables = {
  requestId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global error handler (Hono onError hook)
app.onError(errorHandler);

// Global middleware — CORS reads WEB_URL from Worker bindings with dynamic origin matching
app.use('*', async (c, next) => {
  const allowedOriginSetting = c.env?.WEB_URL;
  const corsMiddleware = cors({
    origin: (requestOrigin) => {
      if (!requestOrigin) return '';

      const isLocal =
        requestOrigin.startsWith('http://localhost:') ||
        requestOrigin.startsWith('http://127.0.0.1:') ||
        requestOrigin.startsWith('http://192.168.') ||
        requestOrigin.startsWith('http://10.') ||
        requestOrigin.startsWith('http://172.') ||
        requestOrigin.includes('.local:');

      if (isLocal) {
        return requestOrigin;
      }

      if (!allowedOriginSetting) {
        return '';
      }

      const origins = allowedOriginSetting.split(',').map((o) => o.trim());
      if (origins.includes(requestOrigin)) {
        return requestOrigin;
      }

      const cleanReq = requestOrigin.replace(/^https?:\/\/(www\.)?/, '');
      const isAllowed = origins.some((o) => o.replace(/^https?:\/\/(www\.)?/, '') === cleanReq);
      if (isAllowed) return requestOrigin;

      return '';
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-organisation-id'],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Security Response Headers (TECH-08) & Request ID Tracing (CQ-02)
app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; frame-ancestors 'none'; object-src 'none';",
  );
  if (c.env?.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Redacted API Request Logging (INK-152, FR-016.010)
app.use('/api/*', requestLogger());

// Maintenance mode write guard (FR-015)
app.use('/api/*', maintenanceMiddleware());

// API Documentation & OpenAPI 3.1 Spec (INK-146, FR-016)
app.route('/api/v1/docs', createDocsRoutes());

// Public Health & Prometheus Metrics (INK-153, FR-016.010)
app.route('/api/v1', createHealthAndMetricsRoutes());

// API v1 routes
app.route('/api/v1/auth', createAuthRoutes());
app.route('/api/v1/organisations', createOrganisationRoutes());
app.route('/api/v1/roles', createRoleRoutes());
app.route('/api/v1/users', createUserRoutes());
app.route('/api/v1/agreements', createAgreementRoutes());
app.route('/api/v1/agreements', createWorkflowRoutes());
app.route('/api/v1/sign', createSignRoutes());
app.route('/api/v1/templates', createTemplateRoutes());
app.route('/api/v1/admin', createAdminRoutes());
app.route('/api/v1/feature-flags', createFeatureFlagRoutes());
app.route('/api/v1/search', createSearchRoutes());
app.route('/api/v1/certificates', createCertificateRoutes());
app.route('/api/v1/signing', createSigningRoutes());
app.route('/api/v1/admin/trust-store', createTrustStoreRoutes());

// REST Documents API (INK-147, INK-150: /api/v1, /api/v2, default alias /api/documents)
const documentRoutes = createDocumentRoutes();
app.route('/api/v1/documents', documentRoutes);
app.route('/api/v2/documents', documentRoutes);
app.route('/api/documents', documentRoutes);

// Webhook Subscriptions & Deliveries API (INK-156 - INK-165)
app.route('/api/v1/webhooks', createWebhookRoutes());

// Machine API Client Bindings (INK-148, FR-016.006)
app.route('/api/v1/organisations/me/api-clients', createApiClientRoutes());

// Searchable Redacted API Request Logs (INK-152, FR-016.010)
app.route('/api/v1/organisations/me/api-logs', createApiLogRoutes());

// Public verification routes (No authentication required)
app.route('/verify', createPublicVerifyRoutes());
app.route('/api/v1/verify', createPublicVerifyRoutes());

// Cloud Signature Consortium (CSC v2.2) protocol routes
app.route('/csc/v2', createCscRoutes());

// API Versioning guard: return 404 with structured error for unsupported versions (INK-150)
app.all('/api/:version/*', (c) => {
  const version = c.req.param('version');
  if (version && version.startsWith('v') && version !== 'v1' && version !== 'v2') {
    return c.json(
      {
        error: {
          code: 'VERSION_NOT_SUPPORTED',
          message: `API version ${version} is not supported`,
          requestId: c.get('requestId') || crypto.randomUUID(),
        },
      },
      404,
    );
  }
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        requestId: c.get('requestId') || crypto.randomUUID(),
      },
    },
    404,
  );
});

// Workers export — no serve() call needed
export default app;
