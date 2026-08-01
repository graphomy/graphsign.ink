import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from '@neondatabase/serverless';

/**
 * Creates a PrismaClient configured for Neon serverless (WebSocket).
 * Use this in Cloudflare Workers where TCP sockets are unavailable.
 *
 * The Neon serverless driver handles connection pooling on its side,
 * so creating a new client per request is lightweight.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool as any);
  return new PrismaClient({ adapter } as any);
}

// ── Legacy singleton for backward compatibility (local dev, tests) ──

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma client singleton.
 * Reuses the same instance across hot-reloads in development.
 * Used by tests and local dev scripts that rely on process.env.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { PrismaClient };
export type { Organisation, User, AuditLog } from '@prisma/client';
