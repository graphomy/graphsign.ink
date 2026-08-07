import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

/**
 * Creates a PrismaClient configured for Neon serverless (WebSocket).
 * Use this in Cloudflare Workers where TCP sockets are unavailable.
 *
 * @prisma/adapter-neon v6.x expects a PoolConfig object (not a Pool instance).
 * It creates and manages its own Pool internally.
 */
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
} from '@prisma/client';
