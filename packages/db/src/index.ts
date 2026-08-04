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
  // The connection string lives only in the Pool — the adapter owns the connection.
  // Do NOT pass datasourceUrl to PrismaClient: Prisma forbids mixing driver adapters
  // with custom datasource URL options and throws at runtime if you do.
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaNeon(pool as any);
  return new PrismaClient({ adapter } as any);
}

// ── Legacy singleton for backward compatibility (local dev, tests) ──

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Legacy singleton helper for local dev / testing scripts that use process.env.
 * Lazy evaluated to avoid initializing PrismaClient at top-level module load time in Workers.
 */
export function getLegacyPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Cannot initialize PrismaClient.',
      );
    }
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return globalForPrisma.prisma;
}

export { PrismaClient };
export type { Organisation, User, AuditLog } from '@prisma/client';
