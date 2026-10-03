import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

/**
 * Creates a PrismaClient configured for Neon serverless (WebSocket).
 * Use this in Cloudflare Workers where TCP sockets are unavailable.
 *
 * @prisma/adapter-neon v6.x expects a PoolConfig object (not a Pool instance).
 * It creates and manages its own Pool internally.
 */
import { neonConfig } from '@neondatabase/serverless';

// Configure Neon driver for robust connection handling:
// - Enable fetch query mode for standard queries to leverage subrequest connection pooling
neonConfig.poolQueryViaFetch = true;

// Cache PrismaClient instances in local development and Node environments to prevent
// repeated connection pool creation, socket exhaustion, and cold-start latency.
const prismaClientCache = new Map<string, PrismaClient>();

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (
    !databaseUrl ||
    typeof databaseUrl !== 'string' ||
    (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://'))
  ) {
    const preview = databaseUrl ? `${String(databaseUrl).substring(0, 15)}...` : 'undefined';
    throw new Error(
      `Invalid DATABASE_URL provided to createPrismaClient: "${preview}". Must be a valid postgresql:// or postgres:// connection string.`,
    );
  }
  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  return new PrismaClient({ adapter } as any);
}

/**
 * Returns a cached PrismaClient instance for non-production environments, or creates
 * a fresh client per-request in production Cloudflare Workers to prevent cross-request I/O collisions.
 */
export function getOrCreatePrismaClient(databaseUrl: string): PrismaClient {
  const isCloudflareProd =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers' &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV === 'production';

  if (!isCloudflareProd) {
    const cached = prismaClientCache.get(databaseUrl);
    if (cached) {
      return cached;
    }
  }

  const client = createPrismaClient(databaseUrl);
  if (!isCloudflareProd) {
    prismaClientCache.set(databaseUrl, client);
  }
  return client;
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
    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
    globalForPrisma.prisma = new PrismaClient({
      adapter: adapter as any,
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return globalForPrisma.prisma;
}

export { PrismaClient };
export type {
  Organisation,
  User,
  AuditLog,
  OrganisationInvitation,
  Team,
  TeamMember,
  CustomRole,
  OrganisationDomain,
  UserOrganisation,
  Agreement,
  AgreementVersion,
  Template,
  TemplateVersion,
  TemplateShare,
} from '@prisma/client';
