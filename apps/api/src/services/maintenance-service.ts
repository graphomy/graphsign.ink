import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';
import type { AuditService } from './audit-service.js';

export interface MaintenanceState {
  isActive: boolean;
  message: string;
  scope: 'platform' | 'tenant' | 'all';
  targetTenantId?: string | null;
  activatedBy?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
}

export class PlatformMaintenanceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Retrieves the current maintenance state.
   */
  async getMaintenanceState(): Promise<MaintenanceState> {
    const current = await this.prisma.platformMaintenance.findFirst({
      orderBy: { activatedAt: 'desc' },
    });

    if (!current) {
      return {
        isActive: false,
        message: 'System operating normally.',
        scope: 'platform',
        targetTenantId: null,
        activatedBy: null,
        activatedAt: null,
        deactivatedAt: null,
      };
    }

    return {
      isActive: current.isActive,
      message: current.message || 'System maintenance in progress. Please check back shortly.',
      scope: (current.scope as 'platform' | 'tenant' | 'all') || 'platform',
      targetTenantId: current.targetTenantId,
      activatedBy: current.activatedBy,
      activatedAt: current.activatedAt ? current.activatedAt.toISOString() : null,
      deactivatedAt: current.deactivatedAt ? current.deactivatedAt.toISOString() : null,
    };
  }

  /**
   * Enables or disables maintenance mode and audits the action.
   */
  async setMaintenanceState(
    input: {
      isActive: boolean;
      message?: string;
      scope?: 'platform' | 'tenant' | 'all';
      targetTenantId?: string;
    },
    actorUserId?: string,
  ): Promise<MaintenanceState> {
    const scope = (input.scope === 'all' ? 'platform' : input.scope) || 'platform';
    const message =
      input.message ||
      (input.isActive
        ? 'System maintenance in progress. Please check back shortly.'
        : 'System operating normally.');

    const now = new Date();
    const existing = await this.prisma.platformMaintenance.findFirst({
      orderBy: { activatedAt: 'desc' },
    });

    let record: any;
    if (existing) {
      record = await this.prisma.platformMaintenance.update({
        where: { id: existing.id },
        data: {
          isActive: input.isActive,
          message,
          scope,
          targetTenantId: input.targetTenantId || null,
          activatedBy: input.isActive ? actorUserId : existing.activatedBy,
          activatedAt: input.isActive ? now : existing.activatedAt,
          deactivatedAt: input.isActive ? null : now,
        },
      });
    } else {
      record = await this.prisma.platformMaintenance.create({
        data: {
          id: generateId(),
          isActive: input.isActive,
          message,
          scope,
          targetTenantId: input.targetTenantId || null,
          activatedBy: input.isActive ? actorUserId : null,
          activatedAt: input.isActive ? now : null,
          deactivatedAt: input.isActive ? null : now,
        },
      });
    }

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId: input.targetTenantId || '00000000-0000-0000-0000-000000000000',
        userId: actorUserId,
        action: input.isActive
          ? 'SUPER_ADMIN_MAINTENANCE_ENABLED'
          : 'SUPER_ADMIN_MAINTENANCE_DISABLED',
        resourceType: 'PlatformMaintenance',
        resourceId: record.id,
        metadata: {
          isActive: input.isActive,
          message,
          scope,
          targetTenantId: input.targetTenantId,
        },
      });
    }

    return {
      isActive: record.isActive,
      message: record.message || message,
      scope: (record.scope as 'platform' | 'tenant') || 'platform',
      targetTenantId: record.targetTenantId,
      activatedBy: record.activatedBy,
      activatedAt: record.activatedAt ? record.activatedAt.toISOString() : null,
      deactivatedAt: record.deactivatedAt ? record.deactivatedAt.toISOString() : null,
    };
  }

  /**
   * Evaluates if maintenance mode is active for a given tenant.
   */
  async isMaintenanceActive(organisationId?: string): Promise<boolean> {
    const state = await this.getMaintenanceState();
    if (!state.isActive) return false;
    if (state.scope === 'platform') return true;
    if (state.scope === 'tenant' && organisationId && state.targetTenantId === organisationId) {
      return true;
    }
    return false;
  }
}
