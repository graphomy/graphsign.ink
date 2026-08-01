import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRoutes } from './routes/auth.js';

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

// Global middleware — CORS reads WEB_URL from Worker bindings
app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.WEB_URL ?? 'http://localhost:3000',
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

// Workers export — no serve() call needed
export default app;
