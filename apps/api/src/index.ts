import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRoutes } from './routes/auth.js';
import { createOrganisationRoutes } from './routes/organisations.js';

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
      if (!requestOrigin) return '*';
      if (!allowedOriginSetting || allowedOriginSetting === '*') return requestOrigin;

      const origins = allowedOriginSetting.split(',').map((o) => o.trim());
      if (origins.includes(requestOrigin) || requestOrigin.startsWith('http://localhost:')) {
        return requestOrigin;
      }

      const cleanReq = requestOrigin.replace(/^https?:\/\/(www\.)?/, '');
      const isAllowed = origins.some((o) => o.replace(/^https?:\/\/(www\.)?/, '') === cleanReq);
      if (isAllowed) return requestOrigin;

      return requestOrigin;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-organisation-id'],
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Request ID middleware
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API v1 routes
app.route('/api/v1/auth', createAuthRoutes());
app.route('/api/v1/organisations', createOrganisationRoutes());

// Workers export — no serve() call needed
export default app;
