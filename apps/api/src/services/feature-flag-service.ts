import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';
import type { AuditService } from './audit-service.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

export interface FeatureFlagItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  tenantOverrides: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export class FeatureFlagService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Lists all feature flags.
   */
  async listFlags(): Promise<FeatureFlagItem[]> {
    const flags = await this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });

    return flags.map((f) => ({
      id: f.id,
      key: f.key,
      name: f.name,
      description: f.description,
      isEnabled: f.isEnabled,
      tenantOverrides: (f.tenantOverrides as Record<string, boolean>) || {},
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));
  }

  /**
   * Retrieves a single feature flag by key.
   */
  async getFlag(key: string): Promise<FeatureFlagItem> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) {
      throw new NotFoundError(`Feature flag '${key}' not found.`);
    }

    return {
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description,
      isEnabled: flag.isEnabled,
      tenantOverrides: (flag.tenantOverrides as Record<string, boolean>) || {},
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }

  /**
   * Creates a new feature flag.
   */
  async createFlag(
    input: { key: string; name: string; description?: string; isEnabled?: boolean },
    actorUserId?: string,
  ): Promise<FeatureFlagItem> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: input.key } });
    if (existing) {
      throw new BadRequestError(`Feature flag '${input.key}' already exists.`);
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        id: generateId(),
        key: input.key,
        name: input.name,
        description: input.description,
        isEnabled: input.isEnabled ?? false,
        tenantOverrides: {},
      },
    });

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId: '00000000-0000-0000-0000-000000000000',
        userId: actorUserId,
        action: 'SUPER_ADMIN_FEATURE_FLAG_CREATED',
        resourceType: 'FeatureFlag',
        resourceId: flag.id,
        metadata: { key: flag.key, isEnabled: flag.isEnabled },
      });
    }

    return {
      id: flag.id,
      key: flag.key,
      name: flag.name,
      description: flag.description,
      isEnabled: flag.isEnabled,
      tenantOverrides: {},
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }

  /**
   * Updates an existing feature flag.
   */
  async updateFlag(
    key: string,
    input: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      tenantOverrides?: Record<string, boolean>;
    },
    actorUserId?: string,
  ): Promise<FeatureFlagItem> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundError(`Feature flag '${key}' not found.`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { key },
      data: {
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        isEnabled: input.isEnabled !== undefined ? input.isEnabled : existing.isEnabled,
        tenantOverrides: (input.tenantOverrides !== undefined
          ? input.tenantOverrides
          : existing.tenantOverrides) as any,
      },
    });

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId: '00000000-0000-0000-0000-000000000000',
        userId: actorUserId,
        action: 'SUPER_ADMIN_FEATURE_FLAG_UPDATED',
        resourceType: 'FeatureFlag',
        resourceId: updated.id,
        metadata: {
          key,
          from: { isEnabled: existing.isEnabled },
          to: { isEnabled: updated.isEnabled },
        },
      });
    }

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      isEnabled: updated.isEnabled,
      tenantOverrides: (updated.tenantOverrides as Record<string, boolean>) || {},
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Deletes a feature flag.
   */
  async deleteFlag(key: string, actorUserId?: string): Promise<void> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundError(`Feature flag '${key}' not found.`);
    }

    await this.prisma.featureFlag.delete({ where: { key } });

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId: '00000000-0000-0000-0000-000000000000',
        userId: actorUserId,
        action: 'SUPER_ADMIN_FEATURE_FLAG_DELETED',
        resourceType: 'FeatureFlag',
        resourceId: existing.id,
        metadata: { key },
      });
    }
  }

  /**
   * Sets or clears a tenant-specific feature flag override.
   */
  async setTenantOverride(
    key: string,
    organisationId: string,
    isEnabled: boolean | null,
    actorUserId?: string,
  ): Promise<FeatureFlagItem> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundError(`Feature flag '${key}' not found.`);
    }

    const currentOverrides = (existing.tenantOverrides as Record<string, boolean>) || {};
    const newOverrides = { ...currentOverrides };

    if (isEnabled === null) {
      delete newOverrides[organisationId];
    } else {
      newOverrides[organisationId] = isEnabled;
    }

    const updated = await this.prisma.featureFlag.update({
      where: { key },
      data: { tenantOverrides: newOverrides },
    });

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId,
        userId: actorUserId,
        action: 'SUPER_ADMIN_FEATURE_FLAG_OVERRIDE_SET',
        resourceType: 'FeatureFlag',
        resourceId: updated.id,
        metadata: { key, organisationId, override: isEnabled },
      });
    }

    return {
      id: updated.id,
      key: updated.key,
      name: updated.name,
      description: updated.description,
      isEnabled: updated.isEnabled,
      tenantOverrides: newOverrides,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Evaluates all flags for a tenant.
   * Priority: Tenant override if defined, else global isEnabled.
   */
  async evaluateFlagsForTenant(organisationId?: string): Promise<Record<string, boolean>> {
    const flags = await this.prisma.featureFlag.findMany();
    const result: Record<string, boolean> = {};

    for (const flag of flags) {
      const overrides = (flag.tenantOverrides as Record<string, boolean>) || {};
      if (organisationId && typeof overrides[organisationId] === 'boolean') {
        result[flag.key] = overrides[organisationId];
      } else {
        result[flag.key] = flag.isEnabled;
      }
    }

    return result;
  }
}
