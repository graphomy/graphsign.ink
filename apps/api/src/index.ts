import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { prisma } from '@graphsign/db';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthRoutes } from './routes/auth.js';
import { createMailerService } from './services/mailer-service.js';
import { PrismaAuditService } from './services/audit-service.js';

type Variables = {
  requestId: string;
};

const app = new Hono<{ Variables: Variables }>();

// Global error handler (Hono onError hook)
app.onError(errorHandler);

// Global middleware
app.use('*', cors({
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
}));

// Request ID middleware
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API v1 routes
const mailer = createMailerService();
const audit = new PrismaAuditService(prisma);

const authRoutes = createAuthRoutes({ prisma, mailer, audit });
app.route('/api/v1/auth', authRoutes);

// Start server
const port = Number(process.env.PORT ?? 8787);
console.log(`graphsign.ink API starting on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

export default app;
