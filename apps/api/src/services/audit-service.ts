import type { PrismaClient } from '@graphsign/db';
import { generateId, sha256 } from '../utils/crypto.js';

/**
 * Audit service — creates immutable, hash-chained audit events.
 * Required by security.md: every business action creates an audit event.
 * Audit logs are append-only and hash-chained (previous_hash → current_hash).
 */
export interface AuditService {
  log(params: AuditLogParams, tx?: any): Promise<void>;
}

export interface AuditLogParams {
  organisationId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class PrismaAuditService implements AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async log(params: AuditLogParams, tx?: any): Promise<void> {
    const client = tx || this.prisma;

    // Serialize append per tenant using transaction advisory lock if inside a transaction
    if (tx && typeof client.$executeRaw === 'function') {
      try {
        await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.organisationId}))`;
      } catch {
        // Fall back if advisory lock is unavailable
      }
    }

    // Retrieve the most recent audit event for this org to chain hashes
    const lastEvent = await client.auditLog.findFirst({
      where: { organisationId: params.organisationId },
      orderBy: { createdAt: 'desc' },
      select: { currentHash: true },
    });

    const previousHash = lastEvent?.currentHash ?? null;
    const id = generateId();
    const timestampDate = new Date();
    const nowIso = timestampDate.toISOString();

    // Hash chain: SHA-256(id + action + resourceType + resourceId + timestamp + previousHash)
    const hashInput = [
      id,
      params.action,
      params.resourceType,
      params.resourceId,
      nowIso,
      previousHash ?? 'GENESIS',
    ].join('|');
    const currentHash = await sha256(hashInput);

    await client.auditLog.create({
      data: {
        id,
        organisationId: params.organisationId,
        userId: params.userId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata ? (params.metadata as any) : undefined,
        previousHash,
        currentHash,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        createdAt: timestampDate,
      },
    });
  }
}
