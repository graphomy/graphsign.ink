import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';
import type { AuditService } from './audit-service.js';

export const PLATFORM_CONFIG_DEFAULTS: Record<string, string> = {
  user_storage_quota_bytes: '262144000', // 250 MB
  max_upload_file_size_bytes: '15728640', // 15 MB
  org_storage_quota_bytes: '5368709120', // 5 GB
  org_max_documents: '1000',
  org_max_users: '50',
};

export class PlatformConfigService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Retrieves a platform config value by key, falling back to system defaults.
   */
  async getConfig(key: string): Promise<string> {
    const item = await this.prisma.platformConfig.findUnique({
      where: { key },
    });
    return item?.value ?? PLATFORM_CONFIG_DEFAULTS[key] ?? '';
  }

  /**
   * Retrieves all platform configs with defaults filled in.
   */
  async getAllConfigs(): Promise<
    Record<
      string,
      { key: string; value: string; defaultValue: string; label: string; description: string }
    >
  > {
    const dbItems = await this.prisma.platformConfig.findMany();
    const dbMap = new Map(dbItems.map((i) => [i.key, i.value]));

    const configDefs = [
      {
        key: 'user_storage_quota_bytes',
        label: 'Per-User Storage Quota (Bytes)',
        description:
          'Maximum storage quota allocated to each individual user (Default: 250 MB = 262,144,000 bytes)',
        defaultValue: PLATFORM_CONFIG_DEFAULTS.user_storage_quota_bytes,
      },
      {
        key: 'max_upload_file_size_bytes',
        label: 'Max PDF Upload Size (Bytes)',
        description:
          'Maximum allowed file size per uploaded PDF/DOCX agreement (Default: 15 MB = 15,728,640 bytes)',
        defaultValue: PLATFORM_CONFIG_DEFAULTS.max_upload_file_size_bytes,
      },
      {
        key: 'org_storage_quota_bytes',
        label: 'Default Organisation Storage Quota (Bytes)',
        description:
          'Default total storage quota assigned to new organisations (Default: 5 GB = 5,368,709,120 bytes)',
        defaultValue: PLATFORM_CONFIG_DEFAULTS.org_storage_quota_bytes,
      },
      {
        key: 'org_max_documents',
        label: 'Default Organisation Max Documents',
        description: 'Default maximum document count per organisation',
        defaultValue: PLATFORM_CONFIG_DEFAULTS.org_max_documents,
      },
      {
        key: 'org_max_users',
        label: 'Default Organisation Max Users',
        description: 'Default maximum user seat count per organisation',
        defaultValue: PLATFORM_CONFIG_DEFAULTS.org_max_users,
      },
    ];

    const result: Record<string, any> = {};
    for (const def of configDefs) {
      result[def.key] = {
        key: def.key,
        value: dbMap.get(def.key) ?? def.defaultValue,
        defaultValue: def.defaultValue,
        label: def.label,
        description: def.description,
      };
    }

    return result;
  }

  /**
   * Updates or creates a platform config value (Super Admin only).
   */
  async updateConfig(
    key: string,
    value: string,
    actorUserId?: string,
  ): Promise<{ key: string; value: string }> {
    const existing = await this.prisma.platformConfig.findUnique({ where: { key } });

    let updated;
    if (existing) {
      updated = await this.prisma.platformConfig.update({
        where: { key },
        data: { value, updatedBy: actorUserId },
      });
    } else {
      updated = await this.prisma.platformConfig.create({
        data: {
          id: generateId(),
          key,
          value,
          updatedBy: actorUserId,
        },
      });
    }

    if (this.auditService && actorUserId) {
      await this.auditService.log({
        organisationId: '00000000-0000-0000-0000-000000000000',
        userId: actorUserId,
        action: 'PLATFORM_CONFIG_UPDATED',
        resourceType: 'platform_config',
        resourceId: updated.id,
        metadata: {
          key,
          oldValue: existing?.value ?? PLATFORM_CONFIG_DEFAULTS[key],
          newValue: value,
        },
      });
    }

    return { key: updated.key, value: updated.value };
  }
}
