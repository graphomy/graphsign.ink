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
import { createTrustStoreRoutes } from './routes/trust-store.js';

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
  if (c.env?.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
app.route('/api/v1/search', createSearchRoutes());
app.route('/api/v1/certificates', createCertificateRoutes());
app.route('/api/v1/signing', createSigningRoutes());
app.route('/api/v1/admin/trust-store', createTrustStoreRoutes());

// Public verification routes (No authentication required)
app.route('/verify', createPublicVerifyRoutes());

// Cloud Signature Consortium (CSC v2.2) protocol routes
app.route('/csc/v2', createCscRoutes());

// Workers export — no serve() call needed
export default app;

