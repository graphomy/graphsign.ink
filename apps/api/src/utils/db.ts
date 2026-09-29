import type { PrismaClient } from '@graphsign/db';
import { getOrCreatePrismaClient, getLegacyPrisma } from '@graphsign/db';

/**
 * Retrieves or creates a cached PrismaClient instance for the given database URL.
 * Reuses active clients per isolate / environment to prevent connection pool exhaustion.
 * If c (Hono context) is provided, also caches on c to ensure single-instance per request lifecycle.
 */
export function getDbClient(c?: any, overridePrisma?: PrismaClient): PrismaClient {
  if (overridePrisma) return overridePrisma;

  if (c && typeof c.get === 'function') {
    const contextPrisma = c.get('prisma') as PrismaClient | undefined;
    if (contextPrisma) return contextPrisma;
  }

  const dbUrl = c?.env?.DATABASE_URL || process.env.DATABASE_URL;
  const isValidUrl =
    dbUrl &&
    typeof dbUrl === 'string' &&
    dbUrl.trim() !== '' &&
    (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

  if (!isValidUrl) {
    const legacy = getLegacyPrisma();
    if (c && typeof c.set === 'function') c.set('prisma', legacy);
    return legacy;
  }

  const client = getOrCreatePrismaClient(dbUrl);

  if (c && typeof c.set === 'function') {
    c.set('prisma', client);
  }

  return client;
}
